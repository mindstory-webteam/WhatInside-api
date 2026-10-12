from rest_framework.routers import SimpleRouter

from .views import HouseholdViewSet

router = SimpleRouter()
router.register("", HouseholdViewSet, basename="household")
urlpatterns = router.urls
