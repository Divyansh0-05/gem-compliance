import re

from rest_framework import serializers

from compliance.engine import PATTERNS

from .models import ChecklistItem, Tender


class ChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistItem
        fields = ("id", "tender", "name", "description", "check_type", "config", "is_mandatory", "weight", "order")
        read_only_fields = ("tender",)

    def validate(self, attrs):
        ctype = attrs.get("check_type", getattr(self.instance, "check_type", None))
        cfg = attrs.get("config", getattr(self.instance, "config", {})) or {}
        if ctype == "KEYWORD":
            kws = cfg.get("keywords")
            if not isinstance(kws, list) or not [k for k in kws if str(k).strip()]:
                raise serializers.ValidationError({"config": "Provide at least one keyword."})
            if cfg.get("mode", "all") not in ("all", "any"):
                raise serializers.ValidationError({"config": "mode must be 'all' or 'any'."})
        elif ctype == "REGEX":
            name, custom = str(cfg.get("pattern", "")).upper(), cfg.get("custom")
            if custom:
                try:
                    re.compile(custom)
                except re.error:
                    raise serializers.ValidationError({"config": "Custom pattern is not a valid regular expression."})
            elif name not in PATTERNS:
                raise serializers.ValidationError({"config": f"Choose a pattern: {', '.join(PATTERNS)} or give a custom regex."})
        elif ctype == "NUMERIC_THRESHOLD":
            try:
                float(cfg.get("min_value"))
            except (TypeError, ValueError):
                raise serializers.ValidationError({"config": "min_value must be a number (in rupees)."})
        return attrs


class TenderSerializer(serializers.ModelSerializer):
    checklist_count = serializers.SerializerMethodField()
    bids_count = serializers.SerializerMethodField()
    my_bid_id = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Tender
        fields = (
            "id", "title", "tender_no", "description", "category", "estimated_value", "emd_amount",
            "bid_end_date", "status", "created_by_name", "created_at", "checklist_count", "bids_count", "my_bid_id",
        )
        read_only_fields = ("created_at",)

    def get_checklist_count(self, obj):
        return obj.checklist.count()

    def get_bids_count(self, obj):
        return obj.bids.count()

    def get_my_bid_id(self, obj):
        req = self.context.get("request")
        if not req:
            return None
        bid = obj.bids.filter(bidder=req.user).first()
        return bid.id if bid else None
