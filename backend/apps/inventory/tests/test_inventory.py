from datetime import timedelta
from decimal import Decimal

import pytest

from apps.inventory.models import InventoryBatch, InventoryEvent
from apps.products.models import Product

pytestmark = pytest.mark.django_db


def test_product_crud_and_duplicate_rules(api):
    r = api.post("/api/v1/products/", {"name": "Curd", "brand": "Nestlé", "category": "dairy",
                                       "default_unit": "g", "barcode": "8901058000290"}, format="json")
    assert r.status_code == 201
    pid = r.data["id"]
    dup = api.post("/api/v1/products/", {"name": "curd", "brand": "nestlé"}, format="json")
    assert dup.status_code == 400
    assert api.post("/api/v1/products/", {"name": "Other", "barcode": "8901058000290"},
                    format="json").status_code == 400
    assert api.post("/api/v1/products/", {"name": "Bad", "barcode": "12ab"}, format="json").status_code == 400
    assert api.patch(f"/api/v1/products/{pid}/", {"category": "frozen"}, format="json").data["category"] == "frozen"
    assert api.get("/api/v1/products/search/?q=cur").data["count"] == 1
    assert api.delete(f"/api/v1/products/{pid}/").status_code == 204


def test_multiple_batches_keep_their_own_expiry_dates(add_batch, milk):
    first = add_batch(days=3)
    second = add_batch(days=10)
    assert first["expiry_date"] != second["expiry_date"]
    b1 = InventoryBatch.objects.get(pk=first["id"])
    assert b1.expiry_date.isoformat() == first["expiry_date"]
    assert InventoryBatch.objects.filter(product=milk).count() == 2
    assert Product.objects.filter(name="Milk").count() == 1


def test_create_with_new_product_reuses_existing(api, today):
    payload = {"new_product": {"name": "Paneer", "brand": "Milma", "category": "dairy", "default_unit": "g"},
               "quantity": 200, "unit": "g", "expiry_date": (today + timedelta(days=4)).isoformat(),
               "expiry_confirmed": True}
    a = api.post("/api/v1/inventory/", payload, format="json")
    payload["new_product"]["name"] = "paneer"
    b = api.post("/api/v1/inventory/", payload, format="json")
    assert a.data["product"]["id"] == b.data["product"]["id"]


@pytest.mark.parametrize("payload,field", [
    ({"quantity": 0}, "quantity"),
    ({"quantity": -1}, "quantity"),
    ({"quantity": 1, "manufacturing_date": "2030-01-10", "expiry_date": "2030-01-01"}, "manufacturing_date"),
    ({"quantity": 1, "unit": "bushels"}, "unit"),
    ({"quantity": 1, "expiry_confirmed": True}, "expiry_confirmed"),
])
def test_batch_validation(api, milk, payload, field):
    r = api.post("/api/v1/inventory/", {"product": milk.id, **payload}, format="json")
    assert r.status_code == 400
    assert field in str(r.data["error"]["details"])


def test_unknown_expiry_is_allowed_but_flagged(add_batch):
    b = add_batch(days=None, confirmed=False)
    assert b["needs_review"] is True and b["expiry_status"] == "unknown"


def test_unconfirmed_date_is_flagged(add_batch):
    b = add_batch(days=2, confirmed=False)
    assert b["needs_review"] is True and b["expiry_status"] == "unknown"


def test_consume_discard_restock_update_quantities_and_events(api, add_batch):
    b = add_batch(quantity="2", purchase_price="60.00")
    r = api.post(f"/api/v1/inventory/{b['id']}/consume/", {"quantity": "0.5"}, format="json")
    assert r.status_code == 200 and Decimal(r.data["quantity"]) == Decimal("1.5")
    too_much = api.post(f"/api/v1/inventory/{b['id']}/consume/", {"quantity": "5"}, format="json")
    assert too_much.status_code == 400
    r = api.post(f"/api/v1/inventory/{b['id']}/discard/", {"quantity": "0.5", "reason": "spoiled"}, format="json")
    assert Decimal(r.data["quantity"]) == Decimal("1.0")
    r = api.post(f"/api/v1/inventory/{b['id']}/restock/", {"quantity": "1"}, format="json")
    assert Decimal(r.data["quantity"]) == Decimal("2.0")
    r = api.post(f"/api/v1/inventory/{b['id']}/discard/", {"reason": "expired"}, format="json")
    assert r.data["status"] == "discarded" and Decimal(r.data["quantity"]) == 0
    types = list(InventoryEvent.objects.filter(batch_id=b["id"]).order_by("created_at", "id")
                 .values_list("event_type", flat=True))
    assert types == ["added", "consumed", "discarded", "restocked", "discarded"]
    first_discard = InventoryEvent.objects.filter(batch_id=b["id"], event_type="discarded").order_by("id").first()
    assert first_discard.price == Decimal("15.00")  # 60 / 2 L * 0.5 L (estimate)
    assert api.post(f"/api/v1/inventory/{b['id']}/consume/", {"quantity": 1}, format="json").status_code == 400


