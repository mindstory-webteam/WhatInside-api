import base64
import binascii

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import serializers

from apps.inventory.serializers import BatchCreateSerializer


class OcrRequestSerializer(serializers.Serializer):
    image = serializers.ImageField(required=False, help_text="JPEG/PNG/WebP label photo (multipart, server-side OCR)")
    image_base64 = serializers.CharField(
        required=False, allow_blank=False, max_length=12_000_000,
        help_text="Same photo as base64 (optionally a data: URI) in a JSON body — used by the mobile app "
                  "because it works the same in Expo Go and native builds.")
    raw_text = serializers.CharField(required=False, max_length=20000, allow_blank=False,
                                     help_text="Text recognised on-device (ML Kit). Re-normalised on the server.")
    date_order = serializers.ChoiceField(choices=["dmy", "mdy"], required=False,
                                         help_text="Preferred numeric date order; defaults from the user's settings.")

    def validate_image_base64(self, value):
        if value.startswith("data:"):
            value = value.split(",", 1)[-1]
        try:
            data = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            raise serializers.ValidationError("Image data is not valid base64.")
        if len(data) > settings.OCR_MAX_UPLOAD_BYTES:
            raise serializers.ValidationError(
                f"Images must be smaller than {settings.OCR_MAX_UPLOAD_BYTES // 1048576} MB.")
        # Content is verified as a real JPEG/PNG/WebP by load_image(), exactly like uploads.
        return SimpleUploadedFile("label.jpg", data, content_type="application/octet-stream")

    def validate(self, attrs):
        if "image_base64" in attrs:
            attrs["image"] = attrs.pop("image_base64")
        provided = [k for k in ("image", "raw_text") if attrs.get(k)]
        if len(provided) != 1:
            raise serializers.ValidationError("Send exactly one of 'image', 'image_base64' or 'raw_text'.")
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
