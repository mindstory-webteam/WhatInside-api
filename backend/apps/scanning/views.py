from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.idempotency import idempotent
from apps.households.scoping import HouseholdScopedMixin, IsHouseholdMember
from apps.inventory import services as inventory_services
from apps.inventory.serializers import BatchSerializer
from apps.products.models import Product
from apps.products.serializers import ProductSerializer

from .ocr_normalizer import normalize_ocr_text
from .providers import ScanError, load_image, lookup_barcode, run_ocr, valid_gtin
from .serializers import BarcodeRequestSerializer, ConfirmScanSerializer, OcrRequestSerializer


def _scan_error(err: ScanError, code=status.HTTP_422_UNPROCESSABLE_ENTITY):
    return Response({"error": {"code": err.code, "message": err.message, "details": None}}, status=code)


class OcrView(HouseholdScopedMixin, APIView):
    """Normalise label text into reviewable fields. Never saves anything.

    Send a photo (multipart, server OCR) or text recognised on-device. Client-side
    parsing is not trusted: the server always re-derives the structured fields.
    """

    permission_classes = [IsHouseholdMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_scope = "scanning"

    @extend_schema(request={"multipart/form-data": OcrRequestSerializer, "application/json": OcrRequestSerializer},
                   responses=OpenApiTypes.OBJECT)
    def post(self, request):
        s = OcrRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = s.validated_data.get("date_order") or ("mdy" if request.user.date_format == "MM/DD/YYYY" else "dmy")
        if "image" in s.validated_data:
            try:
                image = load_image(s.validated_data["image"])
                text = run_ocr(image)
            except ScanError as err:
                http = status.HTTP_503_SERVICE_UNAVAILABLE if err.code in ("ocr_disabled", "ocr_unavailable") \
                    else status.HTTP_400_BAD_REQUEST if err.code in ("file_too_large", "unsupported_type",
                                                                      "invalid_image") \
                    else status.HTTP_422_UNPROCESSABLE_ENTITY
                return _scan_error(err, http)
            finally:
                s.validated_data["image"].close()
            source = "server"
        else:
            text, source = s.validated_data["raw_text"], "device"
        result = normalize_ocr_text(text, prefer_dmy=order == "dmy")
        result["ocr_source"] = source
        if not result["lines"]:
            result["warnings"].insert(0, "No text was detected. Retake the photo closer to the label or enter details "
                                         "manually.")
        return Response(result)


class BarcodeView(HouseholdScopedMixin, APIView):
    permission_classes = [IsHouseholdMember]
    throttle_scope = "scanning"

    @extend_schema(request=BarcodeRequestSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        s = BarcodeRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        code = s.validated_data["barcode"].strip()
        if not valid_gtin(code):
            return Response({"error": {"code": "invalid_barcode", "message": "This barcode is not valid.",
                                       "details": None}}, status=status.HTTP_400_BAD_REQUEST)
        own = Product.objects.filter(household=self.household, barcode=code).first()
        if own:
            return Response({"found": True, "status": "found", "source": "household",
                             "existing_product": ProductSerializer(own, context={"household": self.household}).data,
                             "product": {"name": own.name, "brand": own.brand, "barcode": own.barcode,
                                         "category": own.category, "quantity": None, "unit": own.default_unit,
                                         "image_url": own.image_url},
                             "note": "Barcodes never include the expiry date — add it from the package."})
        result = lookup_barcode(code)
        result["source"] = "provider"
        result["existing_product"] = None
        result["note"] = "Barcodes never include the expiry date — add it from the package."
        if not result["found"]:
            result["product"] = {"name": "", "brand": "", "barcode": code, "category": "other", "quantity": None,
                                 "unit": None, "image_url": ""}
        return Response(result)


class ConfirmScanView(HouseholdScopedMixin, APIView):
    """Create a batch from reviewed scan fields (the only way a scan becomes inventory)."""

    permission_classes = [IsHouseholdMember]

    @extend_schema(request=ConfirmScanSerializer, responses={201: BatchSerializer})
    @idempotent("scanning.confirm")
    def post(self, request):
        today = self.household.local_today()
        ctx = {"household": self.household, "today": today, "request": request}
        s = ConfirmScanSerializer(data=request.data, context=ctx)
        s.is_valid(raise_exception=True)
        product = s.resolve_product(self.household, request.user)
        data = {k: v for k, v in s.validated_data.items()
                if k not in ("product", "new_product", "confirmed", "source")}
        batch = inventory_services.create_batch(household=self.household, actor=request.user, product=product, **data)
        return Response(BatchSerializer(batch, context=ctx).data, status=status.HTTP_201_CREATED)
