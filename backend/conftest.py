"""Shared fixtures. Test data is created per-test inside a transaction and never
touches a real household's inventory."""
from datetime import timedelta

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.households.services import create_household
from apps.products.models import Product


@pytest.fixture
def make_user(db):
    counter = {"n": 0}

    def _make(email=None, name="Test User", password="Str0ng-pass!23", phone=None):
        counter["n"] += 1
        return User.objects.create_user(phone=phone or f"+9198765{counter['n']:05d}",
                                        email=email or f"user{counter['n']}@example.test", password=password, name=name)

    return _make


@pytest.fixture
def user(make_user):
    return make_user(email="anu@example.test", name="Anu", phone="+919876543210")


@pytest.fixture
def household(user):
    return create_household(user=user, name="Anu's Home", tz="Asia/Kolkata")


@pytest.fixture
def client_for():
    def _client(u, household=None):
        c = APIClient()
        c.force_authenticate(u)
        if household is not None:
            c.credentials(HTTP_X_HOUSEHOLD_ID=str(household.id))
        return c

    return _client


@pytest.fixture
def api(client_for, user, household):
    return client_for(user, household)


@pytest.fixture
def today(household):
    return household.local_today()


@pytest.fixture
def milk(household, user):
    return Product.objects.create(household=household, name="Milk", brand="Milma", category="dairy",
                                  default_unit="l", created_by=user)


@pytest.fixture
def add_batch(api, milk, today):
    def _add(days=5, quantity="2", confirmed=True, **extra):
        payload = {"product": milk.id, "quantity": quantity, "unit": "l", "storage_location": "refrigerator",
                   "expiry_confirmed": confirmed, **extra}
        if days is not None:
            payload["expiry_date"] = (today + timedelta(days=days)).isoformat()
        r = api.post("/api/v1/inventory/", payload, format="json")
        assert r.status_code == 201, r.data
        return r.data

    return _add


@pytest.fixture(autouse=True)
def _clear_cache():
    from django.core.cache import cache

    cache.clear()
    yield
