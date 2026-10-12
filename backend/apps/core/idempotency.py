"""Idempotency-Key support for state-changing endpoints."""
import functools
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from rest_framework.response import Response

from .exceptions import ConflictError
from .models import IdempotencyRecord

HEADER = "HTTP_IDEMPOTENCY_KEY"


def idempotent(scope: str):
    """Decorate a DRF view method. Without the header the view runs normally.

    With the header, the first request runs inside a transaction together with
    the record insert; concurrent duplicates block on the unique index and then
    replay the stored response.
    """

    def decorator(view_func):
        @functools.wraps(view_func)
        def wrapper(self, request, *args, **kwargs):
            key = request.META.get(HEADER)
            if not key:
                return view_func(self, request, *args, **kwargs)
            key = key[:128]
            full_scope = f"{scope}:{kwargs.get('pk', '')}"
            existing = IdempotencyRecord.objects.filter(user=request.user, key=key, scope=full_scope).first()
            if existing:
                return _replay(existing)
            try:
                with transaction.atomic():
                    record = IdempotencyRecord.objects.create(user=request.user, key=key, scope=full_scope)
                    response = view_func(self, request, *args, **kwargs)
                    if response.status_code >= 400:
                        # do not cache failures; let the client retry with the same key
                        transaction.set_rollback(True)
                        return response
                    record.response_status = response.status_code
                    record.response_body = json.loads(json.dumps(response.data, cls=DjangoJSONEncoder))
                    record.save(update_fields=["response_status", "response_body"])
                    return response
            except IntegrityError:
                existing = IdempotencyRecord.objects.filter(user=request.user, key=key, scope=full_scope).first()
                if existing:
                    return _replay(existing)
                raise

        return wrapper

    return decorator


def _replay(record):
    if record.response_status is None:
        raise ConflictError("A request with this Idempotency-Key is still being processed.")
    response = Response(record.response_body, status=record.response_status)
    response["Idempotent-Replayed"] = "true"
    return response
