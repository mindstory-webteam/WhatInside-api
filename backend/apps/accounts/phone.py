"""Phone number normalisation to E.164 (e.g. "+919876543210").

Users type numbers in many shapes — "98765 43210", "098765-43210", "+91 98765 43210",
"0091…". We store exactly one canonical form so lookups, uniqueness and SMS sending
all agree. Numbers without a country code get ``DEFAULT_PHONE_COUNTRY_CODE`` (India).
"""
import re

from django.conf import settings

_STRIP = re.compile(r"[\s\-().]")


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str, default_cc: str | None = None) -> str:
    cc = (default_cc or getattr(settings, "DEFAULT_PHONE_COUNTRY_CODE", "91")).lstrip("+")
    s = _STRIP.sub("", str(raw or ""))
    if s.startswith("00"):
        s = "+" + s[2:]
    if s.startswith("+"):
        digits = s[1:]
        if not digits.isdigit():
            raise InvalidPhone("Enter a valid mobile number.")
    else:
        if not s.isdigit():
            raise InvalidPhone("Enter a valid mobile number.")
        digits = s.lstrip("0")
        if not (digits.startswith(cc) and len(digits) - len(cc) >= 8 and len(digits) > 10):
            digits = cc + digits
    if not 8 <= len(digits) <= 15:
        raise InvalidPhone("Enter a valid mobile number.")
    if digits.startswith("91"):  # India: 10-digit mobile numbers starting 6–9
        national = digits[2:]
        if len(national) != 10 or national[0] not in "6789":
            raise InvalidPhone("Enter a valid 10-digit mobile number.")
    return "+" + digits


def mask_phone(phone: str) -> str:
    """"+919876543210" → "+91 ••••••3210" for messages and logs."""
    if not phone or len(phone) < 6:
        return phone or ""
    return f"{phone[:3]} {'•' * (len(phone) - 7)}{phone[-4:]}"
