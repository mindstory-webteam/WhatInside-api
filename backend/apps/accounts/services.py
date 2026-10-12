import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.households.models import ROLE_RANK, HouseholdMembership, MembershipStatus, Role

from .models import User

logger = logging.getLogger(__name__)


def revoke_all_tokens(user: User) -> None:
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


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
