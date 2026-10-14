from django.contrib.auth import password_validation
from django.contrib.auth.models import update_last_login
from rest_framework import exceptions, serializers
from rest_framework_simplejwt.tokens import RefreshToken

from apps.households.models import validate_timezone

from .models import Language, OtpPurpose, User
from .phone import InvalidPhone, normalize_phone


class PhoneField(serializers.CharField):
    """Accepts "98765 43210", "+91 98765-43210", … and returns "+919876543210"."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 24)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        try:
            return normalize_phone(super().to_internal_value(data))
        except InvalidPhone as exc:
            raise serializers.ValidationError(str(exc)) from exc


class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "phone", "email", "name", "preferred_language", "timezone", "date_format", "unit_system",
                  "created_at", "updated_at"]
        read_only_fields = ["id", "phone", "created_at", "updated_at"]

    def validate_timezone(self, value):
        validate_timezone(value)
        return value

    def validate_email(self, value):
        value = (value or "").lower().strip() or None
        if value and User.objects.filter(email__iexact=value).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("Another account already uses this email.")
        return value


def tokens_for(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    update_last_login(None, user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": UserSerializer(user).data}


class OtpRequestSerializer(serializers.Serializer):
    phone = PhoneField()
    purpose = serializers.ChoiceField(choices=OtpPurpose.choices)


class OtpResponseSerializer(serializers.Serializer):
    sent_to = serializers.CharField()
    resend_in = serializers.IntegerField()
    expires_in = serializers.IntegerField()
    dev_code = serializers.CharField(required=False, help_text="Only when OTP_DEBUG_RETURN_CODE is on (testing).")


class RegisterSerializer(serializers.Serializer):
    """Step 2 of sign-up: the SMS code plus profile details."""

    phone = PhoneField()
    otp = serializers.CharField(max_length=8)
    name = serializers.CharField(max_length=120)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    preferred_language = serializers.ChoiceField(choices=Language.choices, required=False)
    timezone = serializers.CharField(required=False, max_length=64)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter your name.")
        return value

    def validate_timezone(self, value):
        validate_timezone(value)
        return value

    def validate(self, attrs):
        candidate = User(phone=attrs.get("phone"), name=attrs.get("name"))
        password_validation.validate_password(attrs["password"], candidate)
        return attrs


class LoginSerializer(serializers.Serializer):
    """Mobile number + password. ``email`` is still accepted for accounts created before
    mobile sign-up existed."""

    phone = serializers.CharField(required=False, allow_blank=True)
    email = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = (attrs.get("phone") or attrs.get("email") or "").strip()
        if not identifier:
            raise serializers.ValidationError({"phone": "Enter your mobile number."})
        try:
            user = User.objects.get_by_natural_key(identifier)
        except User.DoesNotExist:
            user = None
        if user is None:
            User().set_password(attrs["password"])  # equalise timing with a real check
        if user is None or not user.check_password(attrs["password"]) or not user.is_active:
            raise exceptions.AuthenticationFailed("Mobile number or password is incorrect.", code="invalid_credentials")
        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    """Send a reset code by SMS (``phone``) or, for old email accounts, a link (``email``)."""

    phone = PhoneField(required=False)
    email = serializers.EmailField(required=False)

    def validate(self, attrs):
        if not attrs.get("phone") and not attrs.get("email"):
            raise serializers.ValidationError({"phone": "Enter your mobile number."})
        return attrs


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Either ``phone`` + ``otp`` (SMS code) or ``uid`` + ``token`` (email link)."""

    phone = PhoneField(required=False)
    otp = serializers.CharField(required=False, max_length=8)
    uid = serializers.CharField(required=False)
    token = serializers.CharField(required=False)
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if not ((attrs.get("phone") and attrs.get("otp")) or (attrs.get("uid") and attrs.get("token"))):
            raise serializers.ValidationError({"otp": "Enter the code we sent to your phone."})
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        password_validation.validate_password(attrs["new_password"], user)
        return attrs


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Password is incorrect.")
        return value


class TokenPairResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserSerializer()
