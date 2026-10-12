from rest_framework import serializers

from .models import Household, HouseholdInvitation, HouseholdMembership, Role, validate_timezone


class HouseholdSerializer(serializers.ModelSerializer):
    my_role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Household
        fields = ["id", "name", "owner", "timezone", "created_at", "my_role", "member_count"]
        read_only_fields = ["id", "owner", "created_at", "my_role", "member_count"]

    def validate_timezone(self, value):
        validate_timezone(value)
        return value

    def get_my_role(self, obj) -> str | None:
        user = self.context["request"].user
        m = next((m for m in obj.memberships.all() if m.user_id == user.id and m.status == "active"), None)
        return m.role if m else None

    def get_member_count(self, obj) -> int:
        return sum(1 for m in obj.memberships.all() if m.status == "active")


class MemberSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = HouseholdMembership
        fields = ["id", "user", "name", "email", "role", "status", "joined_at"]
        read_only_fields = ["id", "user", "name", "email", "status", "joined_at"]


class MemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[Role.ADMIN, Role.MEMBER])


class InvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = HouseholdInvitation
        fields = ["id", "email", "role", "code", "expires_at", "created_at", "accepted_at", "revoked"]
        read_only_fields = ["id", "code", "expires_at", "created_at", "accepted_at", "revoked"]


class JoinSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
