from django.contrib import admin

from .models import DeviceToken, NotificationPreference, NotificationRecord


@admin.register(NotificationRecord)
class NotificationRecordAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "batch", "days_before", "expiry_date", "scheduled_for", "status", "sent_at"]
    list_filter = ["status", "days_before"]
    search_fields = ["idempotency_key", "user__email"]


admin.site.register(NotificationPreference)


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "platform", "device_name", "is_active", "last_seen_at"]
