from .base import *  # noqa: F401,F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # fast tests only
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CELERY_TASK_ALWAYS_EAGER = True
BARCODE_PROVIDER = "openfoodfacts"
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": {"auth": "1000/min", "password_reset": "1000/min", "otp": "1000/min", "scanning": "1000/min"},
}
SECRET_KEY = "test-only-secret-key-that-is-long-enough-for-hs256"
SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}  # noqa: F405
SMS_BACKEND = "console"
OTP_DEBUG_RETURN_CODE = False
