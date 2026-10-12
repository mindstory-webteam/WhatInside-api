from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils.timezone import now as tz_now

from apps.households.models import validate_timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)  # Django's configured password hasher
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True)
        return self._create_user(email, password, **extra)


class Language(models.TextChoices):
    ENGLISH = "en", "English"
    MALAYALAM = "ml", "Malayalam"


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
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

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    def __str__(self):
        return self.email
