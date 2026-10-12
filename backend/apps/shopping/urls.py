from rest_framework.routers import SimpleRouter

from .views import ShoppingListViewSet

router = SimpleRouter()
router.register("", ShoppingListViewSet, basename="shopping")
urlpatterns = router.urls
