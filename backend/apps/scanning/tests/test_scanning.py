import io

import pytest
import requests
import responses
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image, ImageDraw

from apps.inventory.models import InventoryBatch
from apps.scanning.ocr_normalizer import normalize_ocr_text
from apps.scanning.providers import valid_gtin

pytestmark = pytest.mark.django_db

LABEL = """Nestlé
Curd
Net Quantity: 400g
MFD: 12/05/2025
EXP: 11/06/2025
Batch No: B1234"""


# ----------------------------------------------------------- normalisation

def test_labelled_dates_are_classified_and_not_confused():
    r = normalize_ocr_text(LABEL)
    f = r["fields"]
    assert f["manufacturing_date"]["value"] == "2025-05-12"
    assert f["expiry_date"]["value"] == "2025-06-11"
    assert f["expiry_date"]["value"] != f["manufacturing_date"]["value"]
    assert f["quantity"]["value"] == 400 and f["unit"]["value"] == "g"
    assert f["batch_number"]["value"] == "B1234"
    assert f["brand"]["value"] == "Nestlé"
    assert r["requires_review"] is True


def test_dates_inferred_from_consistency_are_still_uncertain():
    f = normalize_ocr_text(LABEL)["fields"]
    # both dates could be read either way; resolved by MFG <= EXP but flagged for review
    assert f["expiry_date"]["uncertain"] is True


def test_month_name_formats():
    f = normalize_ocr_text("USE BY 15 AUG 2026\nPKD ON: 01-Jul-26")["fields"]
    assert f["expiry_date"]["value"] == "2026-08-15"
    assert f["expiry_date"]["confidence"] == "high"
    assert f["manufacturing_date"]["value"] == "2026-07-01"
    assert f["manufacturing_date"]["uncertain"] is True  # packed-on date reused as MFG


def test_label_on_previous_line():
    f = normalize_ocr_text("BEST BEFORE\n20.09.2026")["fields"]
    assert f["best_before_date"]["value"] == "2026-09-20"
    assert f["expiry_date"]["value"] is None


def test_unlabelled_date_is_never_assumed_to_be_expiry():
    r = normalize_ocr_text("Fresh Milk\n25/12/2026")
    assert r["fields"]["expiry_date"]["value"] is None
    assert r["date_candidates"][0]["label"] == "unknown"
    assert any("no label" in w for w in r["warnings"])


def test_manufacturing_date_alone_does_not_become_expiry():
    f = normalize_ocr_text("MFG DATE 03/04/2026")["fields"]
    assert f["expiry_date"]["value"] is None and f["best_before_date"]["value"] is None
    assert f["manufacturing_date"]["value"] is not None


def test_ambiguous_day_month_is_flagged():
    r = normalize_ocr_text("EXP 05/04/2026")
    f = r["fields"]["expiry_date"]
    assert f["value"] == "2026-04-05" and f["confidence"] == "low" and f["uncertain"]
    assert r["date_candidates"][0]["alternatives"] == ["2026-05-04"]
    assert normalize_ocr_text("EXP 05/04/2026", prefer_dmy=False)["fields"]["expiry_date"]["value"] == "2026-05-04"


def test_unambiguous_numeric_date_is_high_confidence():
    f = normalize_ocr_text("EXP: 25/12/2026")["fields"]["expiry_date"]
    assert f["value"] == "2026-12-25" and f["confidence"] == "high"


def test_month_only_expiry_is_not_guessed():
    r = normalize_ocr_text("EXP 06/2026")
    assert r["fields"]["expiry_date"]["value"] is None
    assert r["date_candidates"][0]["precision"] == "month"


def test_relative_shelf_life_is_only_a_suggestion():
    r = normalize_ocr_text("MFD 03 MAR 2026\nBest before 6 months from manufacture")
    assert r["fields"]["best_before_date"]["value"] is None
    sugg = [c for c in r["date_candidates"] if c["precision"] == "relative"][0]
    assert sugg["value"] == "2026-09-03"


def test_conflicting_expiry_dates_require_choice():
    r = normalize_ocr_text("EXP 20/10/2026\nEXP 25/10/2026")
    assert r["fields"]["expiry_date"]["value"] is None
    assert "choose" in r["fields"]["expiry_date"]["note"].lower()


def test_ocr_endpoint_with_device_text(api):
    r = api.post("/api/v1/scanning/ocr/", {"raw_text": LABEL}, format="json")
    assert r.status_code == 200
    assert r.data["ocr_source"] == "device"
    assert r.data["fields"]["expiry_date"]["value"] == "2025-06-11"
    assert InventoryBatch.objects.count() == 0  # scanning never saves


def test_ocr_endpoint_requires_exactly_one_input(api):
    assert api.post("/api/v1/scanning/ocr/", {}, format="json").status_code == 400


