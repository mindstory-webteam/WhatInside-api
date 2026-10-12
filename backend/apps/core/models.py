from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class IdempotencyRecord(models.Model):
    """Stores the response of a state-changing request keyed by the client's Idempotency-Key.

    A repeated request with the same key replays the stored response instead of
    applying the change twice (e.g. a double-tapped "Consume" button or an
    offline-queue retry).
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=128)
    scope = models.CharField(max_length=128)
    response_status = models.PositiveSmallIntegerField(null=True)
    response_body = models.JSONField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "key", "scope"], name="uniq_idempotency_user_key_scope")
        ]
        indexes = [models.Index(fields=["created_at"])]
