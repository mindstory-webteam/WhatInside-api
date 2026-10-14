from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils.timezone import now as tz_now

from apps.households.models import validate_timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    """Accounts are identified by mobile number. Email is optional (older accounts
    signed up with email and can still sign in with it)."""

    def _create_user(self, phone=None, password=None, email=None, **extra):
        from .phone import normalize_phone

        if not phone and not email:
            raise ValueError("A mobile number is required")
        phone = normalize_phone(phone) if phone else None
        email = self.normalize_email(email).lower() if email else None
        user = self.model(phone=phone, email=email, **extra)
        user.set_password(password)  # Django's configured password hasher
        user.save(using=self._db)
        return user

    def create_user(self, phone=None, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(phone, password, **extra)

    def create_superuser(self, phone=None, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True)
        return self._create_user(phone, password, **extra)

    def get_by_natural_key(self, username):
        from .phone import InvalidPhone, normalize_phone

        if username and "@" in username:
            return self.get(email__iexact=username.strip())
        try:
            return self.get(phone=normalize_phone(username))
        except InvalidPhone:
            raise self.model.DoesNotExist from None


class Language(models.TextChoices):
    ENGLISH = "en", "English"
    MALAYALAM = "ml", "Malayalam"


class User(AbstractBaseUser, PermissionsMixin):
    phone = models.CharField(max_length=16, unique=True, null=True, blank=True,
                             help_text="Mobile number in E.164 format, e.g. +919876543210")
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    email = models.EmailField(unique=True, null=True, blank=True)
    name = models.CharField(max_length=120)
    preferred_language = models.CharField(max_length=8, choices=Language.choices, default=Language.ENGLISH)
    timezone = models.CharField(max_length=64, default="Asia/Kolkata", validators=[validate_timezone])
    date_format = models.CharField(max_length=16, default="DD/MM/YYYY",
                                   choices=[("DD/MM/YYYY", "DD/MM/YYYY"), ("MM/DD/YYYY", "MM/DD/YYYY"),
                                            ("YYYY-MM-DD", "YYYY-MM-DD")])
    unit_system = models.CharField(max_length=8, default="metric",
                                   choices=[("metric", "Metric"), ("imperial", "Imperial")])
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=tz_now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    def save(self, *args, **kwargs):
        self.email = self.email or None  # store "" as NULL so the unique index allows many blanks
        self.phone = self.phone or None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.phone or self.email or f"user {self.pk}"


class OtpPurpose(models.TextChoices):
    REGISTER = "register", "Register"
    RESET = "reset", "Password reset"


class PhoneOTP(models.Model):
    """A one-time SMS code. Only a keyed hash of the code is stored."""

    phone = models.CharField(max_length=16, db_index=True)
    purpose = models.CharField(max_length=16, choices=OtpPurpose.choices)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["phone", "purpose", "-created_at"])]

    def __str__(self):
        return f"{self.purpose} code for {self.phone}"
