import os
from datetime import date

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import BIDDER, BUYER, EVALUATOR, get_role
from compliance.engine import extract_text, run_compliance
from tenders.models import Tender

from .models import Bid, BidDocument
from .serializers import BidDetailSerializer, BidListSerializer


def visible_bids(user):
    role = get_role(user)
    qs = Bid.objects.select_related("tender", "bidder", "bidder__profile", "report")
    if role == BIDDER:
        return qs.filter(bidder=user)
    if role == BUYER:
        return qs.filter(tender__created_by=user)
    if role == EVALUATOR:
        return qs
    return qs.none()


class BidListView(generics.ListAPIView):
    serializer_class = BidListSerializer

    def get_queryset(self):
        qs = visible_bids(self.request.user)
        p = self.request.query_params
        if p.get("tender"):
            qs = qs.filter(tender_id=p["tender"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("overall"):
            qs = qs.filter(report__overall_status=p["overall"])
        if p.get("min_score"):
            qs = qs.filter(report__score__gte=p["min_score"])
        if p.get("q"):
            q = p["q"]
            qs = qs.filter(Q(bidder__username__icontains=q) | Q(bidder__profile__company_name__icontains=q) | Q(tender__title__icontains=q) | Q(tender__tender_no__icontains=q))
        return qs


class BidDetailView(generics.RetrieveAPIView):
    serializer_class = BidDetailSerializer

    def get_queryset(self):
        return visible_bids(self.request.user)


class TenderBidCreateView(APIView):
    """POST multipart with one file per checklist item, keyed ``file_<checklist_item_id>``."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, tender_id):
        if get_role(request.user) != BIDDER:
            raise PermissionDenied("Only bidders can submit bids.")
        tender = get_object_or_404(Tender, pk=tender_id, status=Tender.Status.OPEN)
        if tender.bid_end_date < date.today():
            raise ValidationError({"detail": "The bid submission deadline for this tender has passed."})
        items = {i.id: i for i in tender.checklist.all()}
        max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
        uploads, errors = [], {}
        for key, f in request.FILES.items():
            if not key.startswith("file_"):
                continue
            try:
                item = items[int(key[5:])]
            except (ValueError, KeyError):
                errors[key] = "Unknown checklist item."
                continue
            ext = os.path.splitext(f.name)[1].lower()
            if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
                errors[key] = f"'{f.name}': only PDF, DOCX, PNG or JPG files are allowed."
            elif f.size > max_bytes:
                errors[key] = f"'{f.name}': file is larger than {settings.MAX_UPLOAD_MB} MB."
            else:
                uploads.append((item, f))
        if errors:
            raise ValidationError(errors)
        if not uploads:
            raise ValidationError({"detail": "Upload at least one document."})

        with transaction.atomic():
            bid = Bid.objects.create(tender=tender, bidder=request.user)
            for item, f in uploads:
                doc = BidDocument.objects.create(bid=bid, checklist_item=item, file=f, doc_type=item.name)
                text, ocr, imgs = extract_text(doc.file.path)
                doc.extracted_text, doc.ocr_used, doc.has_images = text, ocr, imgs
                doc.save(update_fields=["extracted_text", "ocr_used", "has_images"])
            run_compliance(bid)
        bid = visible_bids(request.user).get(pk=bid.pk)
        return Response(BidDetailSerializer(bid, context={"request": request}).data, status=status.HTTP_201_CREATED)
