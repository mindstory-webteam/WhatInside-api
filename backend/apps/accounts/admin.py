from django.contrib import admin

from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["email", "name", "preferred_language", "timezone", "is_active", "created_at"]
    search_fields = ["email", "name"]
    exclude = ["password"]
