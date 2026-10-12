from datetime import datetime, timedelta
from datetime import timezone as dt_tz
from zoneinfo import ZoneInfo

import pytest
import responses
from django.conf import settings
from django.utils import timezone

from apps.households.models import HouseholdMembership
from apps.inventory import services as inv
from apps.inventory.models import InventoryBatch
from apps.notifications.models import DeliveryStatus, DeviceToken, NotificationPreference, NotificationRecord
from apps.notifications.services import dispatch_due_notifications, sync_batch_notifications

pytestmark = pytest.mark.django_db


def pending(batch_id):
    return NotificationRecord.objects.filter(batch_id=batch_id, status=DeliveryStatus.PENDING)


def test_reminders_scheduled_for_each_offset_in_household_timezone(add_batch, household):
    b = add_batch(days=10)
    recs = pending(b["id"]).order_by("days_before")
    assert [r.days_before for r in recs] == [0, 1, 3, 7]
    seven = recs.get(days_before=7)
    local = seven.scheduled_for.astimezone(ZoneInfo(household.timezone))
    assert local.hour == 9
    assert local.date() == seven.expiry_date - timedelta(days=7)


def test_past_reminders_not_backfilled(add_batch):
    b = add_batch(days=2)
    assert sorted(pending(b["id"]).values_list("days_before", flat=True)) == [0, 1]


def test_no_reminders_for_unconfirmed_or_missing_dates(add_batch):
    assert pending(add_batch(days=5, confirmed=False)["id"]).count() == 0
    assert pending(add_batch(days=None, confirmed=False)["id"]).count() == 0


def test_resync_is_idempotent_and_prevents_duplicates(add_batch):
    b = InventoryBatch.objects.get(pk=add_batch(days=10)["id"])
    before = NotificationRecord.objects.count()
    sync_batch_notifications(b)
    sync_batch_notifications(b)
    assert NotificationRecord.objects.count() == before
    keys = list(NotificationRecord.objects.values_list("idempotency_key", flat=True))
    assert len(keys) == len(set(keys))


def test_date_change_reschedules_and_consume_cancels(api, add_batch, today):
    b = add_batch(days=10)
    old_keys = set(pending(b["id"]).values_list("idempotency_key", flat=True))
    api.patch(f"/api/v1/inventory/{b['id']}/", {"expiry_date": (today + timedelta(days=12)).isoformat(),
                                                "expiry_confirmed": True}, format="json")
    new_keys = set(pending(b["id"]).values_list("idempotency_key", flat=True))
    assert old_keys.isdisjoint(new_keys) and len(new_keys) == 4
    assert NotificationRecord.objects.filter(idempotency_key__in=old_keys,
                                             status=DeliveryStatus.CANCELLED).count() == 4
    api.post(f"/api/v1/inventory/{b['id']}/finish/", {}, format="json")
    assert pending(b["id"]).count() == 0


def test_delete_cancels_reminders(api, add_batch):
    b = add_batch(days=10)
    api.delete(f"/api/v1/inventory/{b['id']}/")
    assert NotificationRecord.objects.filter(status=DeliveryStatus.PENDING).count() == 0


def test_preferences_update_replans(api, add_batch, user):
    b = add_batch(days=10)
    r = api.patch("/api/v1/notifications/preferences/", {"days_before_expiry": [1, 0]}, format="json")
    assert r.status_code == 200 and r.data["days_before_expiry"] == [1, 0]
    assert sorted(pending(b["id"]).values_list("days_before", flat=True)) == [0, 1]
    api.patch("/api/v1/notifications/preferences/", {"enabled": False}, format="json")
    assert pending(b["id"]).count() == 0
    bad = api.patch("/api/v1/notifications/preferences/", {"days_before_expiry": [5]}, format="json")
    assert bad.status_code == 400


def test_every_household_member_gets_own_reminders(add_batch, household, make_user):
    partner = make_user()
    HouseholdMembership.objects.create(household=household, user=partner, role="member")
    b = add_batch(days=10)
    assert pending(b["id"]).values("user").distinct().count() == 2


