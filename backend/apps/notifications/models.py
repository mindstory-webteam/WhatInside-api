from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

ALLOWED_OFFSETS = (7, 3, 1, 0)


def default_offsets():
    return [7, 3, 1, 0]


def default_methods():
    return ["local"]


def validate_offsets(value):
    if not isinstance(value, list) or any(v not in ALLOWED_OFFSETS for v in value):
        raise ValidationError(f"days_before_expiry must be a list containing only {ALLOWED_OFFSETS}.")


def validate_methods(value):
    if not isinstance(value, list) or any(v not in ("local", "push") for v in value):
        raise ValidationError("delivery_methods must be a list of 'local' and/or 'push'.")


class NotificationPreference(models.Model):
    """Per-user reminder settings. Times are interpreted in each household's timezone."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="notification_preference")
    enabled = models.BooleanField(default=True)
    days_before_expiry = models.JSONField(default=default_offsets, validators=[validate_offsets])
    delivery_methods = models.JSONField(default=default_methods, validators=[validate_methods])
    reminder_hour = models.PositiveSmallIntegerField(default=9, help_text="Local hour (0-23) to send reminders.")
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if not 0 <= self.reminder_hour <= 23:
            raise ValidationError({"reminder_hour": "Must be between 0 and 23."})

    @classmethod
    def for_user(cls, user):
        pref, _ = cls.objects.get_or_create(user=user)
        return pref


class DeviceToken(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    token = models.CharField(max_length=255, unique=True, help_text="Expo push token")
    platform = models.CharField(max_length=16, choices=[("ios", "iOS"), ("android", "Android"), ("web", "Web")])
    device_name = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["user", "is_active"])]


class DeliveryStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent (push)"
    LOCAL_ONLY = "local_only", "Device reminder only"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled"
    SKIPPED = "skipped", "Skipped"


class NotificationRecord(models.Model):
    """One reminder occurrence. ``idempotency_key`` is unique, so the same
    batch + user + offset + expiry date can never produce two notifications."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    household = models.ForeignKey("households.Household", on_delete=models.CASCADE, related_name="notifications")
    batch = models.ForeignKey("inventory.InventoryBatch", null=True, on_delete=models.SET_NULL,
                              related_name="notifications")
    notification_type = models.CharField(max_length=32, default="expiry_reminder")
    days_before = models.SmallIntegerField()
    expiry_date = models.DateField()
    scheduled_for = models.DateTimeField()
    status = models.CharField(max_length=16, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500)
    provider_id = models.CharField(max_length=255, blank=True)
    error = models.CharField(max_length=500, blank=True)
    idempotency_key = models.CharField(max_length=128, unique=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-scheduled_for"]
        indexes = [
            models.Index(fields=["status", "scheduled_for"]),
            models.Index(fields=["user", "scheduled_for"]),
            models.Index(fields=["batch", "status"]),
        ]
