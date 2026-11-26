import os

from rest_framework import serializers

from .models import ComplianceReport, ComplianceResult


class ComplianceResultSerializer(serializers.ModelSerializer):
    item_id = serializers.IntegerField(source="checklist_item_id", read_only=True)
    item_name = serializers.CharField(source="checklist_item.name", read_only=True)
    item_description = serializers.CharField(source="checklist_item.description", read_only=True)
    check_type = serializers.CharField(source="checklist_item.check_type", read_only=True)
    is_mandatory = serializers.BooleanField(source="checklist_item.is_mandatory", read_only=True)
    weight = serializers.IntegerField(source="checklist_item.weight", read_only=True)
    source_document_name = serializers.SerializerMethodField()
    overridden_by_name = serializers.CharField(source="overridden_by.username", read_only=True, default="")

    class Meta:
        model = ComplianceResult
        fields = (
            "id", "item_id", "item_name", "item_description", "check_type", "is_mandatory", "weight", "status",
            "confidence", "evidence_snippet", "reason", "fix_suggestion", "source_document_name",
            "original_status", "overridden_by_name", "override_remark",
        )

    def get_source_document_name(self, obj):
        return os.path.basename(obj.source_document.file.name) if obj.source_document else ""


class ComplianceReportSerializer(serializers.ModelSerializer):
    results = ComplianceResultSerializer(many=True, read_only=True)

    class Meta:
        model = ComplianceReport
        fields = ("id", "bid", "score", "overall_status", "summary", "consistency_findings", "generated_at", "results")
