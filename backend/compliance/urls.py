from django.urls import path

from .views import DashboardStatsView, DecisionView, OverrideView, ReportPdfView, ReportView

urlpatterns = [
    path("bids/<int:pk>/report/", ReportView.as_view()),
    path("bids/<int:pk>/report/pdf/", ReportPdfView.as_view()),
    path("bids/<int:pk>/decision/", DecisionView.as_view()),
    path("results/<int:pk>/override/", OverrideView.as_view()),
    path("dashboard/stats/", DashboardStatsView.as_view()),
]
