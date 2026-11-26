import re
import shutil
import tempfile
from datetime import date, timedelta
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Profile
from bids.models import Bid, BidDocument
from compliance import engine
from compliance.models import ComplianceResult
from compliance.sampledocs import COMPLIANT, NON_COMPLIANT, generate_sample_docs
from tenders.models import ChecklistItem, Tender


def item(ctype, **cfg):
    return SimpleNamespace(check_type=ctype, config=cfg, name="x", description="", is_mandatory=True, weight=10)


class CheckerUnitTests(TestCase):
    def test_gstin_pan_udyam_ifsc_cin(self):
        rx = lambda n, s: re.search(engine.PATTERNS[n], s)
        self.assertTrue(rx("GSTIN", "GSTIN: 03ABCDE1234F1Z5"))
        self.assertFalse(rx("GSTIN", "GSTIN: 03ABCDE1234"))
        self.assertTrue(rx("PAN", "PAN ABCDE1234F"))
        self.assertFalse(rx("PAN", "PAN ABCD1234F"))
        self.assertTrue(rx("UDYAM", "UDYAM-PB-08-0012345"))
        self.assertFalse(rx("UDYAM", "UDYAM-PB-8-12345"))
        self.assertTrue(rx("IFSC", "SBIN0001234"))
        self.assertTrue(rx("CIN", "U12345PB2019PTC123456"))

    def test_amount_parsing(self):
        vals = lambda t: [a[0] for a in engine.find_amounts(t)]
        self.assertEqual(vals("Rs. 2,50,00,000"), [25000000.0])
        self.assertEqual(vals("₹ 50 lakh"), [5000000.0])
        self.assertEqual(vals("turnover 2.5 crore"), [25000000.0])
        self.assertEqual(vals("INR 5000000"), [5000000.0])
        self.assertEqual(vals("dated 31/12/2028 no money"), [])

    def test_date_parsing_and_validity(self):
        self.assertEqual([d[0] for d in engine.find_dates("valid till 31/12/2028")], [date(2028, 12, 31)])
        self.assertEqual([d[0] for d in engine.find_dates("expires 5 March 2029")], [date(2029, 3, 5)])
        self.assertEqual([d[0] for d in engine.find_dates("until March 5, 2029")], [date(2029, 3, 5)])
        tender = SimpleNamespace(bid_end_date=date.today() + timedelta(days=30))
        ctx = {"tender": tender, "has_images": False, "today": date.today()}
        self.assertEqual(engine.check_validity(item("VALIDITY_DATE"), "Valid up to 31/12/2099", ctx)[0], "PASS")
        self.assertEqual(engine.check_validity(item("VALIDITY_DATE"), "Valid up to 15/03/2020", ctx)[0], "FAIL")
        self.assertEqual(engine.check_validity(item("VALIDITY_DATE"), "No dates here", ctx)[0], "REVIEW")

    def test_keyword_numeric_signature(self):
        ctx = {"tender": None, "has_images": False, "today": date.today()}
        self.assertEqual(engine.check_keyword(item("KEYWORD", keywords=["work order", "completed"]), "Work Order 5 was Completed", ctx)[0], "PASS")
        self.assertEqual(engine.check_keyword(item("KEYWORD", keywords=["work order", "completed"]), "Work Order only", ctx)[0], "FAIL")
        self.assertEqual(engine.check_numeric(item("NUMERIC_THRESHOLD", min_value=5000000), "turnover Rs. 12,00,000", ctx)[0], "FAIL")
        self.assertEqual(engine.check_numeric(item("NUMERIC_THRESHOLD", min_value=5000000), "turnover Rs. 2 crore", ctx)[0], "PASS")
        self.assertEqual(engine.check_signature(item("SIGNATURE_STAMP"), "Digitally signed by X, Authorised Signatory", ctx)[0], "PASS")
        self.assertEqual(engine.check_signature(item("SIGNATURE_STAMP"), "plain text", ctx)[0], "FAIL")

    def test_ai_without_key_returns_review(self):
        with override_settings(ANTHROPIC_API_KEY=""):
            self.assertEqual(engine.check_ai(item("AI_SEMANTIC"), "text", {})[0], "REVIEW")


class RunComplianceTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user("b", password="x")
        self.bidder = User.objects.create_user("v", password="x")
        self.tender = Tender.objects.create(title="T", tender_no="GEM/1", bid_end_date=date.today() + timedelta(days=10),
                                            status="OPEN", created_by=self.buyer)
        self.i1 = ChecklistItem.objects.create(tender=self.tender, name="GST", check_type="REGEX", config={"pattern": "GSTIN"}, weight=10)
        self.i2 = ChecklistItem.objects.create(tender=self.tender, name="PAN", check_type="REGEX", config={"pattern": "PAN"}, weight=10, is_mandatory=False)

    def _bid(self, t1, t2):
        bid = Bid.objects.create(tender=self.tender, bidder=self.bidder)
        for it, txt in ((self.i1, t1), (self.i2, t2)):
            if txt is not None:
                BidDocument.objects.create(bid=bid, checklist_item=it, file="x.pdf", extracted_text=txt)
        return bid

    def test_compliant(self):
        r = engine.run_compliance(self._bid("GSTIN 03ABCDE1234F1Z5", "PAN ABCDE1234F"))
        self.assertEqual((r.overall_status, r.score), ("COMPLIANT", 100.0))

    def test_mandatory_failure_forces_non_compliant(self):
        r = engine.run_compliance(self._bid("GSTIN missing", "PAN ABCDE1234F"))
        self.assertEqual(r.overall_status, "NON_COMPLIANT")
        self.assertEqual(r.score, 50.0)

    def test_optional_failure_is_partial_and_missing_doc_fails(self):
        r = engine.run_compliance(self._bid("GSTIN 03ABCDE1234F1Z5", None))
        self.assertEqual(r.overall_status, "PARTIALLY_COMPLIANT")
        self.assertIn("No document uploaded", r.results.get(checklist_item=self.i2).reason)

    def test_consistency_match(self):
        r = engine.run_compliance(self._bid("GSTIN 03ABCDE1234F1Z5", "PAN ABCDE1234F"))
        self.assertEqual(r.consistency_findings, [])
        self.assertEqual(r.overall_status, "COMPLIANT")
        self.assertEqual(r.score, 100.0)

    def test_consistency_pan_mismatch(self):
        r = engine.run_compliance(self._bid("GSTIN 03ABCDE1234F1Z5", "PAN XYZPA9876Q"))
        self.assertEqual(r.score, 100.0)
        self.assertEqual(r.overall_status, "PARTIALLY_COMPLIANT")
        self.assertTrue(len(r.consistency_findings) > 0)
        self.assertEqual(r.consistency_findings[0]["rule"], "RULE_A")
        # Ensure recompute_report preserves capping at PARTIALLY_COMPLIANT
        engine.recompute_report(r)
        self.assertEqual(r.overall_status, "PARTIALLY_COMPLIANT")

    def test_consistency_no_identifiers_found(self):
        tender = Tender.objects.create(title="T2", tender_no="GEM/2", bid_end_date=date.today() + timedelta(days=10),
                                       status="OPEN", created_by=self.buyer)
        it = ChecklistItem.objects.create(tender=tender, name="Doc", check_type="DOC_PRESENT", weight=10)
        bid = Bid.objects.create(tender=tender, bidder=self.bidder)
        BidDocument.objects.create(bid=bid, checklist_item=it, file="doc.pdf", extracted_text="This is a readable document with no tax ids.")
        r = engine.run_compliance(bid)
        self.assertEqual(r.consistency_findings, [])
        self.assertEqual(r.overall_status, "COMPLIANT")
        self.assertEqual(r.score, 100.0)