def test_finish_closes_batch(api, add_batch):
    b = add_batch()
    r = api.post(f"/api/v1/inventory/{b['id']}/finish/", {}, format="json")
    assert r.data["status"] == "finished" and Decimal(r.data["quantity"]) == 0
    assert api.get("/api/v1/inventory/").data["count"] == 0
    assert api.get("/api/v1/inventory/?status=finished").data["count"] == 1


def test_idempotency_key_prevents_double_consume(api, add_batch):
    b = add_batch(quantity="3")
    headers = {"HTTP_IDEMPOTENCY_KEY": "tap-123"}
    r1 = api.post(f"/api/v1/inventory/{b['id']}/consume/", {"quantity": 1}, format="json", **headers)
    r2 = api.post(f"/api/v1/inventory/{b['id']}/consume/", {"quantity": 1}, format="json", **headers)
    assert r1.status_code == r2.status_code == 200
    assert r2["Idempotent-Replayed"] == "true"
    assert InventoryBatch.objects.get(pk=b["id"]).quantity == Decimal("2")


def test_optimistic_version_conflict(api, add_batch):
    b = add_batch()
    ok = api.patch(f"/api/v1/inventory/{b['id']}/", {"storage_location": "freezer", "version": b["version"]},
                   format="json")
    assert ok.status_code == 200 and ok.data["version"] == b["version"] + 1
    stale = api.patch(f"/api/v1/inventory/{b['id']}/", {"notes": "x", "version": b["version"]}, format="json")
    assert stale.status_code == 409
    assert stale.data["error"]["code"] == "conflict"


def test_editing_date_without_confirming_flags_review(api, add_batch, today):
    b = add_batch()
    r = api.patch(f"/api/v1/inventory/{b['id']}/", {"expiry_date": (today + timedelta(days=9)).isoformat()},
                  format="json")
    assert r.data["needs_review"] is True
    r = api.patch(f"/api/v1/inventory/{b['id']}/", {"expiry_confirmed": True}, format="json")
    assert r.data["needs_review"] is False


def test_expiry_filters_and_search_and_sort(api, add_batch, today, household):
    add_batch(days=-2)          # expired
    add_batch(days=0)           # expiring today
    add_batch(days=6)           # expiring soon
    add_batch(days=30)          # fresh
    add_batch(days=None, confirmed=False)  # review
    eggs = Product.objects.create(household=household, name="Eggs", category="dairy")
    api.post("/api/v1/inventory/", {"product": eggs.id, "quantity": 12, "unit": "pcs", "storage_location": "pantry",
                                    "expiry_date": (today + timedelta(days=20)).isoformat(),
                                    "expiry_confirmed": True}, format="json")

    def count(q):
        return api.get(f"/api/v1/inventory/?{q}").data["count"]

    assert count("expiry_status=expired") == 1
    assert count("expiry_status=expiring_soon") == 2
    assert count("expiry_status=fresh") == 2
    assert count("expiry_status=unknown") == 1
    assert count("needs_review=true") == 1
    assert count("storage_location=pantry") == 1
    assert count("search=egg") == 1
    assert count("category=dairy") == 6
    rng = f"expiry_from={today.isoformat()}&expiry_to={(today + timedelta(days=7)).isoformat()}"
    assert count(rng) == 2
    names = [b["product"]["name"] for b in api.get("/api/v1/inventory/?ordering=product_name").data["results"]]
    assert names[0] == "Eggs"
    exp = [b["effective_expiry"] for b in api.get("/api/v1/inventory/?ordering=effective_expiry").data["results"]]
    known = [e for e in exp if e]
    assert known == sorted(known)


def test_delete_batch_keeps_history(api, add_batch):
    b = add_batch()
    assert api.delete(f"/api/v1/inventory/{b['id']}/").status_code == 204
    assert InventoryEvent.objects.filter(event_type="deleted", product_name="Milk").exists()
    assert api.get("/api/v1/inventory/activity/").data["count"] >= 2


def test_unauthenticated_inventory_denied():
    from rest_framework.test import APIClient

    assert APIClient().get("/api/v1/inventory/").status_code == 401


def test_user_without_household_gets_clear_error(client_for, make_user):
    r = client_for(make_user()).get("/api/v1/inventory/")
    assert r.status_code == 403
    assert "household" in r.data["error"]["message"].lower()
