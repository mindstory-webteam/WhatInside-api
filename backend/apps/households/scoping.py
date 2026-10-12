"""Household resolution + isolation for every household-scoped endpoint.

The active household is taken from (in order) the ``X-Household-ID`` header,
the ``household`` query parameter, or the user's earliest active membership.
Querysets are always filtered by that household, so changing an object ID in
the URL can never reach another household's data (it simply 404s).
"""
from rest_framework import exceptions, permissions

from .models import HouseholdMembership, MembershipStatus, Role


def resolve_membership(request):
    cached = getattr(request, "_wi_membership", None)
    if cached is not None:
        return cached
    raw = request.META.get("HTTP_X_HOUSEHOLD_ID") or request.query_params.get("household")
    qs = HouseholdMembership.objects.select_related("household").filter(
        user=request.user, status=MembershipStatus.ACTIVE
    )
    if raw:
        try:
            household_id = int(raw)
        except (TypeError, ValueError):
            raise exceptions.ValidationError({"household": "Invalid household id."})
        membership = qs.filter(household_id=household_id).first()
        if membership is None:
            # Same response as "does not exist" to avoid revealing other households.
            raise exceptions.NotFound("Household not found.")
    else:
        membership = qs.first()
        if membership is None:
            raise exceptions.PermissionDenied("Create or join a household first.")
    request._wi_membership = membership
    return membership


class HouseholdScopedMixin:
    """Use in viewsets: provides ``self.household`` / ``self.membership`` and household filtering."""

    household_field = "household"

    @property
    def membership(self):
        return resolve_membership(self.request)

    @property
    def household(self):
        return self.membership.household

    def scope(self, queryset):
        if getattr(self, "swagger_fake_view", False):  # OpenAPI generation, no real user
            return queryset.none()
        return queryset.filter(**{self.household_field: self.household})


class IsHouseholdMember(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and resolve_membership(request))


class HasHouseholdRole(permissions.BasePermission):
    minimum_role = Role.ADMIN

    def has_permission(self, request, view):
        membership = resolve_membership(request)
        return membership.has_role(self.minimum_role)
