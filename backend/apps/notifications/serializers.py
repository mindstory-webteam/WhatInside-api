from rest_framework import serializers

from .models import ALLOWED_OFFSETS, DeviceToken, NotificationPreference, NotificationRecord


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    days_before_expiry = serializers.ListField(
        child=serializers.ChoiceField(choices=ALLOWED_OFFSETS), allow_empty=True,
        help_text="Any of 7, 3, 1, 0 (0 = on the expiry date)")
    delivery_methods = serializers.ListField(child=serializers.ChoiceField(choices=["local", "push"]),
                                             allow_empty=False)
    reminder_hour = serializers.IntegerField(min_value=0, max_value=23)

    class Meta:
        model = NotificationPreference
        fields = ["enabled", "days_before_expiry", "delivery_methods", "reminder_hour", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_days_before_expiry(self, value):
        return sorted(set(value), reverse=True)

    def validate_delivery_methods(self, value):
        return sorted(set(value))


class NotificationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationRecord
        fields = ["id", "household", "batch", "notification_type", "days_before", "expiry_date", "scheduled_for",
                  "status", "title", "body", "sent_at", "read_at", "created_at"]
        read_only_fields = fields


class DeviceTokenSerializer(serializers.ModelSerializer):
    token = serializers.RegexField(r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-]+\]$", max_length=255)

    class Meta:
        model = DeviceToken
        fields = ["id", "token", "platform", "device_name", "is_active", "created_at", "last_seen_at"]
        read_only_fields = ["id", "is_active", "created_at", "last_seen_at"]
        extra_kwargs = {"token": {"validators": []}}
