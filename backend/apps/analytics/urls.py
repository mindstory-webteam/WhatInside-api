from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/summary/", views.DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/expiring-soon/", views.ExpiringSoonView.as_view(), name="dashboard-expiring-soon"),
    path("dashboard/expired/", views.ExpiredView.as_view(), name="dashboard-expired"),
    path("dashboard/review-required/", views.ReviewRequiredView.as_view(), name="dashboard-review-required"),
    path("analytics/overview/", views.AnalyticsOverviewView.as_view(), name="analytics-overview"),
    path("analytics/waste/", views.AnalyticsWasteView.as_view(), name="analytics-waste"),
]
