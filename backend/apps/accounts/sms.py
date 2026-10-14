"""Pluggable SMS sending for one-time codes.

``SMS_BACKEND`` selects the provider:

* ``console`` (default) – writes the message to the server log. For development and
  for testing a server before an SMS provider is set up.
* ``msg91``  – MSG91 OTP/Flow API (common in India; needs a DLT-approved template).
* ``twilio`` – Twilio Programmable SMS.

Providers are called with a short timeout; failures raise ``SmsError`` so the API can
tell the user to try again instead of silently pretending the code was sent.
"""
import logging

import requests
from django.conf import settings

from .phone import mask_phone

logger = logging.getLogger(__name__)
TIMEOUT = 8


class SmsError(Exception):
    pass


def otp_message(code: str, purpose: str) -> str:
    what = "verify your mobile number" if purpose == "register" else "reset your password"
    minutes = settings.OTP_TTL_SECONDS // 60
    return f"{code} is your WhatInside code to {what}. It expires in {minutes} minutes. Do not share it."


def send_otp_sms(phone: str, code: str, purpose: str) -> None:
    backend = settings.SMS_BACKEND
    if backend == "console":
        # The code is logged only for the console backend (never with a real provider).
        logger.warning("OTP for %s (%s): %s — console SMS backend, nothing was sent", mask_phone(phone), purpose, code)
        return
    try:
        if backend == "msg91":
            _msg91(phone, code)
        elif backend == "twilio":
            _twilio(phone, otp_message(code, purpose))
        else:
            raise SmsError(f"Unknown SMS_BACKEND '{backend}'")
    except requests.RequestException as exc:
        logger.error("SMS provider request failed", extra={"backend": backend, "error": str(exc)})
        raise SmsError("Could not send the SMS. Please try again.") from exc
    logger.info("OTP SMS sent", extra={"backend": backend, "phone": mask_phone(phone), "purpose": purpose})


def _msg91(phone: str, code: str) -> None:
    res = requests.post(
        "https://control.msg91.com/api/v5/flow",
        headers={"authkey": settings.MSG91_AUTH_KEY, "Content-Type": "application/json", "accept": "application/json"},
        json={"template_id": settings.MSG91_TEMPLATE_ID, "short_url": "0",
              "recipients": [{"mobiles": phone.lstrip("+"), settings.MSG91_OTP_VAR: code}]},
        timeout=TIMEOUT,
    )
    if res.status_code >= 400 or (res.headers.get("content-type", "").startswith("application/json")
                                  and res.json().get("type") == "error"):
        raise SmsError(f"MSG91 error {res.status_code}: {res.text[:200]}")


def _twilio(phone: str, body: str) -> None:
    sid = settings.TWILIO_ACCOUNT_SID
    res = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        auth=(sid, settings.TWILIO_AUTH_TOKEN),
        data={"To": phone, "From": settings.TWILIO_FROM_NUMBER, "Body": body},
        timeout=TIMEOUT,
    )
    if res.status_code >= 400:
        raise SmsError(f"Twilio error {res.status_code}: {res.text[:200]}")
