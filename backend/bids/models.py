import os

from django.contrib.auth.models import User
from django.db import models

from tenders.models import ChecklistItem, Tender


class Bid(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        ACCEPTED = "ACCEPTED", "Accepted"

    tender = models.ForeignKey(Tender, on_delete=models.CASCADE, related_name="bids")
    bidder = models.ForeignKey(User, on_delete=models.CASCADE, related_name="bids")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUBMITTED)
    decision_remark = models.CharField(max_length=300, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"Bid #{self.pk} on {self.tender.tender_no} by {self.bidder.username}"


def bid_upload_path(instance, filename):
    bid = instance.bid
    return f"bids/{bid.tender_id}/{bid.pk}/{os.path.basename(filename)}"


class BidDocument(models.Model):
    bid = models.ForeignKey(Bid, on_delete=models.CASCADE, related_name="documents")
    checklist_item = models.ForeignKey(ChecklistItem, null=True, blank=True, on_delete=models.SET_NULL)
    file = models.FileField(upload_to=bid_upload_path)
    doc_type = models.CharField(max_length=60, blank=True)
    extracted_text = models.TextField(blank=True)
    ocr_used = models.BooleanField(default=False)
    has_images = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return os.path.basename(self.file.name)
