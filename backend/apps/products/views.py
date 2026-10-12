from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.households.scoping import HouseholdScopedMixin, IsHouseholdMember
from apps.inventory.models import BatchStatus

from .models import Product
from .serializers import ProductSerializer


class ProductViewSet(HouseholdScopedMixin, viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsHouseholdMember]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_fields = ["category", "barcode"]
    search_fields = ["name", "brand", "barcode"]
    ordering_fields = ["name", "created_at", "updated_at"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        active = Q(batches__status=BatchStatus.ACTIVE)
        return self.scope(Product.objects.all()).annotate(
            active_quantity=Coalesce(Sum("batches__quantity", filter=active),
                                     Value(Decimal("0")), output_field=DecimalField(max_digits=12, decimal_places=3)),
            active_batch_count=Count("batches", filter=active),
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.request.user.is_authenticated:
            ctx["household"] = self.household
        return ctx

    def perform_create(self, serializer):
        serializer.save(household=self.household, created_by=self.request.user)

    @extend_schema(parameters=[OpenApiParameter("q", str, description="Name, brand or barcode")],
                   responses=ProductSerializer(many=True))
    @action(detail=False, methods=["get"])
    def search(self, request):
        """Fast lookup used by add-product and shopping list ("already in inventory?")."""
        q = (request.query_params.get("q") or "").strip()
        qs = self.get_queryset()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(brand__icontains=q) | Q(barcode=q))
        page = self.paginate_queryset(qs.order_by("-active_batch_count", "name"))
        return self.get_paginated_response(self.get_serializer(page, many=True).data)
