from django.urls import path

from . import views

urlpatterns = [
    path("ocr/", views.OcrView.as_view(), name="scan-ocr"),
    path("barcode/", views.BarcodeView.as_view(), name="scan-barcode"),
    path("confirm/", views.ConfirmScanView.as_view(), name="scan-confirm"),
]
