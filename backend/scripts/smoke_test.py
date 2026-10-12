"""End-to-end API smoke test against a running server.

    python scripts/smoke_test.py http://localhost:8000

Creates a throwaway user (smoke-<random>@example.test), walks the main flow, then
deletes the account so no test data is left in the database.
"""
import secrets
import sys
from datetime import date, timedelta

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api/v1"
S = requests.Session()


def call(method, path, expected, **kw):
    r = S.request(method, BASE + path, timeout=30, **kw)
    assert r.status_code == expected, f"{method} {path} -> {r.status_code}: {r.text[:300]}"
    print(f"  ✓ {method:6} {path:45} {r.status_code}")
    return r.json() if r.content else None


def main():
    email, pw = f"smoke-{secrets.token_hex(4)}@example.test", "Smoke-Test-" + secrets.token_hex(6)
    print("Auth")
    tokens = call("POST", "/auth/register/", 201, json={"email": email, "name": "Smoke", "password": pw})
    S.headers["Authorization"] = f"Bearer {tokens['access']}"
    call("GET", "/auth/me/", 200)
    tokens = call("POST", "/auth/login/", 200, json={"email": email, "password": pw})
    S.headers["Authorization"] = f"Bearer {tokens['access']}"

    print("Household")
    hh = call("POST", "/households/", 201, json={"name": "Smoke Home", "timezone": "Asia/Kolkata"})
    S.headers["X-Household-ID"] = str(hh["id"])

    print("OCR → review → confirm")
    exp = date.today() + timedelta(days=5)
    ocr = call("POST", "/scanning/ocr/", 200, json={
        "raw_text": f"Milma\nToned Milk\nNet Qty 500 ml\nPKD 01/10/2026\nUSE BY {exp:%d %b %Y}"})
    f = ocr["fields"]
    assert f["expiry_date"]["value"] == exp.isoformat(), f
    batch = call("POST", "/scanning/confirm/", 201, headers={"Idempotency-Key": "smoke-1"}, json={
        "confirmed": True, "source": "ocr", "quantity": f["quantity"]["value"], "unit": f["unit"]["value"],
        "storage_location": "refrigerator", "expiry_date": f["expiry_date"]["value"],
        "new_product": {"name": f["name"]["value"] or "Milk", "brand": f["brand"]["value"] or "", "category": "dairy"},
    })
    again = call("POST", "/scanning/confirm/", 201, headers={"Idempotency-Key": "smoke-1"}, json={"confirmed": True})
    assert again["id"] == batch["id"], "idempotent replay should return the same batch"

    print("Second batch keeps its own date")
    b2 = call("POST", "/inventory/", 201, json={"product": batch["product"]["id"], "quantity": 1, "unit": "l",
                                                "expiry_date": (exp + timedelta(days=7)).isoformat(),
                                                "expiry_confirmed": True})
    assert call("GET", f"/inventory/{batch['id']}/", 200)["expiry_date"] == exp.isoformat()

    print("Consume / discard / dashboard")
    call("POST", f"/inventory/{batch['id']}/consume/", 200, json={"quantity": "200"})
    call("POST", f"/inventory/{b2['id']}/discard/", 200, json={"reason": "spoiled"})
    summary = call("GET", "/dashboard/summary/", 200)
    assert summary["total_active_batches"] == 1 and summary["expiring_soon"] == 1, summary
    call("GET", "/analytics/waste/", 200)

    print("Shopping")
    item = call("POST", "/shopping-list/", 201, json={"product_name": "Bread", "quantity": 1})
    call("POST", f"/shopping-list/{item['id']}/mark-purchased/", 200)
    call("POST", f"/shopping-list/{item['id']}/add-to-inventory/", 201, json={"expiry_unknown": True,
                                                                               "storage_location": "pantry"})

    print("Reminders")
    call("GET", "/notifications/preferences/", 200)
    call("GET", "/notifications/?upcoming=true", 200)

    print("Cleanup (account deletion)")
    call("DELETE", "/auth/me/", 204, json={"password": pw})
    call("GET", "/auth/me/", 401)
    print("All smoke checks passed.")


if __name__ == "__main__":
    main()
