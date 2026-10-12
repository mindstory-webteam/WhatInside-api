from decimal import Decimal

from rest_framework import serializers

from apps.inventory.models import StorageLocation
from apps.products.models import Category, Product

from .models import ShoppingListItem


class ShoppingListItemSerializer(serializers.ModelSerializer):
    in_inventory = serializers.SerializerMethodField()

    class Meta:
        model = ShoppingListItem
        fields = ["id", "product_name", "product", "quantity", "unit", "note", "is_purchased", "purchased_at",
                  "added_to_inventory", "in_inventory", "created_at", "updated_at"]
        read_only_fields = ["id", "is_purchased", "purchased_at", "added_to_inventory", "in_inventory",
                            "created_at", "updated_at"]
        extra_kwargs = {"product_name": {"required": False}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        household = self.context.get("household")
        if household is not None:
            self.fields["product"].queryset = Product.objects.filter(household=household)

    def get_in_inventory(self, obj) -> dict | None:
        """Show when a similar product is already at home: {"quantity", "unit", "batches"}."""
        index = self.context.get("inventory_index", {})
        hit = index.get(("id", obj.product_id)) if obj.product_id else None
        hit = hit or index.get(("name", obj.product_name.strip().lower()))
        return hit

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate(self, attrs):
        household = self.context["household"]
        product = attrs.get("product")
        if product is not None and product.household_id != household.id:
            raise serializers.ValidationError({"product": "Product not found."})
        name = (attrs.get("product_name") or "").strip()
        if not name and product is not None:
            attrs["product_name"] = product.name
        elif not name and not self.instance:
            raise serializers.ValidationError({"product_name": "Enter an item name."})
        return attrs


class AddToInventorySerializer(serializers.Serializer):
    """Converting a purchase into inventory requires an explicit decision about the expiry date."""

    storage_location = serializers.ChoiceField(choices=StorageLocation.choices, default=StorageLocation.REFRIGERATOR)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"), required=False)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    best_before_date = serializers.DateField(required=False, allow_null=True)
    expiry_unknown = serializers.BooleanField(default=False,
                                              help_text="Set true to save without a date; the batch is flagged.")
    purchase_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False,
                                              allow_null=True)
    category = serializers.ChoiceField(choices=Category.choices, required=False)

    def validate(self, attrs):
        has_date = attrs.get("expiry_date") or attrs.get("best_before_date")
        if not has_date and not attrs.get("expiry_unknown"):
            raise serializers.ValidationError(
                {"expiry_date": "Confirm the expiry date, or mark it as unknown to review later."})
        if has_date and attrs.get("expiry_unknown"):
            raise serializers.ValidationError({"expiry_unknown": "You entered a date — uncheck 'unknown'."})
        return attrs


__all__ = ["ShoppingListItemSerializer", "AddToInventorySerializer", "Product"]
