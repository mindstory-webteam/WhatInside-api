from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.core.models import TimeStampedModel


class Category(models.TextChoices):
    DAIRY = "dairy", "Dairy"
    MEAT_SEAFOOD = "meat_seafood", "Meat & Seafood"
    PRODUCE = "produce", "Fruits & Vegetables"
    BAKERY = "bakery", "Bakery"
    BEVERAGES = "beverages", "Beverages"
    FROZEN = "frozen", "Frozen"
    GRAINS = "grains", "Grains & Pulses"
    SNACKS = "snacks", "Snacks"
    CONDIMENTS = "condiments", "Sauces & Spices"
    HOUSEHOLD = "household", "Household Supplies"
    PERSONAL_CARE = "personal_care", "Personal Care"
    MEDICINE = "medicine", "Medicine"
    OTHER = "other", "Other"


class Unit(models.TextChoices):
    PIECE = "pcs", "Pieces"
    GRAM = "g", "Grams"
    KILOGRAM = "kg", "Kilograms"
    MILLILITRE = "ml", "Millilitres"
    LITRE = "l", "Litres"
    PACK = "pack", "Packs"
    DOZEN = "dozen", "Dozen"
    BOTTLE = "bottle", "Bottles"
    CAN = "can", "Cans"
    OUNCE = "oz", "Ounces"
    POUND = "lb", "Pounds"


class Product(TimeStampedModel):
    """A product definition owned by one household. Batches reference it."""

    household = models.ForeignKey("households.Household", on_delete=models.CASCADE, related_name="products")
    name = models.CharField(max_length=200)
    brand = models.CharField(max_length=120, blank=True)
    barcode = models.CharField(max_length=32, blank=True)
    category = models.CharField(max_length=32, choices=Category.choices, default=Category.OTHER)
    default_unit = models.CharField(max_length=16, choices=Unit.choices, default=Unit.PIECE)
    image = models.ImageField(upload_to="products/%Y/%m/", blank=True, null=True)
    image_url = models.URLField(blank=True, help_text="External image from the barcode provider, if any.")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["name"]
        constraints = [
            # Same barcode can exist in many households, but only once per household.
            models.UniqueConstraint(fields=["household", "barcode"], condition=~Q(barcode=""),
                                    name="uniq_product_household_barcode"),
            # Avoid duplicate custom products ("Milk"/"milk") with the same brand in one household.
            models.UniqueConstraint(Lower("name"), Lower("brand"), "household",
                                    name="uniq_product_household_name_brand_ci"),
        ]
        indexes = [
            models.Index(fields=["household", "name"]),
            models.Index(fields=["household", "category"]),
            models.Index(fields=["barcode"]),
        ]

    def __str__(self):
        return f"{self.brand} {self.name}".strip()
