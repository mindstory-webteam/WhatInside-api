from decimal import Decimal
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework import serializers

from apps.products.models import Category, Product, Unit

from .models import BatchStatus, DiscardReason, InventoryBatch, InventoryEvent, StorageLocation


class ProductSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "brand", "barcode", "category", "default_unit", "image", "image_url"]


class BatchSerializer(serializers.ModelSerializer):
    """Read representation. ``expiry_status`` is computed with the household's local date."""

    product = ProductSummarySerializer(read_only=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)
    effective_expiry = serializers.DateField(read_only=True)
    expiry_status = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()
    needs_review = serializers.SerializerMethodField()

    class Meta:
        model = InventoryBatch
        fields = ["id", "product", "storage_location", "quantity", "initial_quantity", "unit", "purchase_date",
                  "manufacturing_date", "expiry_date", "best_before_date", "effective_expiry", "expiry_confirmed",
                  "batch_number", "purchase_price", "unit_price", "status", "notes", "version", "expiry_status",
                  "days_until_expiry", "needs_review", "created_at", "updated_at"]
        read_only_fields = fields

    def _today(self):
        return self.context["today"]

    def get_expiry_status(self, obj) -> str:
        return obj.expiry_status(self._today())

    def get_days_until_expiry(self, obj) -> int | None:
        return obj.days_until_expiry(self._today())

    def get_needs_review(self, obj) -> bool:
        return obj.effective_expiry is None or not obj.expiry_confirmed


class NewProductSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    brand = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    barcode = serializers.RegexField(r"^\d{6,14}$", required=False, allow_blank=True, default="")
    category = serializers.ChoiceField(choices=Category.choices, default=Category.OTHER)
    default_unit = serializers.ChoiceField(choices=Unit.choices, default=Unit.PIECE)
    image_url = serializers.URLField(required=False, allow_blank=True, default="")


class _DateRules:
    def validate_dates(self, attrs, instance=None):
        def val(name):
            return attrs[name] if name in attrs else getattr(instance, name, None)

        mfg, exp, bb, purchase = val("manufacturing_date"), val("expiry_date"), val("best_before_date"), val(
            "purchase_date")
        errors = {}
        today_plus = self.context["today"] + timedelta(days=1)
        if mfg and exp and mfg > exp:
            errors["manufacturing_date"] = "Manufacturing date cannot be after the expiry date."
        if mfg and bb and mfg > bb:
            errors["best_before_date"] = "Best-before date cannot be before the manufacturing date."
        if mfg and mfg > today_plus:
            errors["manufacturing_date"] = "Manufacturing date cannot be in the future."
        if purchase and purchase > today_plus:
            errors["purchase_date"] = "Purchase date cannot be in the future."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class BatchCreateSerializer(_DateRules, serializers.Serializer):
    product = serializers.IntegerField(required=False, help_text="Existing product id")
    new_product = NewProductSerializer(required=False, help_text="Create or reuse a product by barcode/name")
    storage_location = serializers.ChoiceField(choices=StorageLocation.choices, default=StorageLocation.REFRIGERATOR)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"))
    unit = serializers.ChoiceField(choices=Unit.choices, required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    manufacturing_date = serializers.DateField(required=False, allow_null=True)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    best_before_date = serializers.DateField(required=False, allow_null=True)
    expiry_confirmed = serializers.BooleanField(
        default=False, help_text="Send true only after the user reviewed the date. Unconfirmed dates are flagged."
    )
    batch_number = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    purchase_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False,
                                              allow_null=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if bool(attrs.get("product")) == bool(attrs.get("new_product")):
            raise serializers.ValidationError("Provide exactly one of 'product' or 'new_product'.")
        if attrs.get("expiry_confirmed") and not (attrs.get("expiry_date") or attrs.get("best_before_date")):
            raise serializers.ValidationError({"expiry_confirmed": "There is no date to confirm."})
        household = self.context["household"]
        if attrs.get("product"):
            product = Product.objects.filter(pk=attrs["product"], household=household).first()
            if product is None:
                raise serializers.ValidationError({"product": "Product not found."})
            attrs["product"] = product
        return self.validate_dates(attrs)

    def resolve_product(self, household, user):
        if isinstance(self.validated_data.get("product"), Product):
            return self.validated_data["product"]
        data = dict(self.validated_data["new_product"])
        qs = Product.objects.filter(household=household)
        existing = (qs.filter(barcode=data["barcode"]).first() if data["barcode"] else None) or qs.filter(
            name__iexact=data["name"].strip(), brand__iexact=data["brand"].strip()
        ).first()
        if existing:
            return existing
        try:
            with transaction.atomic():
                return Product.objects.create(household=household, created_by=user, **{
                    **data, "name": data["name"].strip(), "brand": data["brand"].strip()})
        except IntegrityError:
            return qs.get(name__iexact=data["name"].strip(), brand__iexact=data["brand"].strip())


class BatchUpdateSerializer(_DateRules, serializers.Serializer):
    product = serializers.IntegerField(required=False)
    storage_location = serializers.ChoiceField(choices=StorageLocation.choices, required=False)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0"), required=False)
    unit = serializers.ChoiceField(choices=Unit.choices, required=False)
    purchase_date = serializers.DateField(required=False, allow_null=True)
    manufacturing_date = serializers.DateField(required=False, allow_null=True)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    best_before_date = serializers.DateField(required=False, allow_null=True)
    expiry_confirmed = serializers.BooleanField(required=False)
    batch_number = serializers.CharField(max_length=64, required=False, allow_blank=True)
    purchase_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False,
                                              allow_null=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)
    version = serializers.IntegerField(required=False, help_text="Last version seen; mismatches return 409.")

    def validate(self, attrs):
        if "product" in attrs:
            product = Product.objects.filter(pk=attrs["product"], household=self.context["household"]).first()
            if product is None:
                raise serializers.ValidationError({"product": "Product not found."})
            attrs["product"] = product
        return self.validate_dates(attrs, self.instance)


class QuantityActionSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"))
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    version = serializers.IntegerField(required=False)


class DiscardSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"), required=False,
                                        help_text="Omit to discard everything left.")
    reason = serializers.ChoiceField(choices=DiscardReason.choices, default=DiscardReason.OTHER)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    version = serializers.IntegerField(required=False)


class VersionSerializer(serializers.Serializer):
    version = serializers.IntegerField(required=False)


class InventoryEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.name", default=None, read_only=True)

    class Meta:
        model = InventoryEvent
        fields = ["id", "batch", "product", "product_name", "event_type", "quantity_change", "unit", "reason",
                  "note", "price", "before_expiry", "actor", "actor_name", "created_at"]
        read_only_fields = fields


def expiring_soon_days():
    return settings.EXPIRING_SOON_DAYS


__all__ = ["BatchSerializer", "BatchCreateSerializer", "BatchUpdateSerializer", "QuantityActionSerializer",
           "DiscardSerializer", "InventoryEventSerializer", "BatchStatus"]
