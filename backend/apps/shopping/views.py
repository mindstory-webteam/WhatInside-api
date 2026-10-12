from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import Lower
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.exceptions import DomainError
from apps.core.idempotency import idempotent
from apps.households.scoping import HouseholdScopedMixin, IsHouseholdMember
from apps.inventory import services as inventory_services
from apps.inventory.models import InventoryBatch
from apps.inventory.serializers import BatchSerializer
from apps.products.models import Product

from .models import ShoppingListItem
from .serializers import AddToInventorySerializer, ShoppingListItemSerializer


class ShoppingListViewSet(HouseholdScopedMixin, viewsets.ModelViewSet):
    serializer_class = ShoppingListItemSerializer
    permission_classes = [IsHouseholdMember]
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_fields = ["is_purchased"]
    search_fields = ["product_name", "note"]
    ordering_fields = ["created_at", "product_name"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return self.scope(ShoppingListItem.objects.all()).select_related("product")

    def _inventory_index(self):
        rows = (InventoryBatch.objects.active().filter(household=self.household)
                .values("product_id", "unit", name=Lower("product__name"))
                .annotate(total=Sum("quantity"), batches=Count("id")))
        index = {}
        for r in rows:
            entry = {"quantity": str(r["total"]), "unit": r["unit"], "batches": r["batches"]}
            index[("id", r["product_id"])] = entry
            index.setdefault(("name", r["name"]), entry)
        return index

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.request.user.is_authenticated:
            ctx["household"] = self.household
            if self.request.method == "GET" or self.action in ("create", "partial_update", "mark_purchased"):
                ctx["inventory_index"] = self._inventory_index()
        return ctx

    def perform_create(self, serializer):
        serializer.save(household=self.household, created_by=self.request.user)

    @extend_schema(request=None, responses=ShoppingListItemSerializer)
    @action(detail=True, methods=["post"], url_path="mark-purchased")
    def mark_purchased(self, request, pk=None):
        """Idempotent: marking an already-purchased item again is a no-op."""
        item = self.get_object()
        if not item.is_purchased:
            item.is_purchased = True
            item.purchased_at = timezone.now()
            item.save(update_fields=["is_purchased", "purchased_at", "updated_at"])
        return Response(self.get_serializer(item).data)

    @extend_schema(request=None, responses=ShoppingListItemSerializer)
    @action(detail=True, methods=["post"], url_path="mark-unpurchased")
    def mark_unpurchased(self, request, pk=None):
        item = self.get_object()
        if item.added_to_inventory_id:
            raise DomainError("This item was already added to inventory.")
        item.is_purchased = False
        item.purchased_at = None
        item.save(update_fields=["is_purchased", "purchased_at", "updated_at"])
        return Response(self.get_serializer(item).data)

    @extend_schema(request=AddToInventorySerializer, responses={201: BatchSerializer})
    @action(detail=True, methods=["post"], url_path="add-to-inventory")
    @idempotent("shopping.add_to_inventory")
    def add_to_inventory(self, request, pk=None):
        s = AddToInventorySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        with transaction.atomic():
            item = ShoppingListItem.objects.select_for_update().get(pk=self.get_object().pk)
            if item.added_to_inventory_id:
                raise DomainError("This item is already in your inventory.")
            product = item.product
            if product is None:
                product = Product.objects.filter(household=self.household, name__iexact=item.product_name,
                                                 brand="").first() or Product.objects.create(
                    household=self.household, name=item.product_name, default_unit=item.unit,
                    category=d.get("category", "other"), created_by=request.user)
            batch = inventory_services.create_batch(
                household=self.household, actor=request.user, product=product,
                quantity=d.get("quantity") or item.quantity, unit=item.unit,
                storage_location=d["storage_location"], purchase_date=self.household.local_today(),
                expiry_date=d.get("expiry_date"), best_before_date=d.get("best_before_date"),
                expiry_confirmed=not d["expiry_unknown"], purchase_price=d.get("purchase_price"),
            )
            item.product = product
            item.is_purchased = True
            item.purchased_at = item.purchased_at or timezone.now()
            item.added_to_inventory = batch
            item.save(update_fields=["product", "is_purchased", "purchased_at", "added_to_inventory", "updated_at"])
        ctx = {"today": self.household.local_today()}
        return Response(BatchSerializer(batch, context=ctx).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="clear-purchased")
    def clear_purchased(self, request):
        self.get_queryset().filter(is_purchased=True).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
