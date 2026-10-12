from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from . import services
from .models import Household, HouseholdInvitation, HouseholdMembership, MembershipStatus, Role
from .serializers import (
    HouseholdSerializer,
    InvitationSerializer,
    JoinSerializer,
    MemberRoleSerializer,
    MemberSerializer,
)


class HouseholdViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                       mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = HouseholdSerializer
    lookup_value_regex = r"\d+"
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Household.objects.none()
        # Only households where the caller is an active member — other ids 404.
        return (
            Household.objects.filter(memberships__user=self.request.user,
                                     memberships__status=MembershipStatus.ACTIVE)
            .prefetch_related(Prefetch("memberships", queryset=HouseholdMembership.objects.all()))
            .distinct()
            .order_by("created_at")
        )

    def _membership(self, household) -> HouseholdMembership:
        return HouseholdMembership.objects.get(household=household, user=self.request.user,
                                               status=MembershipStatus.ACTIVE)

    def _require(self, household, role):
        membership = self._membership(household)
        if not membership.has_role(role):
            raise PermissionDenied("Your household role does not allow this action.")
        return membership

    def perform_create(self, serializer):
        data = serializer.validated_data
        serializer.instance = services.create_household(
            user=self.request.user, name=data["name"], tz=data.get("timezone") or self.request.user.timezone
        )

    def perform_update(self, serializer):
        self._require(serializer.instance, Role.ADMIN)
        serializer.save()

    def perform_destroy(self, instance):
        self._require(instance, Role.OWNER)
        instance.delete()

    @extend_schema(responses=MemberSerializer(many=True))
    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        household = self.get_object()
        qs = household.memberships.filter(status=MembershipStatus.ACTIVE).select_related("user")
        return Response(MemberSerializer(qs, many=True).data)

    @extend_schema(request=MemberRoleSerializer, responses=MemberSerializer)
    @action(detail=True, methods=["patch", "delete"], url_path=r"members/(?P<member_id>\d+)")
    def member(self, request, pk=None, member_id=None):
        household = self.get_object()
        actor = self._require(household, Role.ADMIN)
        target = get_object_or_404(HouseholdMembership, pk=member_id, household=household,
                                   status=MembershipStatus.ACTIVE)
        if request.method == "DELETE":
            services.remove_member(actor_membership=actor, target=target)
            return Response(status=status.HTTP_204_NO_CONTENT)
        s = MemberRoleSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.change_role(actor_membership=actor, target=target, role=s.validated_data["role"])
        return Response(MemberSerializer(target).data)

    @extend_schema(request=None, responses=HouseholdSerializer)
    @action(detail=True, methods=["post"], url_path=r"members/(?P<member_id>\d+)/make-owner")
    def make_owner(self, request, pk=None, member_id=None):
        household = self.get_object()
        actor = self._require(household, Role.OWNER)
        target = get_object_or_404(HouseholdMembership, pk=member_id, household=household)
        services.transfer_ownership(household=household, actor_membership=actor, target=target)
        return Response(self.get_serializer(self.get_queryset().get(pk=household.pk)).data)

    @extend_schema(request=InvitationSerializer, responses={201: InvitationSerializer})
    @action(detail=True, methods=["get", "post"])
    def invitations(self, request, pk=None):
        household = self.get_object()
        self._require(household, Role.ADMIN)
        if request.method == "GET":
            qs = household.invitations.filter(accepted_at__isnull=True, revoked=False).order_by("-created_at")
            return Response(InvitationSerializer(qs, many=True).data)
        s = InvitationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        invitation = s.save(household=household, invited_by=request.user)
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"invitations/(?P<invitation_id>\d+)")
    def revoke_invitation(self, request, pk=None, invitation_id=None):
        household = self.get_object()
        self._require(household, Role.ADMIN)
        inv = get_object_or_404(HouseholdInvitation, pk=invitation_id, household=household)
        inv.revoked = True
        inv.save(update_fields=["revoked"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        household = self.get_object()
        services.leave_household(membership=self._membership(household))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=JoinSerializer, responses={201: HouseholdSerializer})
    @action(detail=False, methods=["post"])
    def join(self, request):
        s = JoinSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        membership = services.accept_invitation(user=request.user, code=s.validated_data["code"].strip())
        household = self.get_queryset().get(pk=membership.household_id)
        return Response(self.get_serializer(household).data, status=status.HTTP_201_CREATED)
