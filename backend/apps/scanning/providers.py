"""Pluggable OCR and barcode providers (selected with OCR_PROVIDER / BARCODE_PROVIDER)."""
import io
import logging

import requests
from django.conf import settings
from django.core.cache import cache
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard


class ScanError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


# ------------------------------------------------------------------ OCR

def load_image(upload) -> Image.Image:
    """Validate an uploaded image fully in memory. Nothing is written to disk."""
    if upload.size > settings.OCR_MAX_UPLOAD_BYTES:
        raise ScanError("file_too_large", f"Images must be smaller than {settings.OCR_MAX_UPLOAD_BYTES // 1048576} MB.")
    data = upload.read()
    try:
        probe = Image.open(io.BytesIO(data))
        fmt = probe.format
        probe.verify()  # structural check
        if fmt not in ALLOWED_IMAGE_FORMATS:
            raise ScanError("unsupported_type", "Upload a JPEG, PNG or WebP image.")
        image = Image.open(io.BytesIO(data))
        image.load()
    except ScanError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError):
        raise ScanError("invalid_image", "The file is not a valid image.")
    return ImageOps.exif_transpose(image)


def _mean_confidence(pytesseract, img) -> float:
    """Quality score for a reading: confident real words count, noise doesn't."""
    data = pytesseract.image_to_data(img, config="--psm 11", output_type=pytesseract.Output.DICT, timeout=15)
    good = [float(c) for c, w in zip(data["conf"], data["text"])
            if w.strip() and len(w.strip()) > 1 and float(c) > 0]
    return sum(c for c in good if c > 60) / 100.0


def upright(pytesseract, gray: Image.Image) -> Image.Image:
    """Rotate a sideways/upside-down label photo so text reads left-to-right.

    Tesseract's orientation detection (OSD) is tried first. If it can't decide
    (too little text, low confidence), each 90° rotation of a small preview is
    scored and the best one is used.
    """
    try:
        osd = pytesseract.image_to_osd(gray, config="--psm 0", timeout=15,
                                       output_type=pytesseract.Output.DICT)
        if float(osd.get("orientation_conf", 0)) >= 1.5:
            angle = (360 - int(osd.get("rotate", 0))) % 360  # PIL rotates counter-clockwise
            return gray.rotate(angle, expand=True) if angle else gray
    except (pytesseract.TesseractError, RuntimeError, ValueError):
        pass
    preview = gray.copy()
    preview.thumbnail((1000, 1000))
    scores = {}
    for angle in (0, 90, 270, 180):
        try:
            scores[angle] = _mean_confidence(pytesseract, preview.rotate(angle, expand=True))
        except (pytesseract.TesseractError, RuntimeError):
            scores[angle] = 0
    best = max(scores, key=lambda a: (scores[a], a == 0))
    return gray.rotate(best, expand=True) if best and scores[best] > scores.get(0, 0) * 1.3 else gray


def run_ocr(image: Image.Image) -> str:
    provider = settings.OCR_PROVIDER
    if provider == "disabled":
        raise ScanError("ocr_disabled", "Server-side OCR is disabled. Use on-device scanning or enter details manually.")
    if provider == "tesseract":
        try:
            import pytesseract
        except ImportError:  # pragma: no cover
            raise ScanError("ocr_unavailable", "OCR engine is not installed on the server.")
        gray = ImageOps.autocontrast(image.convert("L"))
        longest = max(gray.size)
        if longest < 1200:  # small photos OCR better upscaled
            scale = 1200 / longest
            gray = gray.resize((int(gray.width * scale), int(gray.height * scale)))
        elif longest > 2400:  # huge photos are slow and don't read better
            gray.thumbnail((2400, 2400))
        try:
            gray = upright(pytesseract, gray)
            # psm 4 = "single column of text of variable sizes": best for printed pack labels.
            return pytesseract.image_to_string(gray, config="--psm 4", timeout=30)
        except (RuntimeError, pytesseract.TesseractError, pytesseract.TesseractNotFoundError) as exc:
            logger.warning("Tesseract failed: %s", exc.__class__.__name__)
            raise ScanError("ocr_failed", "Text could not be read from this image. Try again with better light.")
    raise ScanError("ocr_disabled", f"Unknown OCR provider '{provider}'.")


