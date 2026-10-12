from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("devices", views.DeviceViewSet, basename="device")
router.register("", views.NotificationHistoryViewSet, basename="notification")

urlpatterns = [
    path("preferences/", views.PreferenceView.as_view(), name="notification-preferences"),
    path("register-device/", views.RegisterDeviceView.as_view(), name="notification-register-device"),
    *router.urls,
]
