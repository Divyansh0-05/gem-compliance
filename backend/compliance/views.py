from django.db.models import Avg, Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import BIDDER, BUYER, EVALUATOR, IsBuyer, IsReviewer, get_role
from bids.models import Bid
from bids.serializers import BidListSerializer
from bids.views import visible_bids
from tenders.views import visible_tenders

from .engine import recompute_report
from .models import ComplianceResult
from .pdf_report import build_report_pdf
from .serializers import ComplianceReportSerializer


class ReportView(APIView):
    def get(self, request, pk):
        bid = get_object_or_404(visible_bids(request.user), pk=pk)
        if not hasattr(bid, "report"):
            raise ValidationError({"detail": "No report generated for this bid yet."})
        return Response(ComplianceReportSerializer(bid.report).data)


class ReportPdfView(APIView):
    def get(self, request, pk):
        bid = get_object_or_404(visible_bids(request.user), pk=pk)
        if not hasattr(bid, "report"):
            raise ValidationError({"detail": "No report generated for this bid yet."})
        resp = HttpResponse(build_report_pdf(bid), content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="compliance-report-bid-{bid.id}.pdf"'
        return resp


class OverrideView(APIView):
    permission_classes = [IsReviewer]

    def patch(self, request, pk):
        result = get_object_or_404(ComplianceResult.objects.select_related("report__bid__tender"), pk=pk)
        if not visible_bids(request.user).filter(pk=result.report.bid_id).exists():
            raise PermissionDenied("You cannot modify this bid.")
        new_status = str(request.data.get("status", "")).upper()
        remark = str(request.data.get("remark", "")).strip()
        if new_status not in ("PASS", "FAIL", "REVIEW"):
            raise ValidationError({"status": "Must be PASS, FAIL or REVIEW."})
        if not remark:
            raise ValidationError({"remark": "A remark is required for an override (audit trail)."})
        if not result.original_status:
            result.original_status = result.status
        result.status, result.override_remark, result.overridden_by = new_status, remark[:300], request.user
        result.save()
        recompute_report(result.report)
        return Response(ComplianceReportSerializer(result.report).data)


class DecisionView(APIView):
    permission_classes = [IsBuyer]

    def post(self, request, pk):
        bid = get_object_or_404(visible_bids(request.user), pk=pk)
        decision = str(request.data.get("decision", "")).upper()
        if decision not in ("ACCEPT", "REJECT"):
            raise ValidationError({"decision": "Must be ACCEPT or REJECT."})
        bid.status = Bid.Status.ACCEPTED if decision == "ACCEPT" else Bid.Status.REJECTED
        bid.decision_remark = str(request.data.get("remark", ""))[:300]
        bid.save()
        return Response({"id": bid.id, "status": bid.status, "decision_remark": bid.decision_remark})


class DashboardStatsView(APIView):
    def get(self, request):
        role = get_role(request.user)
        bids = visible_bids(request.user)
        tenders = visible_tenders(request.user)
        breakdown = {"COMPLIANT": 0, "PARTIALLY_COMPLIANT": 0, "NON_COMPLIANT": 0}
        for row in bids.filter(report__isnull=False).values("report__overall_status").annotate(c=Count("id")):
            breakdown[row["report__overall_status"]] = row["c"]
        status_counts = {row["status"]: row["c"] for row in bids.values("status").annotate(c=Count("id"))}
        avg = bids.filter(report__isnull=False).aggregate(a=Avg("report__score"))["a"]
        per_tender = [
            {"tender_no": t["tender_no"], "title": t["title"], "bids": t["n"]}
            for t in tenders.annotate(n=Count("bids")).values("tender_no", "title", "n").order_by("-n")[:6]
        ]
        buckets = {"0-49": 0, "50-69": 0, "70-84": 0, "85-100": 0}
        for s in bids.filter(report__isnull=False).values_list("report__score", flat=True):
            buckets["0-49" if s < 50 else "50-69" if s < 70 else "70-84" if s < 85 else "85-100"] += 1
        return Response({
            "role": role,
            "tenders_total": tenders.count(),
            "tenders_open": tenders.filter(status="OPEN").count(),
            "bids_total": bids.count(),
            "avg_score": round(avg, 1) if avg is not None else None,
            "compliance_breakdown": breakdown,
            "bid_status_counts": status_counts,
            "bids_per_tender": per_tender,
            "score_buckets": buckets,
            "recent_bids": BidListSerializer(bids[:5], many=True).data,
        })
