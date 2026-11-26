from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ChecklistDetail, ChecklistListCreate, TenderViewSet

router = DefaultRouter()
router.register("tenders", TenderViewSet, basename="tender")

urlpatterns = router.urls + [
    path("tenders/<int:tender_id>/checklist/", ChecklistListCreate.as_view()),
    path("checklist/<int:pk>/", ChecklistDetail.as_view()),
]
