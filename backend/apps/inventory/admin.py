from django.contrib import admin

from .models import InventoryBatch, InventoryEvent


@admin.register(InventoryBatch)
class InventoryBatchAdmin(admin.ModelAdmin):
    list_display = ["id", "product", "household", "storage_location", "quantity", "unit", "expiry_date",
                    "expiry_confirmed", "status"]
    list_filter = ["status", "storage_location", "expiry_confirmed"]
    search_fields = ["product__name", "batch_number"]
    raw_id_fields = ["product", "household", "created_by"]


@admin.register(InventoryEvent)
class InventoryEventAdmin(admin.ModelAdmin):
    list_display = ["id", "product_name", "event_type", "quantity_change", "unit", "reason", "household", "created_at"]
    list_filter = ["event_type"]
    readonly_fields = [f.name for f in InventoryEvent._meta.fields]
