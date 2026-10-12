from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import DomainError

from .models import Household, HouseholdInvitation, HouseholdMembership, MembershipStatus, Role


@transaction.atomic
def create_household(*, user, name: str, tz: str) -> Household:
    household = Household.objects.create(name=name, owner=user, timezone=tz)
    HouseholdMembership.objects.create(household=household, user=user, role=Role.OWNER)
    return household


@transaction.atomic
def accept_invitation(*, user, code: str) -> HouseholdMembership:
    invitation = HouseholdInvitation.objects.select_for_update().filter(code=code).first()
    if invitation is None or not invitation.is_usable:
        raise DomainError("This invitation code is invalid or has expired.")
    if invitation.email and invitation.email.lower() != user.email.lower():
        raise DomainError("This invitation was sent to a different email address.")
    membership, created = HouseholdMembership.objects.get_or_create(
        household=invitation.household, user=user, defaults={"role": invitation.role}
    )
    if not created:
        if membership.status == MembershipStatus.ACTIVE:
            raise DomainError("You are already a member of this household.")
        membership.status = MembershipStatus.ACTIVE
        membership.role = invitation.role
        membership.save(update_fields=["status", "role"])
    invitation.accepted_by = user
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_by", "accepted_at"])
    return membership


def change_role(*, actor_membership, target: HouseholdMembership, role: str) -> HouseholdMembership:
    if not actor_membership.has_role(Role.OWNER):
        raise DomainError("Only the owner can change member roles.")
    if target.role == Role.OWNER:
        raise DomainError("The owner's role cannot be changed. Transfer ownership instead.")
    target.role = role
    target.save(update_fields=["role"])
    return target


def remove_member(*, actor_membership, target: HouseholdMembership) -> None:
    if target.role == Role.OWNER:
        raise DomainError("The owner cannot be removed.")
    if target.role == Role.ADMIN and not actor_membership.has_role(Role.OWNER):
        raise DomainError("Only the owner can remove an administrator.")
    target.status = MembershipStatus.REMOVED
    target.save(update_fields=["status"])


@transaction.atomic
def transfer_ownership(*, household: Household, actor_membership, target: HouseholdMembership) -> None:
    if not actor_membership.has_role(Role.OWNER):
        raise DomainError("Only the owner can transfer ownership.")
    if target.status != MembershipStatus.ACTIVE or target.household_id != household.id:
        raise DomainError("The new owner must be an active member.")
    actor_membership.role = Role.ADMIN
    actor_membership.save(update_fields=["role"])
    target.role = Role.OWNER
    target.save(update_fields=["role"])
    household.owner = target.user
    household.save(update_fields=["owner", "updated_at"])


def leave_household(*, membership: HouseholdMembership) -> None:
    if membership.role == Role.OWNER:
        raise DomainError("Transfer ownership before leaving the household.")
    membership.status = MembershipStatus.LEFT
    membership.save(update_fields=["status"])
