import secrets
import zoneinfo
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def validate_timezone(value):
    if value not in zoneinfo.available_timezones():
        raise ValidationError(f"'{value}' is not a valid IANA timezone.")


class Household(models.Model):
    name = models.CharField(max_length=120)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_households")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata", validators=[validate_timezone])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return self.name

    @property
    def tzinfo(self):
        return zoneinfo.ZoneInfo(self.timezone)

    def local_today(self):
        """Today's date in the household's timezone — basis for all expiry maths."""
        return timezone.now().astimezone(self.tzinfo).date()


class Role(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Administrator"
    MEMBER = "member", "Member"


ROLE_RANK = {Role.MEMBER: 1, Role.ADMIN: 2, Role.OWNER: 3}


class MembershipStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    REMOVED = "removed", "Removed"
    LEFT = "left", "Left"


class HouseholdMembership(models.Model):
    """Permissions by role:

    * member — view household; create/edit/consume/discard inventory; manage shopping list.
    * admin  — member rights + edit household settings, invite members, remove members.
    * owner  — admin rights + change roles, transfer ownership, delete household.
    """

    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MEMBER)
    status = models.CharField(max_length=16, choices=MembershipStatus.choices, default=MembershipStatus.ACTIVE)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["household", "user"], name="uniq_membership_household_user")]
        indexes = [models.Index(fields=["user", "status"])]
        ordering = ["joined_at"]

    def has_role(self, minimum: str) -> bool:
        return self.status == MembershipStatus.ACTIVE and ROLE_RANK[self.role] >= ROLE_RANK[minimum]


def _invite_code():
    return secrets.token_urlsafe(9)


def _invite_expiry():
    return timezone.now() + timedelta(days=7)


class HouseholdInvitation(models.Model):
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=16, choices=[(Role.ADMIN, "Administrator"), (Role.MEMBER, "Member")],
                            default=Role.MEMBER)
    code = models.CharField(max_length=32, unique=True, default=_invite_code)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    expires_at = models.DateTimeField(default=_invite_expiry)
    accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_usable(self):
        return not self.revoked and self.accepted_at is None and self.expires_at > timezone.now()
