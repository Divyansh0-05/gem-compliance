from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, viewsets
from rest_framework.exceptions import PermissionDenied

from accounts.permissions import BIDDER, BUYER, EVALUATOR, IsBuyer, get_role

from .models import ChecklistItem, Tender
from .serializers import ChecklistItemSerializer, TenderSerializer


def visible_tenders(user):
    role = get_role(user)
    qs = Tender.objects.all()
    if role == BUYER:
        return qs.filter(created_by=user)
    if role == BIDDER:
        return qs.filter(status=Tender.Status.OPEN)
    if role == EVALUATOR:
        return qs.exclude(status=Tender.Status.DRAFT)
    return qs.none()


class TenderViewSet(viewsets.ModelViewSet):
    serializer_class = TenderSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsBuyer()]
        return super().get_permissions()

    def get_queryset(self):
        qs = visible_tenders(self.request.user)
        q, st = self.request.query_params.get("q"), self.request.query_params.get("status")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(tender_no__icontains=q) | Q(category__icontains=q))
        if st:
            qs = qs.filter(status=st)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ChecklistListCreate(generics.ListCreateAPIView):
    serializer_class = ChecklistItemSerializer
    pagination_class = None

    def _tender(self):
        return get_object_or_404(visible_tenders(self.request.user), pk=self.kwargs["tender_id"])

    def get_queryset(self):
        return self._tender().checklist.all()

    def perform_create(self, serializer):
        tender = self._tender()
        if get_role(self.request.user) != BUYER:
            raise PermissionDenied("Only the buyer can edit the checklist.")
        serializer.save(tender=tender, order=tender.checklist.count() + 1)


class ChecklistDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ChecklistItemSerializer

    def get_queryset(self):
        return ChecklistItem.objects.filter(tender__in=visible_tenders(self.request.user))

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method not in ("GET", "HEAD", "OPTIONS") and get_role(request.user) != BUYER:
            raise PermissionDenied("Only the buyer can edit the checklist.")
