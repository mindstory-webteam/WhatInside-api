"""Consistent JSON error envelope: {"error": {"code", "message", "details"}}.

Unhandled exceptions are logged server-side and returned as a generic 500 so
tracebacks never leak to clients.
"""
import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ConflictError(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The resource was modified by another request."
    default_code = "conflict"


class DomainError(exceptions.APIException):
    """Business-rule violation raised from service functions."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The request could not be completed."
    default_code = "invalid"


def _first_message(detail):
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    if isinstance(detail, dict) and detail:
        key, value = next(iter(detail.items()))
        msg = _first_message(value)
        return msg if key in ("non_field_errors", "detail") else f"{key}: {msg}"
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.message_dict if hasattr(exc, "error_dict") else {"non_field_errors": exc.messages}
        )
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {"error": {"code": "server_error", "message": "An unexpected error occurred.", "details": None}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    detail = response.data
    if isinstance(exc, exceptions.ValidationError):
        code = "validation_error"
        message = _first_message(detail)
        details = detail
    else:
        codes = exc.get_codes() if isinstance(exc, exceptions.APIException) else None
        code = codes if isinstance(codes, str) else getattr(exc, "default_code", "error")
        message = detail.get("detail", _first_message(detail)) if isinstance(detail, dict) else str(detail)
        details = None
    response.data = {"error": {"code": code, "message": str(message), "details": details}}
    return response
