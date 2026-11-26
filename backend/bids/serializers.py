import os

from rest_framework import serializers

from compliance.serializers import ComplianceReportSerializer

from .models import Bid, BidDocument


class BidDocumentSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    item_name = serializers.CharField(source="checklist_item.name", read_only=True, default="")
    url = serializers.SerializerMethodField()

    class Meta:
        model = BidDocument
        fields = ("id", "name", "item_name", "ocr_used", "uploaded_at", "url")

    def get_name(self, obj):
        return os.path.basename(obj.file.name)

    def get_url(self, obj):
        req = self.context.get("request")
        return req.build_absolute_uri(obj.file.url) if req else obj.file.url


class BidListSerializer(serializers.ModelSerializer):
    tender_id = serializers.IntegerField(read_only=True)
    tender_no = serializers.CharField(source="tender.tender_no", read_only=True)
    tender_title = serializers.CharField(source="tender.title", read_only=True)
    bidder = serializers.CharField(source="bidder.username", read_only=True)
    company = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()
    overall_status = serializers.SerializerMethodField()

    class Meta:
        model = Bid
        fields = ("id", "tender_id", "tender_no", "tender_title", "bidder", "company", "status", "submitted_at", "score", "overall_status")

    def get_company(self, obj):
        p = getattr(obj.bidder, "profile", None)
        return (p.company_name if p and p.company_name else obj.bidder.username)

    def get_score(self, obj):
        return obj.report.score if hasattr(obj, "report") else None

    def get_overall_status(self, obj):
        return obj.report.overall_status if hasattr(obj, "report") else None


class BidDetailSerializer(BidListSerializer):
    documents = BidDocumentSerializer(many=True, read_only=True)
    report = ComplianceReportSerializer(read_only=True)
    bid_end_date = serializers.DateField(source="tender.bid_end_date", read_only=True)

    class Meta(BidListSerializer.Meta):
        fields = BidListSerializer.Meta.fields + ("decision_remark", "documents", "report", "bid_end_date")
