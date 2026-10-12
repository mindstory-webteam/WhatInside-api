from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Coalesce

from apps.core.models import TimeStampedModel
from apps.products.models import Unit


class StorageLocation(models.TextChoices):
    REFRIGERATOR = "refrigerator", "Refrigerator"
    FREEZER = "freezer", "Freezer"
    PANTRY = "pantry", "Pantry"
    OTHER = "other", "Other"


class BatchStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    FINISHED = "finished", "Finished"
    DISCARDED = "discarded", "Discarded"


class ExpiryStatus(models.TextChoices):
    FRESH = "fresh", "Fresh"
    EXPIRING_SOON = "expiring_soon", "Expiring soon"
    EXPIRED = "expired", "Expired"
    UNKNOWN = "unknown", "Date needs review"


class BatchQuerySet(models.QuerySet):
    def with_effective_expiry(self):
        """``effective_expiry`` = expiry/use-by date, falling back to best-before."""
        return self.annotate(effective_expiry=Coalesce("expiry_date", "best_before_date"))

    def active(self):
        return self.filter(status=BatchStatus.ACTIVE)

    def needs_review(self):
        return self.filter(
            Q(expiry_date__isnull=True, best_before_date__isnull=True) | Q(expiry_confirmed=False)
        )

    def with_known_expiry(self):
        return self.with_effective_expiry().filter(effective_expiry__isnull=False, expiry_confirmed=True)

    def expired(self, today: date):
        return self.with_known_expiry().filter(effective_expiry__lt=today)

    def expiring_soon(self, today: date, days: int):
        return self.with_known_expiry().filter(effective_expiry__gte=today,
                                               effective_expiry__lte=today + timedelta(days=days))

    def fresh(self, today: date, days: int):
        return self.with_known_expiry().filter(effective_expiry__gt=today + timedelta(days=days))


class InventoryBatch(TimeStampedModel):
    """One physical purchase of a product. Each batch keeps its own dates —
    adding a second batch never changes the first batch's expiry date."""

    product = models.ForeignKey("products.Product", on_delete=models.CASCADE, related_name="batches")
    household = models.ForeignKey("households.Household", on_delete=models.CASCADE, related_name="batches")
    storage_location = models.CharField(max_length=16, choices=StorageLocation.choices,
                                        default=StorageLocation.REFRIGERATOR)
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    initial_quantity = models.DecimalField(max_digits=10, decimal_places=3)
    unit = models.CharField(max_length=16, choices=Unit.choices, default=Unit.PIECE)
    purchase_date = models.DateField(null=True, blank=True)
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True, help_text="Expiry / use-by date (date-only, no timezone).")
    best_before_date = models.DateField(null=True, blank=True)
    expiry_confirmed = models.BooleanField(
        default=False, help_text="True only after a person has reviewed/entered the date."
    )
    batch_number = models.CharField(max_length=64, blank=True)
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                         help_text="Total price paid for this batch.")
    status = models.CharField(max_length=16, choices=BatchStatus.choices, default=BatchStatus.ACTIVE)
    notes = models.CharField(max_length=500, blank=True)
    version = models.PositiveIntegerField(default=1, help_text="Optimistic concurrency token.")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    objects = BatchQuerySet.as_manager()

    class Meta:
        ordering = ["expiry_date", "created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gte=0), name="batch_quantity_non_negative"),
            models.CheckConstraint(condition=Q(initial_quantity__gt=0), name="batch_initial_quantity_positive"),
            models.CheckConstraint(
                condition=Q(manufacturing_date__isnull=True) | Q(expiry_date__isnull=True)
                | Q(manufacturing_date__lte=F("expiry_date")),
                name="batch_mfg_before_expiry",
            ),
            models.CheckConstraint(condition=Q(purchase_price__isnull=True) | Q(purchase_price__gte=0),
                                   name="batch_price_non_negative"),
        ]
        indexes = [
            models.Index(fields=["household", "status", "expiry_date"]),
            models.Index(fields=["household", "status", "storage_location"]),
            models.Index(fields=["household", "status", "best_before_date"]),
            models.Index(fields=["product", "status"]),
            models.Index(fields=["household", "created_at"]),
        ]

    @property
    def effective_expiry(self):
        return self.expiry_date or self.best_before_date

    @effective_expiry.setter
    def effective_expiry(self, _value):
        """Accept the identical SQL annotation (Coalesce) without storing it twice."""

    @property
    def unit_price(self):
        if self.purchase_price is None or not self.initial_quantity:
            return None
        return (self.purchase_price / self.initial_quantity).quantize(Decimal("0.0001"))

    def expiry_status(self, today: date, soon_days: int | None = None) -> str:
        soon_days = settings.EXPIRING_SOON_DAYS if soon_days is None else soon_days
        exp = self.effective_expiry
        if exp is None or not self.expiry_confirmed:
            return ExpiryStatus.UNKNOWN
        if exp < today:
            return ExpiryStatus.EXPIRED
        if exp <= today + timedelta(days=soon_days):
            return ExpiryStatus.EXPIRING_SOON
        return ExpiryStatus.FRESH

    def days_until_expiry(self, today: date):
        exp = self.effective_expiry
        return (exp - today).days if exp and self.expiry_confirmed else None


class EventType(models.TextChoices):
    ADDED = "added", "Added"
    CONSUMED = "consumed", "Consumed"
    DISCARDED = "discarded", "Discarded"
    RESTOCKED = "restocked", "Restocked"
    ADJUSTED = "adjusted", "Adjusted"
    FINISHED = "finished", "Finished"
    DELETED = "deleted", "Deleted"


class DiscardReason(models.TextChoices):
    EXPIRED = "expired", "Expired"
    SPOILED = "spoiled", "Spoiled"
    DAMAGED = "damaged", "Damaged"
    NOT_NEEDED = "not_needed", "Not needed"
    OTHER = "other", "Other"


class InventoryEvent(models.Model):
    """Append-only history of every quantity change. Survives batch deletion."""

    household = models.ForeignKey("households.Household", on_delete=models.CASCADE, related_name="inventory_events")
    batch = models.ForeignKey(InventoryBatch, null=True, on_delete=models.SET_NULL, related_name="events")
    product = models.ForeignKey("products.Product", null=True, on_delete=models.SET_NULL, related_name="+")
    product_name = models.CharField(max_length=200)
    event_type = models.CharField(max_length=16, choices=EventType.choices)
    quantity_change = models.DecimalField(max_digits=10, decimal_places=3)
    unit = models.CharField(max_length=16, choices=Unit.choices)
    reason = models.CharField(max_length=32, blank=True)
    note = models.CharField(max_length=500, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                help_text="Estimated value of the quantity changed (from the batch's purchase price).")
    before_expiry = models.BooleanField(null=True, help_text="Whether the change happened on/before the expiry date.")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["household", "event_type", "created_at"]),
            models.Index(fields=["household", "created_at"]),
            models.Index(fields=["batch"]),
        ]
