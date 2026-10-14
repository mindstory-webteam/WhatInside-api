import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.households.models import ROLE_RANK, HouseholdMembership, MembershipStatus, Role

from apps.core.exceptions import DomainError

from .models import OtpPurpose, PhoneOTP, User
from .sms import SmsError, send_otp_sms

logger = logging.getLogger(__name__)


def revoke_all_tokens(user: User) -> None:
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class OtpRateLimited(DomainError):
    status_code = 429
    default_code = "otp_rate_limited"


class OtpSendFailed(DomainError):
    status_code = 503
    default_code = "sms_failed"


def _hash_code(phone: str, purpose: str, code: str) -> str:
    msg = f"{phone}:{purpose}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def request_otp(phone: str, purpose: str) -> dict:
    """Create and SMS a one-time code. ``phone`` must already be normalised.

    * register: refuses numbers that already have an account.
    * reset: silently does nothing for unknown numbers (no account enumeration).
    Returns ``{"sent_to": masked, "resend_in": seconds, "dev_code"?: code}``.
    """
    from .phone import mask_phone

    now = timezone.now()
    result = {"sent_to": mask_phone(phone), "resend_in": settings.OTP_RESEND_SECONDS,
              "expires_in": settings.OTP_TTL_SECONDS}
    if purpose == OtpPurpose.REGISTER and User.objects.filter(phone=phone).exists():
        raise DomainError("This mobile number already has an account. Sign in instead.", code="phone_taken")
    if purpose == OtpPurpose.RESET and not User.objects.filter(phone=phone, is_active=True).exists():
        return result

    recent = PhoneOTP.objects.filter(phone=phone, purpose=purpose)
    last = recent.order_by("-created_at").first()
    if last and (now - last.created_at).total_seconds() < settings.OTP_RESEND_SECONDS:
        wait = int(settings.OTP_RESEND_SECONDS - (now - last.created_at).total_seconds()) + 1
        raise OtpRateLimited(f"Please wait {wait} seconds before asking for a new code.")
    if recent.filter(created_at__gte=now - timedelta(hours=1)).count() >= settings.OTP_MAX_PER_HOUR:
        raise OtpRateLimited("Too many codes requested. Please try again in an hour.")

    code = "".join(secrets.choice("0123456789") for _ in range(settings.OTP_LENGTH))
    with transaction.atomic():
        recent.filter(consumed_at__isnull=True).update(consumed_at=now)  # older codes stop working
        PhoneOTP.objects.create(phone=phone, purpose=purpose, code_hash=_hash_code(phone, purpose, code),
                                expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS))
    try:
        send_otp_sms(phone, code, purpose)
    except SmsError as exc:
        raise OtpSendFailed(str(exc)) from exc
    if settings.OTP_DEBUG_RETURN_CODE:
        result["dev_code"] = code
    return result


def verify_otp(phone: str, purpose: str, code: str) -> None:
    """Consume the live code for ``phone`` or raise a DomainError.

    Wrong guesses are committed even though we raise afterwards, so the attempt
    limit really holds (the error is raised outside the transaction)."""
    now = timezone.now()
    error = None
    with transaction.atomic():
        otp = (PhoneOTP.objects.select_for_update()
               .filter(phone=phone, purpose=purpose, consumed_at__isnull=True).order_by("-created_at").first())
        if not otp or otp.expires_at <= now:
            error = DomainError("This code has expired. Ask for a new one.", code="otp_expired")
        elif otp.attempts >= settings.OTP_MAX_ATTEMPTS:
            error = DomainError("Too many wrong attempts. Ask for a new code.", code="otp_locked")
        elif not hmac.compare_digest(otp.code_hash, _hash_code(phone, purpose, (code or "").strip())):
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            left = settings.OTP_MAX_ATTEMPTS - otp.attempts
            error = DomainError(f"Incorrect code. {left} attempt{'s' if left != 1 else ''} left." if left
                                else "Too many wrong attempts. Ask for a new code.", code="otp_invalid")
        else:
            otp.consumed_at = now
            otp.save(update_fields=["consumed_at"])
    if error:
        raise error


def register_with_phone(*, phone: str, otp: str, name: str, password: str, **extra) -> User:
    """Password/name are validated by the serializer *before* this, so a valid code is
    never burnt by a weak password."""
    if User.objects.filter(phone=phone).exists():
        raise DomainError("This mobile number already has an account. Sign in instead.", code="phone_taken")
    verify_otp(phone, OtpPurpose.REGISTER, otp)
    user = User.objects.create_user(phone=phone, password=password, name=name, **extra)
    user.phone_verified_at = timezone.now()
    user.save(update_fields=["phone_verified_at"])
    return user


def reset_password_with_otp(*, phone: str, otp: str, new_password: str) -> None:
    from django.contrib.auth import password_validation

    user = User.objects.filter(phone=phone, is_active=True).first()
    if user:
        password_validation.validate_password(new_password, user)  # before using up the code
    verify_otp(phone, OtpPurpose.RESET, otp)
    if not user:  # no code is ever issued for unknown numbers; kept for safety
        raise DomainError("This code has expired. Ask for a new one.", code="otp_expired")
    user.set_password(new_password)
    user.phone_verified_at = user.phone_verified_at or timezone.now()
    user.save(update_fields=["password", "phone_verified_at", "updated_at"])
    revoke_all_tokens(user)


def send_password_reset(email: str) -> None:
    """Always succeeds silently so the endpoint cannot be used to enumerate accounts."""
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if not user:
        return
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.PASSWORD_RESET_URL}?uid={uid}&token={token}"
    send_mail(
        subject="Reset your WhatInside password",
        message=(
            f"Hi {user.name},\n\nUse this link to reset your password:\n{link}\n\n"
            f"Or enter these values in the app:\nCode: {uid}\nToken: {token}\n\n"
            "If you didn't request this, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )
    logger.info("Password reset email sent", extra={"user_id": user.pk})


def confirm_password_reset(uid: str, token: str, new_password: str) -> bool:
    from django.contrib.auth import password_validation

    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return False
    if not default_token_generator.check_token(user, token):
        return False
    password_validation.validate_password(new_password, user)
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    revoke_all_tokens(user)  # sign out every device
    return True


@transaction.atomic
def delete_account(user: User) -> None:
    """Delete a user and handle their household data.

    * Households the user owns with other active members are transferred to the
      highest-ranked, longest-standing member.
    * Households where the user is the only member are deleted with all their
      products, batches, events, shopping items and notification records.
    * All refresh tokens are revoked before the row is removed.
    """
    for household in list(user.owned_households.all()):
        successors = sorted(
            HouseholdMembership.objects.filter(household=household, status=MembershipStatus.ACTIVE)
            .exclude(user=user),
            key=lambda m: (-ROLE_RANK[m.role], m.joined_at),
        )
        if successors:
            successor = successors[0]
            successor.role = Role.OWNER
            successor.save(update_fields=["role"])
            household.owner = successor.user
            household.save(update_fields=["owner", "updated_at"])
        else:
            household.delete()
    revoke_all_tokens(user)
    user.delete()
