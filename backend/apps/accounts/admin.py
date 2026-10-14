from django.contrib import admin

from .models import PhoneOTP, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["phone", "email", "name", "preferred_language", "timezone", "is_active", "created_at"]
    search_fields = ["phone", "email", "name"]
    exclude = ["password"]


@admin.register(PhoneOTP)
class PhoneOTPAdmin(admin.ModelAdmin):
    """Codes are stored hashed — this view is for spotting abuse, not reading codes."""

    list_display = ["phone", "purpose", "created_at", "expires_at", "attempts", "consumed_at"]
    list_filter = ["purpose"]
    search_fields = ["phone"]
    readonly_fields = ["phone", "purpose", "code_hash", "expires_at", "attempts", "consumed_at", "created_at"]
