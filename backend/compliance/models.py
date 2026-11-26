from django.contrib.auth.models import User
from django.db import models

from bids.models import Bid, BidDocument
from tenders.models import ChecklistItem


class ComplianceReport(models.Model):
    class Overall(models.TextChoices):
        COMPLIANT = "COMPLIANT", "Compliant"
        PARTIAL = "PARTIALLY_COMPLIANT", "Partially compliant"
        NON_COMPLIANT = "NON_COMPLIANT", "Non-compliant"

    bid = models.OneToOneField(Bid, on_delete=models.CASCADE, related_name="report")
    score = models.FloatField(default=0)
    overall_status = models.CharField(max_length=20, choices=Overall.choices, default=Overall.NON_COMPLIANT)
    summary = models.TextField(blank=True)
    consistency_findings = models.JSONField(default=list, blank=True)
    generated_at = models.DateTimeField(auto_now=True)


class ComplianceResult(models.Model):
    class Status(models.TextChoices):
        PASS = "PASS", "Pass"
        FAIL = "FAIL", "Fail"
        REVIEW = "REVIEW", "Needs review"

    report = models.ForeignKey(ComplianceReport, on_delete=models.CASCADE, related_name="results")
    checklist_item = models.ForeignKey(ChecklistItem, on_delete=models.CASCADE, related_name="results")
    status = models.CharField(max_length=7, choices=Status.choices)
    confidence = models.FloatField(default=0)
    evidence_snippet = models.TextField(blank=True)
    reason = models.TextField(blank=True)
    fix_suggestion = models.TextField(blank=True)
    source_document = models.ForeignKey(BidDocument, null=True, blank=True, on_delete=models.SET_NULL)
    original_status = models.CharField(max_length=7, blank=True)
    overridden_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    override_remark = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["checklist_item__order", "checklist_item_id"]
