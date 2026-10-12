"""Expiry reminder scheduling and dispatch.

Scheduling rules
* A reminder is planned for every active household member whose preferences
  are enabled, for each selected offset (7/3/1/0 days before expiry), at the
  preferred local hour in the *household's* timezone, stored in UTC.
* Only batches that are active and have a person-confirmed expiry date get reminders.
* Reminder dates already in the past are not created; a reminder due earlier
  today is scheduled for "now" so it is not silently lost.
* Editing/consuming/discarding/deleting a batch re-runs ``sync_batch_notifications``,
  which cancels pending reminders that no longer apply and creates the new ones.
* ``idempotency_key`` (unique) = batch + user + offset + expiry date, which makes
  duplicates impossible even under concurrent syncs.
"""
import logging
from datetime import datetime, time, timedelta
from datetime import timezone as dt_timezone

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.households.models import HouseholdMembership, MembershipStatus

from .models import DeliveryStatus, DeviceToken, NotificationPreference, NotificationRecord

logger = logging.getLogger(__name__)


def build_key(batch_id, user_id, days_before, expiry_date) -> str:
    return f"expiry:{batch_id}:{user_id}:{days_before}:{expiry_date.isoformat()}"


def reminder_text(product_name: str, days_before: int, expiry_date) -> tuple[str, str]:
    if days_before == 0:
        return f"{product_name} expires today", f"Your {product_name} expires today ({expiry_date:%d %b %Y})."
    if days_before == 1:
        return f"{product_name} expires tomorrow", f"Your {product_name} will expire tomorrow ({expiry_date:%d %b %Y})."
    return (f"{product_name} is about to expire",
            f"Your {product_name} will expire in {days_before} days ({expiry_date:%d %b %Y}).")


def _scheduled_utc(household, expiry_date, days_before, hour):
    local_day = expiry_date - timedelta(days=days_before)
    local_dt = datetime.combine(local_day, time(hour=hour), tzinfo=household.tzinfo)
    return local_dt.astimezone(dt_timezone.utc)


def _cancel_pending(qs, reason=""):
    return qs.filter(status=DeliveryStatus.PENDING).update(status=DeliveryStatus.CANCELLED, error=reason[:500])


def sync_batch_notifications(batch) -> list[NotificationRecord]:
    """Bring the pending reminders of one batch in line with its current state."""
    from apps.inventory.models import BatchStatus

    pending = NotificationRecord.objects.filter(batch=batch, status=DeliveryStatus.PENDING)
    expiry = batch.effective_expiry
    if batch.status != BatchStatus.ACTIVE or expiry is None or not batch.expiry_confirmed or batch.quantity <= 0:
        _cancel_pending(pending, "batch no longer eligible")
        return []

    household = batch.household
    today = household.local_today()
    now = timezone.now()
    product_name = batch.product.name
    desired_keys, created = set(), []

    members = HouseholdMembership.objects.filter(household=household, status=MembershipStatus.ACTIVE).select_related(
        "user"
    )
    for membership in members:
        pref = NotificationPreference.for_user(membership.user)
        if not pref.enabled:
            continue
        for days_before in sorted(set(pref.days_before_expiry), reverse=True):
            remind_day = expiry - timedelta(days=days_before)
            if remind_day < today:
                continue  # never back-fill reminders for dates that have passed
            scheduled = _scheduled_utc(household, expiry, days_before, pref.reminder_hour)
            if scheduled < now:
                scheduled = now
            key = build_key(batch.pk, membership.user_id, days_before, expiry)
            desired_keys.add(key)
            title, body = reminder_text(product_name, days_before, expiry)
            record = NotificationRecord.objects.filter(idempotency_key=key).first()
            if record:
                if record.status == DeliveryStatus.CANCELLED:  # date changed back, reactivate
                    record.status = DeliveryStatus.PENDING
                    record.scheduled_for = scheduled
                    record.title, record.body, record.error = title, body, ""
                    record.save(update_fields=["status", "scheduled_for", "title", "body", "error"])
                elif record.status == DeliveryStatus.PENDING and record.scheduled_for != scheduled:
                    record.scheduled_for = scheduled
                    record.save(update_fields=["scheduled_for"])
                continue
            try:
                with transaction.atomic():
                    created.append(NotificationRecord.objects.create(
                        user=membership.user, household=household, batch=batch, days_before=days_before,
                        expiry_date=expiry, scheduled_for=scheduled, title=title, body=body, idempotency_key=key,
                    ))
            except IntegrityError:
                # A concurrent sync created it first — that's the duplicate we want to prevent.
                logger.info("Duplicate reminder suppressed", extra={"key": key})
    _cancel_pending(pending.exclude(idempotency_key__in=desired_keys), "superseded")
    return created


