from django.db.models import F
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.idempotency import idempotent
from apps.households.scoping import HouseholdScopedMixin, IsHouseholdMember

from . import services
from .filters import InventoryFilter
from .models import BatchStatus, InventoryBatch, InventoryEvent
from .serializers import (
    BatchCreateSerializer,
    BatchSerializer,
    BatchUpdateSerializer,
    DiscardSerializer,
    InventoryEventSerializer,
    QuantityActionSerializer,
    VersionSerializer,
)


class InventoryViewSet(HouseholdScopedMixin, viewsets.GenericViewSet):
    """Inventory batches. Lists default to ``status=active`` unless ``status`` is given."""

    permission_classes = [IsHouseholdMember]
    serializer_class = BatchSerializer
    filterset_class = InventoryFilter
    search_fields = ["product__name", "product__brand", "product__barcode", "batch_number"]
    ordering_fields = ["product_name", "effective_expiry", "created_at", "quantity"]
    ordering = ["effective_expiry", "product_name"]
    lookup_value_regex = r"\d+"

    queryset = InventoryBatch.objects.none()  # for schema typing only

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        request.wi_today = self.household.local_today()

    def get_queryset(self):
        qs = self.scope(InventoryBatch.objects.all()).with_effective_expiry().annotate(
            product_name=F("product__name")
        ).select_related("product", "household")
        if self.action == "list" and "status" not in self.request.query_params:
            qs = qs.filter(status=BatchStatus.ACTIVE)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if hasattr(self.request, "wi_today"):
            ctx["today"] = self.request.wi_today
            ctx["household"] = self.household
        return ctx

    def _out(self, batch, code=status.HTTP_200_OK):
        batch = self.get_queryset().get(pk=batch.pk) if InventoryBatch.objects.filter(pk=batch.pk).exists() else batch
        return Response(BatchSerializer(batch, context=self.get_serializer_context()).data, status=code)

    @extend_schema(parameters=[
        OpenApiParameter("ordering", str, description="product_name, -product_name, effective_expiry, -created_at"),
        OpenApiParameter("search", str),
    ])
    def list(self, request):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    @extend_schema(request=BatchCreateSerializer, responses={201: BatchSerializer})
    @idempotent("inventory.create")
    def create(self, request):
        s = BatchCreateSerializer(data=request.data, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        product = s.resolve_product(self.household, request.user)
        data = {k: v for k, v in s.validated_data.items() if k not in ("product", "new_product")}
        batch = services.create_batch(household=self.household, actor=request.user, product=product, **data)
        return self._out(batch, status.HTTP_201_CREATED)

    @extend_schema(request=BatchUpdateSerializer, responses=BatchSerializer)
    def partial_update(self, request, pk=None):
        batch = self.get_object()
        s = BatchUpdateSerializer(batch, data=request.data, partial=True, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        version = data.pop("version", None)
        batch = services.update_batch(batch_id=batch.pk, actor=request.user, expected_version=version, **data)
        return self._out(batch)

    def destroy(self, request, pk=None):
        batch = self.get_object()
        services.delete_batch(batch_id=batch.pk, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=QuantityActionSerializer, responses=BatchSerializer)
    @action(detail=True, methods=["post"])
    @idempotent("inventory.consume")
    def consume(self, request, pk=None):
        batch = self.get_object()
        s = QuantityActionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        batch = services.consume(batch_id=batch.pk, actor=request.user, quantity=d["quantity"], note=d["note"],
                                 expected_version=d.get("version"))
        return self._out(batch)

    @extend_schema(request=VersionSerializer, responses=BatchSerializer)
    @action(detail=True, methods=["post"])
    @idempotent("inventory.finish")
    def finish(self, request, pk=None):
        batch = self.get_object()
        s = VersionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        batch = services.finish(batch_id=batch.pk, actor=request.user, expected_version=s.validated_data.get("version"))
        return self._out(batch)

    @extend_schema(request=DiscardSerializer, responses=BatchSerializer)
    @action(detail=True, methods=["post"])
    @idempotent("inventory.discard")
    def discard(self, request, pk=None):
        batch = self.get_object()
        s = DiscardSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        batch = services.discard(batch_id=batch.pk, actor=request.user, quantity=d.get("quantity"),
                                 reason=d["reason"], note=d["note"], expected_version=d.get("version"))
        return self._out(batch)

    @extend_schema(request=QuantityActionSerializer, responses=BatchSerializer)
    @action(detail=True, methods=["post"])
    @idempotent("inventory.restock")
    def restock(self, request, pk=None):
        batch = self.get_object()
        s = QuantityActionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        batch = services.restock(batch_id=batch.pk, actor=request.user, quantity=d["quantity"],
                                 expected_version=d.get("version"))
        return self._out(batch)

    @extend_schema(responses=InventoryEventSerializer(many=True))
    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        batch = self.get_object()
        qs = InventoryEvent.objects.filter(household=self.household, batch=batch).select_related("actor")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(InventoryEventSerializer(page, many=True).data)

    @extend_schema(responses=InventoryEventSerializer(many=True))
    @action(detail=False, methods=["get"])
    def activity(self, request):
        """Recent household activity (dashboard feed)."""
        qs = InventoryEvent.objects.filter(household=self.household).select_related("actor")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(InventoryEventSerializer(page, many=True).data)
