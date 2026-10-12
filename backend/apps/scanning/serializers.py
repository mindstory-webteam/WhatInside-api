from rest_framework import serializers

from apps.inventory.serializers import BatchCreateSerializer


class OcrRequestSerializer(serializers.Serializer):
    image = serializers.ImageField(required=False, help_text="JPEG/PNG/WebP label photo (server-side OCR)")
    raw_text = serializers.CharField(required=False, max_length=20000, allow_blank=False,
                                     help_text="Text recognised on-device (ML Kit). Re-normalised on the server.")
    date_order = serializers.ChoiceField(choices=["dmy", "mdy"], required=False,
                                         help_text="Preferred numeric date order; defaults from the user's settings.")

    def validate(self, attrs):
        if bool(attrs.get("image")) == bool(attrs.get("raw_text")):
            raise serializers.ValidationError("Send either 'image' or 'raw_text'.")
        return attrs


class BarcodeRequestSerializer(serializers.Serializer):
    barcode = serializers.CharField(max_length=14)


class ConfirmScanSerializer(BatchCreateSerializer):
    """Saves a reviewed scan. ``confirmed`` must be true — nothing is saved from an unreviewed scan."""

    confirmed = serializers.BooleanField()
    source = serializers.ChoiceField(choices=["ocr", "barcode", "manual"], default="manual")
    expiry_confirmed = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs.get("confirmed"):
            raise serializers.ValidationError({"confirmed": "Review the scanned details and confirm before saving."})
        if "expiry_confirmed" not in attrs:
            # The person reviewed the form; a date they left in place counts as confirmed.
            attrs["expiry_confirmed"] = bool(attrs.get("expiry_date") or attrs.get("best_before_date"))
        return super().validate(attrs)
