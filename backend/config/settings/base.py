"""Base settings shared by every environment. Values come from environment variables."""
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="insecure-dev-only-change-me")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    # local
    "apps.core",
    "apps.accounts",
    "apps.households",
    "apps.products",
    "apps.inventory",
    "apps.scanning",
    "apps.shopping",
    "apps.notifications",
    "apps.analytics",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {
    "default": env.db(
        "DATABASE_URL", default="postgres://whatinside:whatinside@localhost:5432/whatinside"
    )
}
DATABASES["default"]["ATOMIC_REQUESTS"] = False
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("ml", "Malayalam")]
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True  # all timestamps stored in UTC; expiry fields are timezone-free DateFields

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "auth": env("THROTTLE_AUTH", default="20/min"),
        "password_reset": env("THROTTLE_PASSWORD_RESET", default="5/hour"),
        "otp": env("THROTTLE_OTP", default="10/hour"),
        "scanning": env("THROTTLE_SCANNING", default="30/min"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_DAYS", default=30)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "WhatInside API",
    "DESCRIPTION": "Household inventory, expiry tracking, scanning and reminders. Know what's inside. Never waste again.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {"UnitEnum": "apps.products.models.Unit"},
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="WhatInside <no-reply@whatinside.app>")
PASSWORD_RESET_URL = env("PASSWORD_RESET_URL", default="whatinside://reset-password")

# --- Mobile-number accounts & SMS one-time codes ---------------------------------
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.PhoneOrEmailBackend"]
DEFAULT_PHONE_COUNTRY_CODE = env("DEFAULT_PHONE_COUNTRY_CODE", default="91")
SMS_BACKEND = env("SMS_BACKEND", default="console")  # console | msg91 | twilio
OTP_LENGTH = 6
OTP_TTL_SECONDS = env.int("OTP_TTL_SECONDS", default=600)
OTP_RESEND_SECONDS = env.int("OTP_RESEND_SECONDS", default=30)
OTP_MAX_PER_HOUR = env.int("OTP_MAX_PER_HOUR", default=5)
OTP_MAX_ATTEMPTS = env.int("OTP_MAX_ATTEMPTS", default=5)
# TESTING ONLY: include the code in the API response (the app shows it) so you can try
# sign-up before an SMS provider is configured. Never enable with real users.
OTP_DEBUG_RETURN_CODE = env.bool("OTP_DEBUG_RETURN_CODE", default=False)
MSG91_AUTH_KEY = env("MSG91_AUTH_KEY", default="")
MSG91_TEMPLATE_ID = env("MSG91_TEMPLATE_ID", default="")
MSG91_OTP_VAR = env("MSG91_OTP_VAR", default="otp")
TWILIO_ACCOUNT_SID = env("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN = env("TWILIO_AUTH_TOKEN", default="")
TWILIO_FROM_NUMBER = env("TWILIO_FROM_NUMBER", default="")

# Celery (only used for scheduled notification dispatch)
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_BEAT_SCHEDULE = {
    "dispatch-due-notifications": {
        "task": "apps.notifications.tasks.dispatch_due_notifications",
        "schedule": env.int("NOTIFICATION_DISPATCH_SECONDS", default=300),
    },
}

# Scanning
OCR_PROVIDER = env("OCR_PROVIDER", default="tesseract")  # "tesseract" | "disabled"
OCR_MAX_UPLOAD_BYTES = env.int("OCR_MAX_UPLOAD_BYTES", default=8 * 1024 * 1024)
BARCODE_PROVIDER = env("BARCODE_PROVIDER", default="openfoodfacts")  # "openfoodfacts" | "disabled"
BARCODE_PROVIDER_URL = env(
    "BARCODE_PROVIDER_URL", default="https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
)
BARCODE_PROVIDER_TIMEOUT = env.float("BARCODE_PROVIDER_TIMEOUT", default=5.0)
BARCODE_USER_AGENT = env("BARCODE_USER_AGENT", default="WhatInside/1.0 (contact@example.com)")

# Notifications
EXPO_PUSH_URL = env("EXPO_PUSH_URL", default="https://exp.host/--/api/v2/push/send")
EXPO_ACCESS_TOKEN = env("EXPO_ACCESS_TOKEN", default="")
NOTIFICATION_LOCAL_HOUR = env.int("NOTIFICATION_LOCAL_HOUR", default=9)
EXPIRING_SOON_DAYS = env.int("EXPIRING_SOON_DAYS", default=7)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}
