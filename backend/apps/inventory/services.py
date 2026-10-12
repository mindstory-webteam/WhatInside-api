"""All quantity-changing inventory operations.

Every function runs in a transaction, locks the batch row, validates the
change, updates the batch and appends an ``InventoryEvent`` atomically, then
re-syncs reminders for that batch.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction

from apps.core.exceptions import ConflictError, DomainError
from apps.notifications.services import cancel_batch_notifications, sync_batch_notifications

from .models import BatchStatus, DiscardReason, EventType, InventoryBatch, InventoryEvent

QTY = Decimal("0.001")


def _q(value) -> Decimal:
    return Decimal(str(value)).quantize(QTY, rounding=ROUND_HALF_UP)


def _value_of(batch: InventoryBatch, quantity: Decimal):
    unit_price = batch.unit_price
    if unit_price is None:
        return None
    return (unit_price * quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _before_expiry(batch: InventoryBatch):
    exp = batch.effective_expiry
    if exp is None or not batch.expiry_confirmed:
        return None
    return batch.household.local_today() <= exp


def _event(batch, actor, event_type, change, *, reason="", note="", price=None):
    return InventoryEvent.objects.create(
        household_id=batch.household_id, batch=batch, product_id=batch.product_id,
        product_name=batch.product.name, event_type=event_type, quantity_change=change, unit=batch.unit,
        reason=reason, note=note, price=price, before_expiry=_before_expiry(batch), actor=actor,
    )


def _lock(batch_id: int) -> InventoryBatch:
    return InventoryBatch.objects.select_for_update().select_related("product", "household").get(pk=batch_id)


def _check_version(batch, expected_version):
    if expected_version is not None and int(expected_version) != batch.version:
        raise ConflictError(
            "This item was changed on another device. Refresh to see the latest version before editing."
        )


def _save(batch, fields):
    batch.version += 1
    batch.save(update_fields=[*fields, "version", "updated_at"])


@transaction.atomic
def create_batch(*, household, actor, product, **data) -> InventoryBatch:
    if product.household_id != household.id:
        raise DomainError("Product does not belong to this household.")
    quantity = _q(data.pop("quantity"))
    if quantity <= 0:
        raise DomainError("Quantity must be greater than zero.")
    data.setdefault("unit", product.default_unit)
    batch = InventoryBatch.objects.create(
        household=household, product=product, quantity=quantity, initial_quantity=quantity, created_by=actor, **data
    )
    batch = InventoryBatch.objects.select_related("product", "household").get(pk=batch.pk)
    _event(batch, actor, EventType.ADDED, quantity)
    sync_batch_notifications(batch)
    return batch


EDITABLE_FIELDS = {
    "storage_location", "unit", "purchase_date", "manufacturing_date", "expiry_date", "best_before_date",
    "expiry_confirmed", "batch_number", "purchase_price", "notes", "quantity", "product",
}


@transaction.atomic
def update_batch(*, batch_id, actor, expected_version=None, **changes) -> InventoryBatch:
    batch = _lock(batch_id)
    _check_version(batch, expected_version)
    if batch.status != BatchStatus.ACTIVE and "quantity" in changes:
        raise DomainError("Restock a finished or discarded batch instead of editing its quantity.")
    fields = []
    for field, value in changes.items():
        if field not in EDITABLE_FIELDS:
            continue
        if field == "product" and value.household_id != batch.household_id:
            raise DomainError("Product does not belong to this household.")
        if field == "quantity":
            value = _q(value)
            if value < 0:
                raise DomainError("Quantity cannot be negative.")
            delta = value - batch.quantity
            if delta != 0:
                batch.quantity = value
                if value > batch.initial_quantity:
                    batch.initial_quantity = value
                    fields.append("initial_quantity")
                _event(batch, actor, EventType.ADJUSTED, delta, note="manual quantity correction")
                if value == 0:
                    batch.status = BatchStatus.FINISHED
                    fields.append("status")
                fields.append("quantity")
            continue
        setattr(batch, field, value)
        fields.append(field)
    # Changing a date without explicitly confirming it leaves it unconfirmed.
    if {"expiry_date", "best_before_date"} & set(changes) and "expiry_confirmed" not in changes:
        batch.expiry_confirmed = False
        fields.append("expiry_confirmed")
    if batch.manufacturing_date and batch.expiry_date and batch.manufacturing_date > batch.expiry_date:
        raise DomainError("Manufacturing date cannot be after the expiry date.")
    if fields:
        _save(batch, list(dict.fromkeys(fields)))
    sync_batch_notifications(batch)
    return batch


@transaction.atomic
def consume(*, batch_id, actor, quantity, expected_version=None, note="") -> InventoryBatch:
    batch = _lock(batch_id)
    _check_version(batch, expected_version)
    quantity = _q(quantity)
    if batch.status != BatchStatus.ACTIVE:
        raise DomainError("Only active batches can be consumed.")
    if quantity <= 0:
        raise DomainError("Quantity must be greater than zero.")
    if quantity > batch.quantity:
        raise DomainError(f"Only {batch.quantity.normalize():f} {batch.unit} left in this batch.")
    batch.quantity -= quantity
    fields = ["quantity"]
    _event(batch, actor, EventType.CONSUMED, -quantity, note=note, price=_value_of(batch, quantity))
    if batch.quantity == 0:
        batch.status = BatchStatus.FINISHED
        fields.append("status")
    _save(batch, fields)
    sync_batch_notifications(batch)
    return batch


@transaction.atomic
def finish(*, batch_id, actor, expected_version=None) -> InventoryBatch:
    batch = _lock(batch_id)
    _check_version(batch, expected_version)
    if batch.status != BatchStatus.ACTIVE:
        raise DomainError("This batch is already closed.")
    remaining = batch.quantity
    if remaining > 0:
        _event(batch, actor, EventType.FINISHED, -remaining, price=_value_of(batch, remaining))
    batch.quantity = Decimal("0")
    batch.status = BatchStatus.FINISHED
    _save(batch, ["quantity", "status"])
    sync_batch_notifications(batch)
    return batch


@transaction.atomic
def discard(*, batch_id, actor, quantity=None, reason=DiscardReason.OTHER, note="",
            expected_version=None) -> InventoryBatch:
    batch = _lock(batch_id)
    _check_version(batch, expected_version)
    if batch.status != BatchStatus.ACTIVE:
        raise DomainError("Only active batches can be discarded.")
    quantity = batch.quantity if quantity is None else _q(quantity)
    if quantity <= 0:
        raise DomainError("Quantity must be greater than zero.")
    if quantity > batch.quantity:
        raise DomainError(f"Only {batch.quantity.normalize():f} {batch.unit} left in this batch.")
    batch.quantity -= quantity
    fields = ["quantity"]
    _event(batch, actor, EventType.DISCARDED, -quantity, reason=reason, note=note, price=_value_of(batch, quantity))
    if batch.quantity == 0:
        batch.status = BatchStatus.DISCARDED
        fields.append("status")
    _save(batch, fields)
    sync_batch_notifications(batch)
    return batch


@transaction.atomic
def restock(*, batch_id, actor, quantity, expected_version=None) -> InventoryBatch:
    """Add quantity to the *same* batch (same dates). New purchases with their
    own dates should be created as a new batch instead."""
    batch = _lock(batch_id)
    _check_version(batch, expected_version)
    quantity = _q(quantity)
    if quantity <= 0:
        raise DomainError("Quantity must be greater than zero.")
    batch.quantity += quantity
    batch.initial_quantity += quantity
    batch.status = BatchStatus.ACTIVE
    _event(batch, actor, EventType.RESTOCKED, quantity)
    _save(batch, ["quantity", "initial_quantity", "status"])
    sync_batch_notifications(batch)
    return batch


@transaction.atomic
def delete_batch(*, batch_id, actor) -> None:
    batch = _lock(batch_id)
    if batch.quantity > 0:
        _event(batch, actor, EventType.DELETED, -batch.quantity, note="batch deleted")
    cancel_batch_notifications(batch)
    batch.delete()
