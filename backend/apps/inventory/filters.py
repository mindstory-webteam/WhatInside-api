import django_filters
from django.conf import settings
from django.db.models import Q

from apps.products.models import Category

from .models import BatchStatus, ExpiryStatus, InventoryBatch, StorageLocation


class InventoryFilter(django_filters.FilterSet):
    storage_location = django_filters.MultipleChoiceFilter(choices=StorageLocation.choices)
    status = django_filters.MultipleChoiceFilter(choices=BatchStatus.choices)
    category = django_filters.MultipleChoiceFilter(field_name="product__category", choices=Category.choices)
    product = django_filters.NumberFilter(field_name="product_id")
    expiry_status = django_filters.ChoiceFilter(choices=ExpiryStatus.choices, method="filter_expiry_status")
    expiry_from = django_filters.DateFilter(field_name="effective_expiry", lookup_expr="gte")
    expiry_to = django_filters.DateFilter(field_name="effective_expiry", lookup_expr="lte")
    needs_review = django_filters.BooleanFilter(method="filter_needs_review")

    class Meta:
        model = InventoryBatch
        fields = ["storage_location", "status", "category", "product"]

    def filter_expiry_status(self, qs, name, value):
        today = self.request.wi_today
        days = settings.EXPIRING_SOON_DAYS
        return {
            ExpiryStatus.EXPIRED: lambda: qs.expired(today),
            ExpiryStatus.EXPIRING_SOON: lambda: qs.expiring_soon(today, days),
            ExpiryStatus.FRESH: lambda: qs.fresh(today, days),
            ExpiryStatus.UNKNOWN: lambda: qs.needs_review(),
        }[value]()

    def filter_needs_review(self, qs, name, value):
        review = Q(expiry_date__isnull=True, best_before_date__isnull=True) | Q(expiry_confirmed=False)
        return qs.filter(review) if value else qs.exclude(review)