def _png(text="EXP 25/12/2026"):
    img = Image.new("RGB", (900, 200), "white")
    ImageDraw.Draw(img).text((20, 80), text, fill="black", font_size=48)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return SimpleUploadedFile("label.png", buf.getvalue(), content_type="image/png")


def test_ocr_upload_rejects_non_images(api):
    fake = SimpleUploadedFile("x.png", b"<?php echo 'hi'; ?>", content_type="image/png")
    r = api.post("/api/v1/scanning/ocr/", {"image": fake}, format="multipart")
    assert r.status_code == 400


@override_settings(OCR_MAX_UPLOAD_BYTES=100)
def test_ocr_upload_rejects_large_files(api):
    r = api.post("/api/v1/scanning/ocr/", {"image": _png()}, format="multipart")
    assert r.status_code == 400 and r.data["error"]["code"] == "file_too_large"


@override_settings(OCR_PROVIDER="disabled")
def test_ocr_upload_when_disabled(api):
    r = api.post("/api/v1/scanning/ocr/", {"image": _png()}, format="multipart")
    assert r.status_code == 503


def test_ocr_upload_server_side(api):
    pytest.importorskip("pytesseract")
    import shutil

    if not shutil.which("tesseract"):
        pytest.skip("tesseract binary not installed")
    r = api.post("/api/v1/scanning/ocr/", {"image": _png("EXP 25/12/2026")}, format="multipart")
    assert r.status_code == 200
    assert r.data["ocr_source"] == "server"
    assert "2026" in r.data["raw_text"]


# ----------------------------------------------------------- barcode

def test_gtin_checksum():
    assert valid_gtin("4006381333931") is True
    assert valid_gtin("4006381333932") is False
    assert valid_gtin("abc") is False


OFF = "https://world.openfoodfacts.org/api/v2/product/4006381333931.json"


@responses.activate
def test_barcode_found(api):
    responses.add(responses.GET, OFF, json={"status": 1, "product": {
        "product_name": "Textmarker", "brands": "Stabilo, X", "quantity": "500 ml",
        "categories_tags": ["en:beverages"]}})
    r = api.post("/api/v1/scanning/barcode/", {"barcode": "4006381333931"}, format="json")
    assert r.status_code == 200 and r.data["found"] is True
    p = r.data["product"]
    assert p["brand"] == "Stabilo" and p["quantity"] == 500 and p["unit"] == "ml" and p["category"] == "beverages"
    assert "expiry_date" not in p


@responses.activate
def test_barcode_not_found_allows_custom_product(api):
    responses.add(responses.GET, OFF, status=404, json={"status": 0})
    r = api.post("/api/v1/scanning/barcode/", {"barcode": "4006381333931"}, format="json")
    assert r.status_code == 200 and r.data["found"] is False and r.data["status"] == "not_found"
    assert r.data["product"]["barcode"] == "4006381333931"


@responses.activate
def test_barcode_provider_timeout(api):
    from django.core.cache import cache

    cache.clear()
    responses.add(responses.GET, OFF, body=requests.Timeout())
    r = api.post("/api/v1/scanning/barcode/", {"barcode": "4006381333931"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "provider_timeout"


@responses.activate
def test_barcode_provider_error(api):
    from django.core.cache import cache

    cache.clear()
    responses.add(responses.GET, OFF, status=502)
    r = api.post("/api/v1/scanning/barcode/", {"barcode": "4006381333931"}, format="json")
    assert r.data["status"] == "provider_unavailable"


def test_invalid_barcode_rejected(api):
    assert api.post("/api/v1/scanning/barcode/", {"barcode": "4006381333932"}, format="json").status_code == 400


def test_barcode_prefers_household_product(api, household):
    from apps.products.models import Product

    Product.objects.create(household=household, name="Our Ghee", barcode="4006381333931")
    r = api.post("/api/v1/scanning/barcode/", {"barcode": "4006381333931"}, format="json")
    assert r.data["source"] == "household" and r.data["existing_product"]["name"] == "Our Ghee"


# ----------------------------------------------------------- confirm

def test_confirm_requires_explicit_confirmation(api):
    payload = {"new_product": {"name": "Curd", "brand": "Nestlé"}, "quantity": 400, "unit": "g",
               "expiry_date": "2030-06-11", "source": "ocr"}
    assert api.post("/api/v1/scanning/confirm/", {**payload, "confirmed": False}, format="json").status_code == 400
    assert InventoryBatch.objects.count() == 0
    r = api.post("/api/v1/scanning/confirm/", {**payload, "confirmed": True}, format="json")
    assert r.status_code == 201
    assert r.data["expiry_confirmed"] is True and r.data["needs_review"] is False


def test_confirm_without_date_is_flagged(api):
    r = api.post("/api/v1/scanning/confirm/", {"new_product": {"name": "Rice"}, "quantity": 1, "unit": "kg",
                                               "confirmed": True}, format="json")
    assert r.status_code == 201 and r.data["needs_review"] is True
