from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import DeliveryStatus, DeviceToken, NotificationPreference, NotificationRecord
from .serializers import DeviceTokenSerializer, NotificationPreferenceSerializer, NotificationRecordSerializer


class NotificationHistoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The caller's reminder history. ``?upcoming=true`` lists scheduled ones instead."""

    serializer_class = NotificationRecordSerializer
    filterset_fields = ["status", "household"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return NotificationRecord.objects.none()
        qs = NotificationRecord.objects.filter(user=self.request.user)
        if self.request.query_params.get("upcoming") == "true":
            # Includes reminders that are due but not dispatched yet, so nothing "disappears".
            return qs.filter(status=DeliveryStatus.PENDING).order_by("scheduled_for")
        return qs.exclude(status=DeliveryStatus.PENDING).exclude(status=DeliveryStatus.CANCELLED)

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        NotificationRecord.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferenceView(generics.RetrieveUpdateAPIView):
    serializer_class = NotificationPreferenceSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return NotificationPreference.for_user(self.request.user)

    def perform_update(self, serializer):
        serializer.save()
        services.sync_user_notifications(self.request.user)  # cancel/re-plan reminders


class RegisterDeviceView(APIView):
    @extend_schema(request=DeviceTokenSerializer, responses={201: DeviceTokenSerializer})
    def post(self, request):
        s = DeviceTokenSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        # A token belongs to one physical device; re-registering moves it to the current user.
        device, created = DeviceToken.objects.update_or_create(
            token=s.validated_data["token"],
            defaults={"user": request.user, "platform": s.validated_data["platform"],
                      "device_name": s.validated_data.get("device_name", ""), "is_active": True},
        )
        return Response(DeviceTokenSerializer(device).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class DeviceViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = DeviceTokenSerializer
    queryset = DeviceToken.objects.none()  # schema typing; real queryset below

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return DeviceToken.objects.none()
        return DeviceToken.objects.filter(user=self.request.user)
