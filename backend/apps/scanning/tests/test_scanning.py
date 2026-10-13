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


def test_month_only_expiry_uses_end_of_month_and_stays_uncertain():
    r = normalize_ocr_text("EXP 06/2026")
    f = r["fields"]["expiry_date"]
    assert f["value"] == "2026-06-30"
    assert f["confidence"] == "low" and f["uncertain"] is True
    assert "last day of the month" in f["note"]
    assert r["date_candidates"][0]["precision"] == "month"


def test_month_only_mfg_uses_first_day():
    f = normalize_ocr_text("Mfg. Date: JULY 2025")["fields"]["manufacturing_date"]
    assert f["value"] == "2025-07-01" and f["uncertain"] is True


def test_month_only_unlabelled_is_not_assigned():
    r = normalize_ocr_text("Toned Milk\nAPR 2027")
    assert r["fields"]["expiry_date"]["value"] is None
    assert r["date_candidates"][0]["alternatives"] == ["2027-04-01", "2027-04-30"]


def test_label_on_adjacent_line_below_value():
    # Value box printed above its "Expiry Date :" heading (common on stickers)
    r = normalize_ocr_text("Mfg. Date: JULY 2025 ACME\n/ APR 2027 19, Some Road\nExpiry Date : Chennai\n"
                           "Please check expiry date of products before use.")
    assert r["fields"]["expiry_date"]["value"] == "2027-04-30"
    assert r["fields"]["manufacturing_date"]["value"] == "2025-07-01"
    exp = [c for c in r["date_candidates"] if c["label"] == "expiry"][0]
    assert exp["label_source"] == "adjacent_line"


def test_sentence_mentioning_expiry_is_not_a_label():
    r = normalize_ocr_text("12/12/2027\nPlease check expiry date of products before use")
    assert r["fields"]["expiry_date"]["value"] is None


def test_real_apollo_first_aid_kit_label():
    """OCR text captured from a real pack photo (rotated, two-column sticker)."""
    from pathlib import Path

    text = (Path(__file__).parent / "fixtures_apollo_kit.txt").read_text()
    f = normalize_ocr_text(text)["fields"]
    assert f["manufacturing_date"]["value"] == "2025-07-01"
    assert f["expiry_date"]["value"] == "2027-04-30"
    assert f["expiry_date"]["uncertain"] is True
    assert f["brand"]["value"] == "Apollo"
    assert f["quantity"]["value"] == 1 and f["unit"]["value"] == "pack"
    assert f["batch_number"]["value"] is None  # "Batch No., Mfg, Date" is not a batch number
    assert f["name"]["value"] is None  # no clear name on this pack — better blank than junk


def test_batch_number_requires_digits():
    assert normalize_ocr_text("For the Batch No., Mfg. Date")["fields"]["batch_number"]["value"] is None
    assert normalize_ocr_text("Batch No: B1234")["fields"]["batch_number"]["value"] == "B1234"
    assert normalize_ocr_text("LOT 24A07")["fields"]["batch_number"]["value"] == "24A07"


def test_pack_units():
    f = normalize_ocr_text("Net Qty.: 1 Set")["fields"]
    assert (f["quantity"]["value"], f["unit"]["value"]) == (1, "pack")
    f = normalize_ocr_text("Net Qty: 10 Tablets")["fields"]
    assert (f["quantity"]["value"], f["unit"]["value"]) == (10, "pcs")


def test_brand_line_and_brand_only_line():
    f = normalize_ocr_text("Nestlé\nCurd\nNet Quantity: 400g")["fields"]
    assert f["brand"]["value"] == "Nestlé" and f["name"]["value"] == "Curd"
    f = normalize_ocr_text("Fresh Paneer\nMarketed by: Kerala Dairy Co.")["fields"]
    assert f["brand"]["value"] == "Kerala Dairy"


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


