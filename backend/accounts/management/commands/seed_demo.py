"""Creates demo users, a sample tender with an 8-item checklist, and sample PDFs in ../sample_docs."""
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from accounts.models import Profile
from compliance.sampledocs import generate_sample_docs
from tenders.models import ChecklistItem, Tender

USERS = [
    ("buyer", "buyer123", "BUYER", "Dept. of IT, Govt. of Punjab", "Anita Verma"),
    ("evaluator", "eval123", "EVALUATOR", "Dept. of IT, Govt. of Punjab", "Rohit Mehra"),
    ("bidder1", "bidder123", "BIDDER", "Alpha Infra Pvt Ltd", "Rajesh Kumar"),
    ("bidder2", "bidder123", "BIDDER", "Beta Tech Solutions", "Neha Singh"),
]

CHECKLIST = [
    ("GST Registration Certificate", "Valid GST registration with a correct GSTIN.", "REGEX", {"pattern": "GSTIN"}, True, 15),
    ("PAN Card", "Company PAN card.", "REGEX", {"pattern": "PAN"}, True, 10),
    ("Udyam Registration Certificate", "MSME Udyam registration number.", "REGEX", {"pattern": "UDYAM"}, True, 10),
    ("Annual Turnover Certificate", "CA-certified turnover of at least Rs. 50 lakh.", "NUMERIC_THRESHOLD",
     {"min_value": 5000000, "context_keywords": ["turnover"]}, True, 15),
    ("EMD Proof (Bank Guarantee)", "Bank guarantee valid until the bid end date.", "VALIDITY_DATE", {}, True, 10),
    ("Experience Certificate", "Proof of similar completed work.", "KEYWORD",
     {"keywords": ["work order", "completed successfully"], "mode": "all"}, True, 10),
    ("Signed Declaration", "Declaration signed by the authorised signatory with seal.", "SIGNATURE_STAMP", {}, True, 10),
    ("Technical Compliance Sheet", "Offered specifications must meet or exceed the tender specifications.", "AI_SEMANTIC", {}, False, 5),
]


class Command(BaseCommand):
    help = "Seed demo data (idempotent)."

    def handle(self, *args, **opts):
        users = {}
        for username, pw, role, company, name in USERS:
            u, created = User.objects.get_or_create(username=username, defaults={"first_name": name, "email": f"{username}@example.com"})
            if created:
                u.set_password(pw)
                u.save()
            Profile.objects.get_or_create(user=u, defaults={"role": role, "company_name": company})
            users[username] = u

        tender, created = Tender.objects.get_or_create(
            tender_no="GEM/2026/B/1234567",
            defaults=dict(
                title="Supply of Laptops and Networking Equipment", category="IT Hardware",
                description="Supply, installation and commissioning of laptops and managed switches for district offices.",
                estimated_value=12500000, emd_amount=100000, bid_end_date=date.today() + timedelta(days=30),
                status=Tender.Status.OPEN, created_by=users["buyer"],
            ),
        )
        if created or not tender.checklist.exists():
            for i, (name, desc, ctype, cfg, mand, weight) in enumerate(CHECKLIST, 1):
                ChecklistItem.objects.create(tender=tender, name=name, description=desc, check_type=ctype,
                                             config=cfg, is_mandatory=mand, weight=weight, order=i)
        out = settings.BASE_DIR.parent / "sample_docs"
        generate_sample_docs(str(out))
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write("Logins: buyer/buyer123, evaluator/eval123, bidder1/bidder123, bidder2/bidder123")
        self.stdout.write(f"Sample documents: {out}/compliant and {out}/non_compliant")
