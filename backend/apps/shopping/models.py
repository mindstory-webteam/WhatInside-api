from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel
from apps.products.models import Unit


class ShoppingListItem(TimeStampedModel):
    household = models.ForeignKey("households.Household", on_delete=models.CASCADE, related_name="shopping_items")
    product_name = models.CharField(max_length=200)
    product = models.ForeignKey("products.Product", null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="shopping_items")
    quantity = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    unit = models.CharField(max_length=16, choices=Unit.choices, default=Unit.PIECE)
    note = models.CharField(max_length=300, blank=True)
    is_purchased = models.BooleanField(default=False)
    purchased_at = models.DateTimeField(null=True, blank=True)
    added_to_inventory = models.ForeignKey("inventory.InventoryBatch", null=True, blank=True,
                                           on_delete=models.SET_NULL, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["is_purchased", "-created_at"]
        constraints = [models.CheckConstraint(condition=Q(quantity__gt=0), name="shopping_quantity_positive")]
        indexes = [models.Index(fields=["household", "is_purchased", "created_at"])]