class ApiFlowTests(TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.samples = tempfile.mkdtemp()
        generate_sample_docs(self.samples)
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media, ignore_errors=True)
        shutil.rmtree(self.samples, ignore_errors=True)

    def client_for(self, username, role):
        c = APIClient()
        res = c.post("/api/auth/register/", {"username": username, "password": "secret1", "role": role, "company_name": username.title()}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        c.credentials(HTTP_AUTHORIZATION="Bearer " + res.data["access"])
        return c

    def upload(self, client, tender_id, items, folder):
        files = {}
        names = list(COMPLIANT.keys() if folder == "compliant" else NON_COMPLIANT.keys())
        for it, fname in zip(items, names):
            with open(f"{self.samples}/{folder}/{fname}", "rb") as fh:
                files[f"file_{it['id']}"] = SimpleUploadedFile(fname, fh.read(), content_type="application/pdf")
        return client.post(f"/api/tenders/{tender_id}/bids/", files, format="multipart")

    def test_full_flow(self):
        buyer = self.client_for("buyer1", "BUYER")
        bidder = self.client_for("bidder1", "BIDDER")
        other = self.client_for("bidder2", "BIDDER")

        res = buyer.post("/api/tenders/", {"title": "Laptops", "tender_no": "GEM/2026/B/1", "bid_end_date": str(date.today() + timedelta(days=30)),
                                           "status": "OPEN", "emd_amount": 100000}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        tid = res.data["id"]
        specs = [
            ("GST", "REGEX", {"pattern": "GSTIN"}, True, 15), ("PAN", "REGEX", {"pattern": "PAN"}, True, 10),
            ("Udyam", "REGEX", {"pattern": "UDYAM"}, True, 10), ("Turnover", "NUMERIC_THRESHOLD", {"min_value": 5000000, "context_keywords": ["turnover"]}, True, 15),
            ("EMD", "VALIDITY_DATE", {}, True, 10), ("Experience", "KEYWORD", {"keywords": ["work order", "completed successfully"]}, True, 10),
            ("Declaration", "SIGNATURE_STAMP", {}, True, 10), ("Tech sheet", "AI_SEMANTIC", {}, False, 5),
        ]
        items = []
        for name, ctype, cfg, mand, w in specs:
            r = buyer.post(f"/api/tenders/{tid}/checklist/", {"name": name, "check_type": ctype, "config": cfg, "is_mandatory": mand, "weight": w}, format="json")
            self.assertEqual(r.status_code, 201, r.content)
            items.append(r.data)

        # validation + role checks
        self.assertEqual(buyer.post(f"/api/tenders/{tid}/checklist/", {"name": "bad", "check_type": "KEYWORD", "config": {}}, format="json").status_code, 400)
        self.assertEqual(bidder.post("/api/tenders/", {"title": "x"}, format="json").status_code, 403)

        good = self.upload(bidder, tid, items, "compliant")
        self.assertEqual(good.status_code, 201, good.content)
        self.assertEqual(good.data["report"]["overall_status"], "COMPLIANT", good.data["report"]["summary"])
        self.assertGreaterEqual(good.data["report"]["score"], 90)

        bad = self.upload(bidder, tid, items[:7], "non_compliant")
        self.assertEqual(bad.status_code, 201, bad.content)
        self.assertEqual(bad.data["report"]["overall_status"], "NON_COMPLIANT")
        failed = {r["item_name"] for r in bad.data["report"]["results"] if r["status"] == "FAIL"}
        self.assertTrue({"GST", "Udyam", "Turnover", "EMD", "Experience", "Declaration"} <= failed, failed)
        self.assertNotIn("PAN", failed)

        # access control: other bidder cannot see; buyer can
        bid_id = bad.data["id"]
        self.assertEqual(other.get(f"/api/bids/{bid_id}/").status_code, 404)
        self.assertEqual(other.get("/api/bids/").data["count"], 0)
        self.assertEqual(buyer.get("/api/bids/").data["count"], 2)

        pdf = bidder.get(f"/api/bids/{bid_id}/report/pdf/")
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf["Content-Type"], "application/pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF"))

        # override + decision
        rid = next(r["id"] for r in bad.data["report"]["results"] if r["item_name"] == "GST")
        self.assertEqual(bidder.patch(f"/api/results/{rid}/override/", {"status": "PASS", "remark": "x"}, format="json").status_code, 403)
        self.assertEqual(buyer.patch(f"/api/results/{rid}/override/", {"status": "PASS"}, format="json").status_code, 400)
        ov = buyer.patch(f"/api/results/{rid}/override/", {"status": "PASS", "remark": "Verified manually on GSTN portal"}, format="json")
        self.assertEqual(ov.status_code, 200)
        self.assertGreater(ov.data["score"], bad.data["report"]["score"])
        dec = buyer.post(f"/api/bids/{bid_id}/decision/", {"decision": "REJECT", "remark": "Non-compliant"}, format="json")
        self.assertEqual(dec.data["status"], "REJECTED")

        stats = buyer.get("/api/dashboard/stats/").data
        self.assertEqual(stats["bids_total"], 2)
        self.assertEqual(stats["compliance_breakdown"]["COMPLIANT"], 1)

    def test_bad_upload_rejected(self):
        buyer = self.client_for("buyerx", "BUYER")
        bidder = self.client_for("bidderx", "BIDDER")
        tid = buyer.post("/api/tenders/", {"title": "T", "tender_no": "GEM/9", "bid_end_date": str(date.today() + timedelta(days=5)), "status": "OPEN"}, format="json").data["id"]
        it = buyer.post(f"/api/tenders/{tid}/checklist/", {"name": "Doc", "check_type": "DOC_PRESENT"}, format="json").data
        r = bidder.post(f"/api/tenders/{tid}/bids/", {f"file_{it['id']}": SimpleUploadedFile("a.exe", b"x")}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(bidder.post(f"/api/tenders/{tid}/bids/", {}, format="multipart").status_code, 400)
