import pytest

from apps.households.models import HouseholdMembership
from apps.households.services import create_household
from apps.products.models import Product

pytestmark = pytest.mark.django_db


def test_create_household_makes_owner(client_for, make_user):
    u = make_user()
    r = client_for(u).post("/api/v1/households/", {"name": "Flat 4B", "timezone": "Asia/Kolkata"}, format="json")
    assert r.status_code == 201
    assert r.data["my_role"] == "owner"
    assert HouseholdMembership.objects.get(user=u).role == "owner"


def test_invalid_timezone_rejected(client_for, make_user):
    r = client_for(make_user()).post("/api/v1/households/", {"name": "X", "timezone": "Nowhere/City"}, format="json")
    assert r.status_code == 400


def test_household_isolation(api, household, milk, make_user, client_for, add_batch):
    batch = add_batch()
    stranger = make_user()
    other = create_household(user=stranger, name="Other", tz="UTC")
    sc = client_for(stranger, other)
    # Cannot read by guessing ids
    assert sc.get(f"/api/v1/households/{household.id}/").status_code == 404
    assert sc.get(f"/api/v1/products/{milk.id}/").status_code == 404
    assert sc.get(f"/api/v1/inventory/{batch['id']}/").status_code == 404
    assert sc.post(f"/api/v1/inventory/{batch['id']}/consume/", {"quantity": 1}, format="json").status_code == 404
    assert sc.delete(f"/api/v1/inventory/{batch['id']}/").status_code == 404
    # Cannot select a household they don't belong to via header
    hijack = client_for(stranger, household)
    assert hijack.get("/api/v1/inventory/").status_code == 404
    # Lists are scoped
    assert sc.get("/api/v1/inventory/").data["count"] == 0
    # Cannot attach another household's product to a batch
    r = sc.post("/api/v1/inventory/", {"product": milk.id, "quantity": 1}, format="json")
    assert r.status_code == 400


def test_invitation_join_and_roles(api, household, make_user, client_for):
    r = api.post(f"/api/v1/households/{household.id}/invitations/", {"role": "member"}, format="json")
    assert r.status_code == 201
    code = r.data["code"]
    member = make_user()
    mc = client_for(member)
    j = mc.post("/api/v1/households/join/", {"code": code}, format="json")
    assert j.status_code == 201 and j.data["my_role"] == "member"
    # invitation cannot be reused
    assert client_for(make_user()).post("/api/v1/households/join/", {"code": code}, format="json").status_code == 400

    # members can read inventory but not manage household
    mc = client_for(member, household)
    assert mc.get("/api/v1/inventory/").status_code == 200
    assert mc.patch(f"/api/v1/households/{household.id}/", {"name": "Mine"}, format="json").status_code == 403
    assert mc.post(f"/api/v1/households/{household.id}/invitations/", {}, format="json").status_code == 403
    assert mc.delete(f"/api/v1/households/{household.id}/").status_code == 403

    members = api.get(f"/api/v1/households/{household.id}/members/").data
    m_id = next(m["id"] for m in members if m["user"] == member.id)
    owner_id = next(m["id"] for m in members if m["role"] == "owner")
    # owner promotes member to admin
    assert api.patch(f"/api/v1/households/{household.id}/members/{m_id}/", {"role": "admin"},
                     format="json").data["role"] == "admin"
    # admin can edit household but cannot remove/demote the owner
    assert mc.patch(f"/api/v1/households/{household.id}/", {"name": "Home"}, format="json").status_code == 200
    assert mc.delete(f"/api/v1/households/{household.id}/members/{owner_id}/").status_code == 400
    assert mc.patch(f"/api/v1/households/{household.id}/members/{owner_id}/", {"role": "member"},
                    format="json").status_code == 400


def test_removed_member_loses_access(api, household, make_user, client_for):
    member = make_user()
    m = HouseholdMembership.objects.create(household=household, user=member, role="member")
    assert api.delete(f"/api/v1/households/{household.id}/members/{m.id}/").status_code == 204
    assert client_for(member, household).get("/api/v1/inventory/").status_code == 404


def test_same_product_can_exist_in_two_households(user, household, make_user):
    other = create_household(user=make_user(), name="Other", tz="UTC")
    Product.objects.create(household=household, name="Milk", barcode="8901058000290")
    Product.objects.create(household=other, name="Milk", barcode="8901058000290")
    assert Product.objects.filter(barcode="8901058000290").count() == 2
