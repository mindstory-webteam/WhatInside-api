from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, env

DEBUG = False
if SECRET_KEY.startswith("insecure") or len(SECRET_KEY) < 40:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a long random value in production.")

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")  # required, no default

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True) and env.bool("HTTPS_ENABLED", default=True)
# The container healthcheck calls /health/ over plain HTTP inside the container.
SECURE_REDIRECT_EXEMPT = [r"^health/$"]
# HTTPS_ENABLED=false is only for a temporary IP-address test deployment without TLS.
HTTPS_ENABLED = env.bool("HTTPS_ENABLED", default=True)
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000) if HTTPS_ENABLED else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = HTTPS_ENABLED
CSRF_COOKIE_SECURE = HTTPS_ENABLED
SESSION_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = "DENY"

REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}
