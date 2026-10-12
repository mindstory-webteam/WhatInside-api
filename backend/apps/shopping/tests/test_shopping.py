from datetime import timedelta

import pytest

from apps.inventory.models import InventoryBatch

pytestmark = pytest.mark.django_db


def test_shopping_list_crud_and_purchase(api):
    r = api.post("/api/v1/shopping-list/", {"product_name": "Bread", "quantity": 2, "unit": "pack"}, format="json")
    assert r.status_code == 201
    iid = r.data["id"]
    assert api.post("/api/v1/shopping-list/", {"product_name": "", "quantity": 1}, format="json").status_code == 400
    assert api.post("/api/v1/shopping-list/", {"product_name": "X", "quantity": 0}, format="json").status_code == 400
    assert api.patch(f"/api/v1/shopping-list/{iid}/", {"quantity": 3}, format="json").data["quantity"] == "3.000"
    p1 = api.post(f"/api/v1/shopping-list/{iid}/mark-purchased/")
    p2 = api.post(f"/api/v1/shopping-list/{iid}/mark-purchased/")
    assert p1.data["is_purchased"] and p1.data["purchased_at"] == p2.data["purchased_at"]
    assert api.get("/api/v1/shopping-list/?is_purchased=false").data["count"] == 0
    assert api.delete(f"/api/v1/shopping-list/{iid}/").status_code == 204


def test_shows_existing_inventory(api, add_batch, milk):
    add_batch(quantity="1.5")
    r = api.post("/api/v1/shopping-list/", {"product_name": "milk", "quantity": 1, "unit": "l"}, format="json")
    assert r.data["in_inventory"]["quantity"] == "1.500"
    r = api.post("/api/v1/shopping-list/", {"product": milk.id, "quantity": 1, "unit": "l"}, format="json")
    assert r.data["product_name"] == "Milk" and r.data["in_inventory"] is not None


def test_add_to_inventory_requires_expiry_decision(api, today):
    iid = api.post("/api/v1/shopping-list/", {"product_name": "Butter", "quantity": 1, "unit": "pack"},
                   format="json").data["id"]
    r = api.post(f"/api/v1/shopping-list/{iid}/add-to-inventory/", {"storage_location": "refrigerator"},
                 format="json")
    assert r.status_code == 400 and "expiry_date" in r.data["error"]["details"]
    r = api.post(f"/api/v1/shopping-list/{iid}/add-to-inventory/",
                 {"storage_location": "refrigerator", "expiry_date": (today + timedelta(days=30)).isoformat()},
                 format="json")
    assert r.status_code == 201 and r.data["expiry_confirmed"] is True
    assert InventoryBatch.objects.count() == 1
    again = api.post(f"/api/v1/shopping-list/{iid}/add-to-inventory/", {"expiry_unknown": True}, format="json")
    assert again.status_code == 400
    assert InventoryBatch.objects.count() == 1


def test_add_to_inventory_with_unknown_date_is_flagged(api):
    iid = api.post("/api/v1/shopping-list/", {"product_name": "Rice", "quantity": 5, "unit": "kg"},
                   format="json").data["id"]
    r = api.post(f"/api/v1/shopping-list/{iid}/add-to-inventory/", {"storage_location": "pantry",
                                                                    "expiry_unknown": True}, format="json")
    assert r.status_code == 201 and r.data["needs_review"] is True


def test_shopping_isolation(api, make_user, client_for):
    from apps.households.services import create_household

    iid = api.post("/api/v1/shopping-list/", {"product_name": "Tea"}, format="json").data["id"]
    stranger = make_user()
    other = create_household(user=stranger, name="O", tz="UTC")
    sc = client_for(stranger, other)
    assert sc.patch(f"/api/v1/shopping-list/{iid}/", {"quantity": 9}, format="json").status_code == 404
    assert sc.get("/api/v1/shopping-list/").data["count"] == 0
