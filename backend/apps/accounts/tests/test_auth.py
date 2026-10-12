import re

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.households.models import Household, HouseholdMembership
from apps.inventory.models import InventoryBatch

pytestmark = pytest.mark.django_db


def register(client, email="new@example.test", password="Gr33n-leaves!"):
    return client.post("/api/v1/auth/register/", {"email": email, "name": "Meera", "password": password},
                       format="json")


def test_register_returns_tokens_and_hashes_password():
    r = register(APIClient())
    assert r.status_code == 201
    assert {"access", "refresh", "user"} <= set(r.data)
    assert "password" not in r.data["user"]
    user = User.objects.get(email="new@example.test")
    assert user.password.startswith(("pbkdf2", "md5", "argon2", "bcrypt"))
    assert user.check_password("Gr33n-leaves!")


def test_register_rejects_duplicate_email_case_insensitive():
    c = APIClient()
    register(c)
    r = register(c, email="NEW@example.test")
    assert r.status_code == 400
    assert r.data["error"]["code"] == "validation_error"


def test_register_rejects_weak_password():
    r = register(APIClient(), password="12345678")
    assert r.status_code == 400


def test_login_refresh_and_logout_blacklists_refresh():
    c = APIClient()
    register(c)
    r = c.post("/api/v1/auth/login/", {"email": "New@Example.test", "password": "Gr33n-leaves!"}, format="json")
    assert r.status_code == 200
    access, refresh = r.data["access"], r.data["refresh"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert c.get("/api/v1/auth/me/").data["email"] == "new@example.test"

    r = c.post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json")
    assert r.status_code == 200
    rotated = r.data["refresh"]
    # rotation blacklists the old refresh token
    assert c.post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json").status_code == 401

    assert c.post("/api/v1/auth/logout/", {"refresh": rotated}, format="json").status_code == 205
    assert c.post("/api/v1/auth/token/refresh/", {"refresh": rotated}, format="json").status_code == 401


def test_login_wrong_password_401_with_error_envelope():
    c = APIClient()
    register(c)
    r = c.post("/api/v1/auth/login/", {"email": "new@example.test", "password": "nope"}, format="json")
    assert r.status_code == 401
    assert "error" in r.data


def test_me_requires_auth():
    assert APIClient().get("/api/v1/auth/me/").status_code == 401


def test_update_profile_validates_timezone(client_for, user):
    c = client_for(user)
    assert c.patch("/api/v1/auth/me/", {"timezone": "Mars/Olympus"}, format="json").status_code == 400
    r = c.patch("/api/v1/auth/me/", {"preferred_language": "ml", "timezone": "Asia/Dubai"}, format="json")
    assert r.status_code == 200 and r.data["preferred_language"] == "ml"


def test_password_reset_flow_does_not_enumerate(user):
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
    tokens = c.post("/api/v1/auth/login/", {"email": user.email, "password": "Str0ng-pass!23"}, format="json").data
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
