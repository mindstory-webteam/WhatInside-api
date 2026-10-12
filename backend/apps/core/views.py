from django.db import connection
from django.http import JsonResponse


def health(request):
    """Liveness + database readiness probe used by Docker and the reverse proxy."""
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        return JsonResponse({"status": "ok"})
    except Exception:  # pragma: no cover - only when DB is down
        return JsonResponse({"status": "degraded"}, status=503)
