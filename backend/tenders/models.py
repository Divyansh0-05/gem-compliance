from django.contrib.auth.models import User
from django.db import models


class Tender(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    title = models.CharField(max_length=250)
    tender_no = models.CharField(max_length=60, unique=True, help_text="e.g. GEM/2026/B/1234567")
    description = models.TextField(blank=True)
    category = models.CharField(max_length=120, blank=True)
    estimated_value = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    emd_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    bid_end_date = models.DateField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tenders")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.tender_no} - {self.title}"


class ChecklistItem(models.Model):
    class CheckType(models.TextChoices):
        DOC_PRESENT = "DOC_PRESENT", "Document present"
        KEYWORD = "KEYWORD", "Keyword match"
        REGEX = "REGEX", "ID / pattern match"
        NUMERIC_THRESHOLD = "NUMERIC_THRESHOLD", "Numeric threshold"
        SIGNATURE_STAMP = "SIGNATURE_STAMP", "Signature / stamp"
        VALIDITY_DATE = "VALIDITY_DATE", "Validity date"
        AI_SEMANTIC = "AI_SEMANTIC", "AI semantic check"

    tender = models.ForeignKey(Tender, on_delete=models.CASCADE, related_name="checklist")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    check_type = models.CharField(max_length=20, choices=CheckType.choices, default=CheckType.DOC_PRESENT)
    # Examples: {"keywords": ["GST"], "mode": "any"}, {"pattern": "GSTIN"}, {"min_value": 5000000}
    config = models.JSONField(default=dict, blank=True)
    is_mandatory = models.BooleanField(default=True)
    weight = models.PositiveSmallIntegerField(default=10)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.name} ({self.check_type})"
