from django.urls import path

from .views import BidDetailView, BidListView, TenderBidCreateView

urlpatterns = [
    path("tenders/<int:tender_id>/bids/", TenderBidCreateView.as_view()),
    path("bids/", BidListView.as_view()),
    path("bids/<int:pk>/", BidDetailView.as_view()),
]