def test_device_registration(api):
    bad = api.post("/api/v1/notifications/register-device/", {"token": "nope", "platform": "ios"}, format="json")
    assert bad.status_code == 400
    tok = "ExponentPushToken[abc123]"
    r = api.post("/api/v1/notifications/register-device/", {"token": tok, "platform": "android"}, format="json")
    assert r.status_code == 201
    again = api.post("/api/v1/notifications/register-device/", {"token": tok, "platform": "android"}, format="json")
    assert again.status_code == 200 and DeviceToken.objects.count() == 1
    assert api.delete(f"/api/v1/notifications/devices/{r.data['id']}/").status_code == 204


def _make_due(batch_id):
    NotificationRecord.objects.filter(batch_id=batch_id).update(scheduled_for=timezone.now() - timedelta(minutes=1))


@responses.activate
def test_dispatch_sends_push_once(add_batch, user):
    pref = NotificationPreference.for_user(user)
    pref.delivery_methods = ["local", "push"]
    pref.save()
    DeviceToken.objects.create(user=user, token="ExponentPushToken[x]", platform="ios")
    responses.add(responses.POST, settings.EXPO_PUSH_URL, json={"data": [{"status": "ok", "id": "tkt-1"}]})
    b = add_batch(days=10)
    rec = pending(b["id"]).first()
    pending(b["id"]).exclude(pk=rec.pk).delete()
    _make_due(b["id"])
    stats = dispatch_due_notifications()
    assert stats["sent"] == 1
    rec.refresh_from_db()
    assert rec.status == DeliveryStatus.SENT and rec.provider_id == "tkt-1"
    # Second run must not re-send
    assert dispatch_due_notifications()["sent"] == 0
    assert len(responses.calls) == 1


@responses.activate
def test_dispatch_deactivates_unregistered_device(add_batch, user):
    pref = NotificationPreference.for_user(user)
    pref.delivery_methods = ["push"]
    pref.save()
    d = DeviceToken.objects.create(user=user, token="ExponentPushToken[y]", platform="android")
    responses.add(responses.POST, settings.EXPO_PUSH_URL,
                  json={"data": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]})
    b = add_batch(days=10)
    _make_due(b["id"])
    dispatch_due_notifications()
    d.refresh_from_db()
    assert d.is_active is False
    assert NotificationRecord.objects.filter(batch_id=b["id"], status=DeliveryStatus.FAILED).exists()


def test_dispatch_without_push_marks_local_only_and_skips_stale(add_batch, api):
    b = add_batch(days=10)
    _make_due(b["id"])
    # batch consumed after the reminder became due — it must not be sent
    InventoryBatch.objects.filter(pk=b["id"]).update(status="finished")
    stats = dispatch_due_notifications()
    assert stats["cancelled"] == 4 and stats["local_only"] == 0


def test_history_endpoint_lists_only_mine(api, add_batch, make_user, client_for, household):
    b = add_batch(days=10)
    _make_due(b["id"])
    dispatch_due_notifications()
    assert api.get("/api/v1/notifications/").data["count"] == 4
    assert client_for(make_user()).get("/api/v1/notifications/").data["count"] == 0


def test_timezone_does_not_shift_date_only_expiry(api, household, milk):
    household.timezone = "Pacific/Kiritimati"  # UTC+14
    household.save()
    r = api.post("/api/v1/inventory/", {"product": milk.id, "quantity": 1, "expiry_date": "2031-01-01",
                                        "expiry_confirmed": True}, format="json")
    assert r.data["expiry_date"] == "2031-01-01"
    rec = NotificationRecord.objects.get(batch_id=r.data["id"], days_before=0)
    assert rec.scheduled_for == datetime(2030, 12, 31, 19, 0, tzinfo=dt_tz.utc)  # 09:00 local on 2031-01-01


def test_management_command_runs():
    from django.core.management import call_command

    call_command("send_due_notifications")


def test_inventory_service_cancel_on_discard(add_batch, user):
    b = add_batch(days=10)
    inv.discard(batch_id=b["id"], actor=user, reason="spoiled")
    assert pending(b["id"]).count() == 0
