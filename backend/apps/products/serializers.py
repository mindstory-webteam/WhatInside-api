from rest_framework import serializers

from .models import Product

MAX_IMAGE_BYTES = 5 * 1024 * 1024


class ProductSerializer(serializers.ModelSerializer):
    active_quantity = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True, required=False)
    active_batch_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Product
        fields = ["id", "household", "name", "brand", "barcode", "category", "default_unit", "image", "image_url",
                  "active_quantity", "active_batch_count", "created_at", "updated_at"]
        read_only_fields = ["id", "household", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def validate_barcode(self, value):
        value = (value or "").strip()
        if value and (not value.isdigit() or not 6 <= len(value) <= 14):
            raise serializers.ValidationError("Barcode must be 6–14 digits.")
        return value

    def validate_image(self, value):
        if value and value.size > MAX_IMAGE_BYTES:
            raise serializers.ValidationError("Image must be 5 MB or smaller.")
        return value

    def validate(self, attrs):
        household = self.context["household"]
        qs = Product.objects.filter(household=household)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        barcode = attrs.get("barcode", getattr(self.instance, "barcode", ""))
        name = attrs.get("name", getattr(self.instance, "name", ""))
        brand = attrs.get("brand", getattr(self.instance, "brand", ""))
        if barcode and qs.filter(barcode=barcode).exists():
            raise serializers.ValidationError({"barcode": "A product with this barcode already exists."})
        if qs.filter(name__iexact=name, brand__iexact=brand or "").exists():
            raise serializers.ValidationError({"name": "This product already exists in your household."})
        return attrs
