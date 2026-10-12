from decimal import Decimal

import pytest

pytestmark = pytest.mark.django_db


def test_dashboard_summary_counts(api, add_batch):
    add_batch(days=-1)
    add_batch(days=3)
    add_batch(days=30, storage_location="freezer")
    add_batch(days=None, confirmed=False, storage_location="pantry")
    api.post("/api/v1/shopping-list/", {"product_name": "Eggs"}, format="json")
    s = api.get("/api/v1/dashboard/summary/").data
    assert s["total_active_batches"] == 4
    assert s["expired"] == 1
    assert s["expiring_soon"] == 1
    assert s["review_required"] == 1
    assert s["storage"] == {"refrigerator": 2, "freezer": 1, "pantry": 1, "other": 0}
    assert s["shopping_list_count"] == 1
    assert api.get("/api/v1/dashboard/expiring-soon/").data["count"] == 1
    assert api.get("/api/v1/dashboard/expiring-soon/?days=60").data["count"] == 2
    assert api.get("/api/v1/dashboard/expired/").data["count"] == 1
    assert api.get("/api/v1/dashboard/review-required/").data["count"] == 1


def test_dashboard_excludes_closed_batches(api, add_batch):
    b = add_batch(days=-1)
    api.post(f"/api/v1/inventory/{b['id']}/discard/", {"reason": "expired"}, format="json")
    s = api.get("/api/v1/dashboard/summary/").data
    assert s["expired"] == 0 and s["total_active_batches"] == 0


def test_analytics_waste_and_overview(api, add_batch):
    a = add_batch(days=5, quantity="2", purchase_price="100")
    b = add_batch(days=-2, quantity="1", purchase_price="40")
    c = add_batch(days=4, quantity="1")  # no price
    api.post(f"/api/v1/inventory/{a['id']}/consume/", {"quantity": 1}, format="json")
    api.post(f"/api/v1/inventory/{b['id']}/discard/", {"reason": "expired"}, format="json")
    api.post(f"/api/v1/inventory/{c['id']}/discard/", {"reason": "spoiled"}, format="json")
    o = api.get("/api/v1/analytics/overview/").data
    assert o["total_products_added"] == 3
    assert o["products_consumed"] == 1
    assert o["products_used_before_expiry"] == 1
    assert o["products_discarded"] == 2
    assert o["expiry_related_waste"] == 1
    assert len(o["monthly_activity"]) == 1
    w = api.get("/api/v1/analytics/waste/").data
    assert Decimal(w["estimated_waste_cost"]) == Decimal("40.00")
    assert w["estimate_coverage"] == {"priced_discards": 1, "total_discards": 2}
    assert w["frequently_discarded"][0]["product_name"] == "Milk"
    assert "estimate" in w["disclaimer"].lower()
