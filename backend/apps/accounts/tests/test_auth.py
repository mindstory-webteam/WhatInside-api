import re

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.households.models import Household, HouseholdMembership
from apps.inventory.models import InventoryBatch

pytestmark = pytest.mark.django_db


PHONE = "+919812345678"


@pytest.fixture
def otp_codes(settings):
    """Expose codes in API responses (the testing switch) so tests can complete flows."""
    settings.OTP_DEBUG_RETURN_CODE = True
    settings.OTP_RESEND_SECONDS = 0


def send_code(client, phone="98123 45678", purpose="register"):
    return client.post("/api/v1/auth/otp/", {"phone": phone, "purpose": purpose}, format="json")


def register(client, phone="98123 45678", password="Gr33n-leaves!", code=None):
    if code is None:
        code = send_code(client, phone).data["dev_code"]
    return client.post("/api/v1/auth/register/", {"phone": phone, "otp": code, "name": "Meera", "password": password},
                       format="json")


@pytest.mark.parametrize("raw", ["9812345678", "+91 98123 45678", "098123-45678", "0091 9812345678", "919812345678"])
def test_phone_numbers_normalise_to_e164(raw):
    from apps.accounts.phone import normalize_phone

    assert normalize_phone(raw) == PHONE


@pytest.mark.parametrize("raw", ["12345", "5812345678", "98123abc78", "+91 981234567", ""])
def test_invalid_phone_numbers_rejected(raw):
    from apps.accounts.phone import InvalidPhone, normalize_phone

    with pytest.raises(InvalidPhone):
        normalize_phone(raw)


def test_register_with_sms_code_returns_tokens_and_hashes_password(otp_codes):
    r = register(APIClient())
    assert r.status_code == 201, r.data
    assert {"access", "refresh", "user"} <= set(r.data)
    assert r.data["user"]["phone"] == PHONE and "password" not in r.data["user"]
    user = User.objects.get(phone=PHONE)
    assert user.email is None and user.phone_verified_at is not None
    assert user.password.startswith(("pbkdf2", "md5", "argon2", "bcrypt"))
    assert user.check_password("Gr33n-leaves!")


def test_otp_is_hashed_and_never_returned_without_testing_switch(settings):
    from apps.accounts.models import PhoneOTP

    r = send_code(APIClient())
    assert r.status_code == 202 and "dev_code" not in r.data
    assert r.data["sent_to"].endswith("5678") and "98123" not in r.data["sent_to"]
    otp = PhoneOTP.objects.get(phone=PHONE)
    assert len(otp.code_hash) == 64 and not otp.code_hash.isdigit()