def sync_user_notifications(user) -> None:
    """Re-plan reminders after a user's preferences change."""
    from apps.inventory.models import InventoryBatch

    household_ids = HouseholdMembership.objects.filter(user=user, status=MembershipStatus.ACTIVE).values_list(
        "household_id", flat=True
    )
    for batch in InventoryBatch.objects.active().filter(household_id__in=household_ids).select_related(
        "product", "household"
    ):
        sync_batch_notifications(batch)


def cancel_batch_notifications(batch, reason="batch removed") -> int:
    return _cancel_pending(NotificationRecord.objects.filter(batch=batch), reason)


# --------------------------------------------------------------------- dispatch

def send_expo_push(messages: list[dict]) -> list[dict]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if settings.EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"
    resp = requests.post(settings.EXPO_PUSH_URL, json=messages, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json().get("data", [])


def dispatch_due_notifications(limit: int = 500) -> dict:
    """Send due reminders. Safe to run concurrently (row locks + skip_locked)."""
    from apps.inventory.models import BatchStatus

    stats = {"sent": 0, "local_only": 0, "failed": 0, "cancelled": 0}
    with transaction.atomic():
        due = list(
            NotificationRecord.objects.select_for_update(skip_locked=True, of=("self",))
            .filter(status=DeliveryStatus.PENDING, scheduled_for__lte=timezone.now())
            .select_related("batch", "user")[:limit]
        )
        for record in due:
            batch = record.batch
            pref = NotificationPreference.for_user(record.user)
            if (batch is None or batch.status != BatchStatus.ACTIVE or batch.effective_expiry != record.expiry_date
                    or not pref.enabled or record.days_before not in pref.days_before_expiry):
                record.status = DeliveryStatus.CANCELLED
                record.error = "no longer applicable at send time"
                record.save(update_fields=["status", "error"])
                stats["cancelled"] += 1
                continue
            devices = list(DeviceToken.objects.filter(user=record.user, is_active=True))
            if "push" not in pref.delivery_methods or not devices:
                # Delivered by the device's own scheduled local notification (if permitted by the OS).
                record.status = DeliveryStatus.LOCAL_ONLY
                record.sent_at = timezone.now()
                record.save(update_fields=["status", "sent_at"])
                stats["local_only"] += 1
                continue
            messages = [{
                "to": d.token, "title": record.title, "body": record.body, "sound": "default",
                "data": {"batchId": batch.pk, "notificationId": record.pk, "type": record.notification_type},
            } for d in devices]
            try:
                tickets = send_expo_push(messages)
            except requests.RequestException as exc:
                record.status = DeliveryStatus.FAILED
                record.error = f"push provider error: {exc.__class__.__name__}"
                record.save(update_fields=["status", "error"])
                stats["failed"] += 1
                continue
            ok_ids = []
            for device, ticket in zip(devices, tickets):
                if ticket.get("status") == "ok":
                    ok_ids.append(ticket.get("id", ""))
                elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                    device.is_active = False
                    device.save(update_fields=["is_active"])
            record.status = DeliveryStatus.SENT if ok_ids else DeliveryStatus.FAILED
            record.provider_id = ",".join(ok_ids)[:255]
            record.error = "" if ok_ids else "all push tickets failed"
            record.sent_at = timezone.now() if ok_ids else None
            record.save(update_fields=["status", "provider_id", "error", "sent_at"])
            stats["sent" if ok_ids else "failed"] += 1
    return stats
