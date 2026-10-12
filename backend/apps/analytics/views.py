from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.households.scoping import HouseholdScopedMixin, IsHouseholdMember
from apps.inventory.models import BatchStatus, DiscardReason, EventType, InventoryBatch, InventoryEvent
from apps.inventory.serializers import BatchSerializer
from apps.notifications.models import NotificationRecord
from apps.shopping.models import ShoppingListItem


class DashboardSummaryView(HouseholdScopedMixin, APIView):
    permission_classes = [IsHouseholdMember]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        household = self.household
        today = household.local_today()
        days = settings.EXPIRING_SOON_DAYS
        active = InventoryBatch.objects.active().filter(household=household)
        by_storage = {row["storage_location"]: row["n"] for row in
                      active.values("storage_location").annotate(n=Count("id"))}
        return Response({
            "household": {"id": household.id, "name": household.name, "timezone": household.timezone},
            "today": today,
            "expiring_soon_days": days,
            "total_active_batches": active.count(),
            "expiring_soon": active.expiring_soon(today, days).count(),
            "expired": active.expired(today).count(),
            "review_required": active.needs_review().count(),
            "storage": {loc: by_storage.get(loc, 0) for loc in ("refrigerator", "freezer", "pantry", "other")},
            "shopping_list_count": ShoppingListItem.objects.filter(household=household, is_purchased=False).count(),
            "unread_notifications": NotificationRecord.objects.filter(
                user=request.user, household=household, read_at__isnull=True,
                status__in=["sent", "local_only"]).count(),
        })


class _BatchListView(HouseholdScopedMixin, ListAPIView):
    permission_classes = [IsHouseholdMember]
    serializer_class = BatchSerializer
    filter_backends = []

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.today = self.household.local_today()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["today"] = getattr(self, "today", None)
        return ctx

    def base(self):
        return InventoryBatch.objects.active().filter(household=self.household).select_related("product")


class ExpiringSoonView(_BatchListView):
    @extend_schema(parameters=[OpenApiParameter("days", int, description="Window in days (default 7, max 60)")])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        try:
            days = max(0, min(60, int(self.request.query_params.get("days", settings.EXPIRING_SOON_DAYS))))
        except ValueError:
            days = settings.EXPIRING_SOON_DAYS
        return self.base().expiring_soon(self.today, days).order_by("effective_expiry", "product__name")


class ExpiredView(_BatchListView):
    def get_queryset(self):
        return self.base().expired(self.today).order_by("effective_expiry", "product__name")


class ReviewRequiredView(_BatchListView):
    def get_queryset(self):
        return self.base().needs_review().with_effective_expiry().order_by("-created_at")


def _period(request, household):
    try:
        months = max(1, min(24, int(request.query_params.get("months", 6))))
    except ValueError:
        months = 6
    since = timezone.now() - timedelta(days=30 * months)
    return months, since


class AnalyticsOverviewView(HouseholdScopedMixin, APIView):
    permission_classes = [IsHouseholdMember]

    @extend_schema(parameters=[OpenApiParameter("months", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        household = self.household
        months, since = _period(request, household)
        events = InventoryEvent.objects.filter(household=household, created_at__gte=since)
        use = Q(event_type__in=[EventType.CONSUMED, EventType.FINISHED])
        discard = Q(event_type=EventType.DISCARDED)
        totals = events.aggregate(
            added=Count("id", filter=Q(event_type=EventType.ADDED)),
            consumed=Count("id", filter=use),
            discarded=Count("id", filter=discard),
            used_before_expiry=Count("id", filter=use & Q(before_expiry=True)),
            expiry_waste=Count("id", filter=discard & (Q(reason=DiscardReason.EXPIRED) | Q(before_expiry=False))),
            used_value=Sum("price", filter=use),
        )
        monthly = (
            events.annotate(month=TruncMonth("created_at", tzinfo=household.tzinfo))
            .values("month")
            .annotate(added=Count("id", filter=Q(event_type=EventType.ADDED)), consumed=Count("id", filter=use),
                      discarded=Count("id", filter=discard))
            .order_by("month")
        )
        return Response({
            "period_months": months,
            "total_products_added": totals["added"],
            "products_consumed": totals["consumed"],
            "products_discarded": totals["discarded"],
            "expiry_related_waste": totals["expiry_waste"],
            "products_used_before_expiry": totals["used_before_expiry"],
            "recorded_value_used": totals["used_value"],
            "active_batches": InventoryBatch.objects.filter(household=household, status=BatchStatus.ACTIVE).count(),
            "monthly_activity": [
                {"month": r["month"].date().isoformat()[:7], "added": r["added"], "consumed": r["consumed"],
                 "discarded": r["discarded"]} for r in monthly
            ],
            "notes": {
                "counts": "Counts are recorded consumption/discard actions, not individual units.",
                "value": "Values are estimates derived from purchase prices you entered.",
            },
        })


class AnalyticsWasteView(HouseholdScopedMixin, APIView):
    permission_classes = [IsHouseholdMember]

    @extend_schema(parameters=[OpenApiParameter("months", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        household = self.household
        months, since = _period(request, household)
        discards = InventoryEvent.objects.filter(household=household, created_at__gte=since,
                                                 event_type=EventType.DISCARDED)
        agg = discards.aggregate(n=Count("id"), priced=Count("id", filter=Q(price__isnull=False)),
                                 cost=Sum("price"))
        by_reason = {r["reason"] or "other": r["n"] for r in discards.values("reason").annotate(n=Count("id"))}
        frequent = (discards.values("product_name").annotate(times=Count("id"), cost=Sum("price"))
                    .order_by("-times", "product_name")[:10])
        return Response({
            "period_months": months,
            "discard_count": agg["n"],
            "estimated_waste_cost": agg["cost"],
            "estimate_coverage": {"priced_discards": agg["priced"], "total_discards": agg["n"]},
            "by_reason": by_reason,
            "frequently_discarded": [{"product_name": r["product_name"], "times": r["times"],
                                      "estimated_cost": r["cost"]} for r in frequent],
            "disclaimer": "Waste cost is an estimate based on purchase prices you recorded. "
                          "Discards without a price are not included. This is not a guaranteed saving.",
        })
