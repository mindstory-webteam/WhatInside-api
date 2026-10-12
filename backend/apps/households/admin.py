from django.contrib import admin

from .models import Household, HouseholdInvitation, HouseholdMembership


class MembershipInline(admin.TabularInline):
    model = HouseholdMembership
    extra = 0
    raw_id_fields = ["user"]


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "owner", "timezone", "created_at"]
    search_fields = ["name", "owner__email"]
    inlines = [MembershipInline]


@admin.register(HouseholdInvitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ["id", "household", "email", "role", "expires_at", "accepted_at", "revoked"]