def test_ocr_base64_json_server_side(api):
    pytest.importorskip("pytesseract")
    import base64
    import shutil

    if not shutil.which("tesseract"):
        pytest.skip("tesseract binary not installed")
    b64 = base64.b64encode(_png("EXP 25/12/2026").read()).decode()
    r = api.post("/api/v1/scanning/ocr/", {"image_base64": f"data:image/png;base64,{b64}"}, format="json")
    assert r.status_code == 200, r.data
    assert r.data["ocr_source"] == "server"
    assert "2026" in r.data["raw_text"]


def test_ocr_base64_rejects_garbage_and_non_images(api):
    bad = api.post("/api/v1/scanning/ocr/", {"image_base64": "not base64!!"}, format="json")
    assert bad.status_code == 400
    import base64

    php = base64.b64encode(b"<?php echo 1; ?>").decode()
    r = api.post("/api/v1/scanning/ocr/", {"image_base64": php}, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "invalid_image"


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


@pytest.mark.parametrize("angle", [90, 270])
def test_server_ocr_straightens_sideways_photos(api, angle):
    pytest.importorskip("pytesseract")
    import shutil

    if not shutil.which("tesseract"):
        pytest.skip("tesseract binary not installed")
    img = Image.new("RGB", (1400, 700), "white")
    d = ImageDraw.Draw(img)
    for i, line in enumerate(["FRESH TONED MILK", "Net Qty: 500 ml", "PKD: 01/10/2026", "USE BY: 25/12/2026",
                              "Store below 4 degrees"]):
        d.text((40, 40 + i * 120), line, fill="black", font_size=70)
    buf = io.BytesIO()
    img.rotate(angle, expand=True).save(buf, format="PNG")
    up = SimpleUploadedFile("label.png", buf.getvalue(), content_type="image/png")
    r = api.post("/api/v1/scanning/ocr/", {"image": up}, format="multipart")
    assert r.status_code == 200
    assert r.data["fields"]["expiry_date"]["value"] == "2026-12-25", r.data["raw_text"]


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


def _app_payload(today, **over):
    """Exactly what the mobile app's toConfirmPayload() sends."""
    from datetime import timedelta

    p = {"confirmed": True, "source": "manual",
         "new_product": {"name": "Brown Bread", "brand": "", "barcode": "", "category": "bakery",
                         "default_unit": "pcs", "image_url": ""},
         "quantity": "1", "unit": "pcs", "storage_location": "pantry", "purchase_date": today.isoformat(),
         "manufacturing_date": None, "expiry_date": (today + timedelta(days=4)).isoformat(),
         "best_before_date": None, "expiry_confirmed": True, "batch_number": "", "purchase_price": None}
    p.update(over)
    return p


def test_app_manual_add_payload_saves(api, today):
    r = api.post("/api/v1/scanning/confirm/", _app_payload(today), format="json")
    assert r.status_code == 201, r.data
    assert r.data["product"]["name"] == "Brown Bread" and r.data["needs_review"] is False
    # adding the same product again creates a second batch, not an error
    r2 = api.post("/api/v1/scanning/confirm/", _app_payload(today, quantity="2"), format="json")
    assert r2.status_code == 201 and r2.data["product"]["id"] == r.data["product"]["id"]


def test_app_ocr_payload_with_month_end_expiry_and_past_mfg_saves(api, today):
    r = api.post("/api/v1/scanning/confirm/", _app_payload(
        today, source="ocr", manufacturing_date="2025-07-01", expiry_date="2027-04-30",
        new_product={"name": "First Aid Kit", "brand": "Apollo", "barcode": "8904355401715", "category": "medicine",
                     "default_unit": "pack", "image_url": ""}, unit="pack"), format="json")
    assert r.status_code == 201, r.data
    assert r.data["expiry_date"] == "2027-04-30"


def test_app_unsure_expiry_payload_saves_flagged(api, today):
    r = api.post("/api/v1/scanning/confirm/", _app_payload(today, expiry_date=None, expiry_confirmed=False),
                 format="json")
    assert r.status_code == 201, r.data
    assert r.data["needs_review"] is True
