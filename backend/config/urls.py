from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import health

api_v1 = [
    path("auth/", include("apps.accounts.urls")),
    path("households/", include("apps.households.urls")),
    path("products/", include("apps.products.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("scanning/", include("apps.scanning.urls")),
    path("shopping-list/", include("apps.shopping.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("", include("apps.analytics.urls")),  # dashboard/ and analytics/
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health, name="health"),
    path("api/v1/", include(api_v1)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