def test_register_wrong_code_counts_attempts_and_locks(otp_codes, settings):
    c = APIClient()
    code = send_code(c).data["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for left in range(settings.OTP_MAX_ATTEMPTS - 1, -1, -1):
        r = register(c, code=wrong)
        assert r.status_code == 400 and r.data["error"]["code"] == "otp_invalid"
    r = register(c, code=code)  # even the right code is refused once locked
    assert r.status_code == 400 and r.data["error"]["code"] == "otp_locked"
    assert not User.objects.filter(phone=PHONE).exists()


def test_register_code_is_single_use_and_expires(otp_codes, settings):
    c = APIClient()
    code = send_code(c).data["dev_code"]
    assert register(c, code=code).status_code == 201
    User.objects.filter(phone=PHONE).delete()
    assert register(c, code=code).data["error"]["code"] == "otp_expired"
    settings.OTP_TTL_SECONDS = 0
    code = send_code(c).data["dev_code"]
    assert register(c, code=code).data["error"]["code"] == "otp_expired"


def test_weak_password_does_not_burn_the_code(otp_codes):
    c = APIClient()
    code = send_code(c).data["dev_code"]
    assert register(c, code=code, password="12345678").status_code == 400
    assert register(c, code=code).status_code == 201


def test_register_rejects_number_that_already_has_an_account(otp_codes, user):
    r = send_code(APIClient(), phone="9876543210")
    assert r.status_code == 400 and r.data["error"]["code"] == "phone_taken"


def test_resend_cooldown(settings):
    settings.OTP_RESEND_SECONDS = 30
    c = APIClient()
    assert send_code(c).status_code == 202
    r = send_code(c)
    assert r.status_code == 429 and "wait" in r.data["error"]["message"]


def test_sms_failure_is_reported(settings, monkeypatch):
    from apps.accounts import services
    from apps.accounts.sms import SmsError

    def boom(*a, **k):
        raise SmsError("Could not send the SMS. Please try again.")

    monkeypatch.setattr(services, "send_otp_sms", boom)
    r = send_code(APIClient())
    assert r.status_code == 503 and r.data["error"]["code"] == "sms_failed"


def test_login_with_mobile_number_any_format_refresh_and_logout(otp_codes):
    c = APIClient()
    register(c)
    r = c.post("/api/v1/auth/login/", {"phone": "+91 98123-45678", "password": "Gr33n-leaves!"}, format="json")
    assert r.status_code == 200, r.data
    access, refresh = r.data["access"], r.data["refresh"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert c.get("/api/v1/auth/me/").data["phone"] == PHONE

    r = c.post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json")
    assert r.status_code == 200
    rotated = r.data["refresh"]
    assert c.post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json").status_code == 401
    assert c.post("/api/v1/auth/logout/", {"refresh": rotated}, format="json").status_code == 205
    assert c.post("/api/v1/auth/token/refresh/", {"refresh": rotated}, format="json").status_code == 401


def test_legacy_email_accounts_can_still_sign_in(make_user):
    make_user(email="old@example.test", phone=None)
    User.objects.filter(email="old@example.test").update(phone=None)
    r = APIClient().post("/api/v1/auth/login/", {"email": "Old@Example.test", "password": "Str0ng-pass!23"},
                         format="json")
    assert r.status_code == 200 and r.data["user"]["phone"] is None


def test_login_wrong_password_401_with_error_envelope(user):
    r = APIClient().post("/api/v1/auth/login/", {"phone": "9876543210", "password": "nope"}, format="json")
    assert r.status_code == 401
    assert r.data["error"]["message"] == "Mobile number or password is incorrect."
    r = APIClient().post("/api/v1/auth/login/", {"phone": "9000000000", "password": "nope"}, format="json")
    assert r.status_code == 401


def test_password_reset_by_sms(otp_codes, user):
    c = APIClient()
    # unknown numbers get the same answer and no code
    ghost = c.post("/api/v1/auth/password-reset/", {"phone": "9000000001"}, format="json")
    assert ghost.status_code == 202 and "dev_code" not in ghost.data
    r = c.post("/api/v1/auth/password-reset/", {"phone": "98765 43210"}, format="json")
    assert r.status_code == 202
    code = r.data["dev_code"]
    tokens = c.post("/api/v1/auth/login/", {"phone": "9876543210", "password": "Str0ng-pass!23"}, format="json").data
    ok = c.post("/api/v1/auth/password-reset/confirm/",
                {"phone": "9876543210", "otp": code, "new_password": "An0ther-good-pass"}, format="json")
    assert ok.status_code == 200, ok.data
    user.refresh_from_db()
    assert user.check_password("An0ther-good-pass")
    # every device is signed out
    assert c.post("/api/v1/auth/token/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code == 401
    # code can't be reused
    again = c.post("/api/v1/auth/password-reset/confirm/",
                   {"phone": "9876543210", "otp": code, "new_password": "Yet-an0ther-pass"}, format="json")
    assert again.status_code == 400


def test_admin_backend_accepts_phone_or_email(user):
    from django.contrib.auth import authenticate

    assert authenticate(username="98765 43210", password="Str0ng-pass!23") == user
    assert authenticate(username="anu@example.test", password="Str0ng-pass!23") == user
    assert authenticate(username="98765 43210", password="wrong") is None


def test_me_requires_auth():
    assert APIClient().get("/api/v1/auth/me/").status_code == 401


def test_update_profile_validates_timezone(client_for, user):
    c = client_for(user)
    assert c.patch("/api/v1/auth/me/", {"timezone": "Mars/Olympus"}, format="json").status_code == 400
    r = c.patch("/api/v1/auth/me/", {"preferred_language": "ml", "timezone": "Asia/Dubai"}, format="json")
    assert r.status_code == 200 and r.data["preferred_language"] == "ml"


def test_legacy_email_password_reset_flow_does_not_enumerate(user):
    c = APIClient()
    assert c.post("/api/v1/auth/password-reset/", {"email": "ghost@example.test"}, format="json").status_code == 202
    assert len(mail.outbox) == 0
    assert c.post("/api/v1/auth/password-reset/", {"email": user.email}, format="json").status_code == 202
    body = mail.outbox[0].body
    uid = re.search(r"Code: (\S+)", body).group(1)
    token = re.search(r"Token: (\S+)", body).group(1)
    bad = c.post("/api/v1/auth/password-reset/confirm/",
                 {"uid": uid, "token": "wrong", "new_password": "An0ther-good-pass"}, format="json")
    assert bad.status_code == 400
    ok = c.post("/api/v1/auth/password-reset/confirm/",
                {"uid": uid, "token": token, "new_password": "An0ther-good-pass"}, format="json")
    assert ok.status_code == 200
    user.refresh_from_db()
    assert user.check_password("An0ther-good-pass")


def test_account_deletion_removes_solo_household_and_revokes_access(user, household, add_batch):
    add_batch()
    c = APIClient()
    tokens = c.post("/api/v1/auth/login/", {"phone": user.phone, "password": "Str0ng-pass!23"}, format="json").data
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert c.delete("/api/v1/auth/me/", {"password": "wrong"}, format="json").status_code == 400
    assert c.delete("/api/v1/auth/me/", {"password": "Str0ng-pass!23"}, format="json").status_code == 204
    assert not User.objects.filter(pk=user.pk).exists()
    assert not Household.objects.filter(pk=household.pk).exists()
    assert InventoryBatch.objects.count() == 0
    # access token no longer authenticates; refresh token is blacklisted
    assert c.get("/api/v1/auth/me/").status_code == 401
    anon = APIClient()
    assert anon.post("/api/v1/auth/token/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code == 401


def test_account_deletion_transfers_shared_household(user, household, make_user, client_for):
    partner = make_user()
    HouseholdMembership.objects.create(household=household, user=partner, role="admin")
    client_for(user).delete("/api/v1/auth/me/", {"password": "Str0ng-pass!23"}, format="json")
    household.refresh_from_db()
    assert household.owner == partner
    assert HouseholdMembership.objects.get(household=household, user=partner).role == "owner"