# ------------------------------------------------------------------ Barcode

def valid_gtin(code: str) -> bool:
    """Check digit validation for EAN-8, UPC-A (12), EAN-13 and GTIN-14."""
    if not code.isdigit() or not 6 <= len(code) <= 14:
        return False
    if len(code) not in (8, 12, 13, 14):
        return True  # e.g. UPC-E; no check digit validation here
    digits = [int(c) for c in code]
    check = digits.pop()
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digits)))
    return (10 - total % 10) % 10 == check


OFF_CATEGORY_MAP = [
    ("dairies", "dairy"), ("milk", "dairy"), ("cheese", "dairy"), ("yogurt", "dairy"),
    ("meats", "meat_seafood"), ("seafood", "meat_seafood"), ("fish", "meat_seafood"),
    ("fruits", "produce"), ("vegetables", "produce"), ("breads", "bakery"), ("biscuits", "snacks"),
    ("beverages", "beverages"), ("frozen", "frozen"), ("cereals", "grains"), ("legumes", "grains"),
    ("snacks", "snacks"), ("sauces", "condiments"), ("spices", "condiments"), ("condiments", "condiments"),
]


def _map_category(tags):
    for tag in tags or []:
        for key, cat in OFF_CATEGORY_MAP:
            if key in tag:
                return cat
    return "other"


def _parse_quantity(text: str):
    from .ocr_normalizer import QTY_RE, UNIT_MAP

    m = QTY_RE.search(text or "")
    if not m:
        return None, None
    return float(m.group("num").replace(",", ".")), UNIT_MAP[m.group("unit").lower()]


def lookup_barcode(barcode: str) -> dict:
    """Return {"found": bool, "status": ..., "product": {...}|None}. Never contains an expiry date:
    barcodes identify a product type, not the package in your hand."""
    if settings.BARCODE_PROVIDER == "disabled":
        return {"found": False, "status": "provider_disabled", "product": None}
    cache_key = f"barcode:{settings.BARCODE_PROVIDER}:{barcode}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        resp = requests.get(
            settings.BARCODE_PROVIDER_URL.format(barcode=barcode),
            params={"fields": "product_name,brands,quantity,categories_tags,image_front_small_url,image_url"},
            headers={"User-Agent": settings.BARCODE_USER_AGENT},
            timeout=settings.BARCODE_PROVIDER_TIMEOUT,
        )
    except requests.Timeout:
        return {"found": False, "status": "provider_timeout", "product": None}
    except requests.RequestException:
        return {"found": False, "status": "provider_unavailable", "product": None}
    if resp.status_code == 404:
        result = {"found": False, "status": "not_found", "product": None}
        cache.set(cache_key, result, 3600)
        return result
    if resp.status_code >= 400:
        return {"found": False, "status": "provider_unavailable", "product": None}
    try:
        payload = resp.json()
    except ValueError:
        return {"found": False, "status": "provider_unavailable", "product": None}
    p = payload.get("product") or {}
    if payload.get("status") in (0, "failure") or not p.get("product_name"):
        result = {"found": False, "status": "not_found", "product": None}
        cache.set(cache_key, result, 3600)
        return result
    qty, unit = _parse_quantity(p.get("quantity", ""))
    result = {
        "found": True,
        "status": "found",
        "product": {
            "name": p.get("product_name", "").strip()[:200],
            "brand": (p.get("brands") or "").split(",")[0].strip()[:120],
            "barcode": barcode,
            "category": _map_category(p.get("categories_tags")),
            "quantity": qty,
            "unit": unit,
            "image_url": p.get("image_front_small_url") or p.get("image_url") or "",
        },
    }
    cache.set(cache_key, result, 86400)
    return result
