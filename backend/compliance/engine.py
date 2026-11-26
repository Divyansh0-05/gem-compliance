"""Document AI verification engine.

Pipeline:  extract_text()  ->  one checker per check_type  ->  run_compliance()

All checkers have the signature ``checker(item, text, ctx) -> (status, confidence, evidence, reason)``
where ``ctx`` is ``{"tender": Tender, "has_images": bool, "today": date}``.
The engine works fully offline; only AI_SEMANTIC optionally calls the Anthropic API.
"""
import json
import os
import re
from collections import defaultdict
from datetime import date

from django.conf import settings
from rapidfuzz import fuzz

PASS, FAIL, REVIEW = "PASS", "FAIL", "REVIEW"

# --------------------------------------------------------------------------- #
# 1. Text extraction (digital PDF -> OCR fallback, DOCX, images)
# --------------------------------------------------------------------------- #


def _ocr_image(img):
    import pytesseract

    if settings.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
    return pytesseract.image_to_string(img)


def extract_text(path):
    """Return ``(text, ocr_used, has_images)`` for a PDF / DOCX / image file."""
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".pdf":
            return _extract_pdf(path)
        if ext == ".docx":
            return _extract_docx(path)
        if ext in {".png", ".jpg", ".jpeg"}:
            from PIL import Image

            return _ocr_image(Image.open(path)).strip(), True, True
    except Exception:  # unreadable file -> caller flags it for review
        return "", False, False
    return "", False, False


def _extract_pdf(path):
    import pdfplumber

    texts, has_images, pages = [], False, 0
    with pdfplumber.open(path) as pdf:
        pages = len(pdf.pages)
        for page in pdf.pages:
            texts.append(page.extract_text() or "")
            if page.images:
                has_images = True
    text = "\n".join(texts).strip()
    if pages and len(text) < 50 * pages:  # scanned / image-only -> OCR fallback
        try:
            from pdf2image import convert_from_path

            ocr = "\n".join(_ocr_image(im) for im in convert_from_path(path, dpi=200, poppler_path=settings.POPPLER_PATH or None))
            if len(ocr.strip()) > len(text):
                return ocr.strip(), True, True
        except Exception:
            pass
    return text, False, has_images


def _extract_docx(path):
    import docx

    d = docx.Document(path)
    parts = [p.text for p in d.paragraphs]
    for table in d.tables:
        for row in table.rows:
            parts.append(" | ".join(c.text for c in row.cells))
    return "\n".join(parts).strip(), False, bool(d.inline_shapes)


# --------------------------------------------------------------------------- #
# 2. Helpers: patterns, amounts, dates
# --------------------------------------------------------------------------- #

PATTERNS = {
    "GSTIN": r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b",
    "PAN": r"\b[A-Z]{5}\d{4}[A-Z]\b",
    "UDYAM": r"\bUDYAM-[A-Z]{2}-\d{2}-\d{7}\b",
    "CIN": r"\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b",
    "IFSC": r"\b[A-Z]{4}0[A-Z0-9]{6}\b",
}

UNITS = {"crore": 1e7, "crores": 1e7, "cr": 1e7, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5}
_AMOUNT_RE = re.compile(
    r"(?:(?:₹|Rs\.?|INR)\s*(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?)?\b)"
    r"|(?:(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?)\b)",
    re.IGNORECASE,
)

_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_DATE_RES = [
    (re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"), "dmy"),
    (re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b"), "dMy"),
    (re.compile(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b"), "Mdy"),
]


def snippet(text, start, end, pad=70):
    s, e = max(0, start - pad), min(len(text), end + pad)
    return ("..." if s else "") + " ".join(text[s:e].split()) + ("..." if e < len(text) else "")


def find_amounts(text):
    """Return ``[(amount_in_rupees, start, end)]``; understands Rs./₹/INR, lakh and crore."""
    out = []
    for m in _AMOUNT_RE.finditer(text):
        num, unit = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        try:
            value = float(num.replace(",", "").rstrip("."))
        except ValueError:
            continue
        if unit:
            value *= UNITS[unit.lower()]
        out.append((value, m.start(), m.end()))
    return out


def find_dates(text):
    """Return ``[(date, start, end)]`` for dd/mm/yyyy, yyyy-mm-dd, '12 March 2027', 'March 12, 2027'."""
    out = []
    for rx, kind in _DATE_RES:
        for m in rx.finditer(text):
            try:
                a, b, c = m.groups()
                if kind == "dmy":
                    d = date(int(c), int(b), int(a))
                elif kind == "ymd":
                    d = date(int(a), int(b), int(c))
                elif kind == "dMy":
                    d = date(int(c), _MONTHS[b[:3].lower()], int(a))
                else:
                    d = date(int(c), _MONTHS[a[:3].lower()], int(b))
                out.append((d, m.start(), m.end()))
            except (ValueError, KeyError):
                continue
    return out


# --------------------------------------------------------------------------- #
# 3. Checkers
# --------------------------------------------------------------------------- #


def check_doc_present(item, text, ctx):
    if len(text.strip()) >= 20:
        return PASS, 0.95, snippet(text, 0, 0, 120), "Document uploaded and readable."
    return REVIEW, 0.4, "", "Document uploaded but little or no text could be read (poor scan?)."


def check_keyword(item, text, ctx):
    kws = item.config.get("keywords") or []
    if not kws:
        return REVIEW, 0.3, "", "No keywords configured for this checklist item."
    mode = item.config.get("mode", "all")
    low = text.lower()
    found, missing, first = [], [], None
    for kw in kws:
        k = kw.lower()
        pos = low.find(k)
        if pos < 0:
            al = fuzz.partial_ratio_alignment(k, low)
            if al and al.score >= 88:
                pos = al.dest_start
        if pos >= 0:
            found.append(kw)
            first = snippet(text, pos, pos + len(k)) if first is None else first
        else:
            missing.append(kw)
    ok = (len(missing) == 0) if mode == "all" else bool(found)
    if ok:
        return PASS, round(0.6 + 0.35 * len(found) / len(kws), 2), first or "", f"Found: {', '.join(found)}."
    return FAIL, 0.85, first or "", f"Missing required content: {', '.join(missing)}."


def check_regex(item, text, ctx):
    name = (item.config.get("pattern") or "").upper()
    custom = item.config.get("custom")
    try:
        if custom:
            m = re.search(custom, text, re.IGNORECASE)
            label = item.config.get("label", "custom pattern")
        elif name in PATTERNS:
            m = re.search(PATTERNS[name], text.upper())
            label = name
        else:
            return REVIEW, 0.3, "", "No valid pattern configured for this checklist item."
    except re.error:
        return REVIEW, 0.3, "", "Invalid custom pattern configured."
    if m:
        return PASS, 0.95, snippet(text, m.start(), m.end()), f"Valid {label} found: {m.group(0)}."
    if ctx.get("ocr_used"):  # scanned doc: a miss may just be an OCR reading error
        return REVIEW, 0.5, "", f"No valid {label} found, but this is a scanned document (OCR) so reading errors are possible; verify manually."
    return FAIL, 0.9, "", f"No valid {label} found in the document."


def check_numeric(item, text, ctx):
    minimum = float(item.config.get("min_value") or 0)
    ckw = [k.lower() for k in item.config.get("context_keywords", [])]
    scope = text
    if ckw:
        lines = [l for l in text.splitlines() if any(k in l.lower() for k in ckw)]
        scope = "\n".join(lines) or text
    amounts = find_amounts(scope)
    if not amounts:
        return FAIL, 0.75, "", "No monetary amount (Rs./lakh/crore) could be found."
    best = max(amounts, key=lambda a: a[0])
    ev = snippet(scope, best[1], best[2])
    if best[0] >= minimum:
        return PASS, 0.9, ev, f"Amount Rs. {best[0]:,.0f} meets the minimum of Rs. {minimum:,.0f}."
    return FAIL, 0.9, ev, f"Highest amount found is Rs. {best[0]:,.0f}, below the required Rs. {minimum:,.0f}."


_SIGN_WORDS = ("signed", "signature", "authorised signatory", "authorized signatory", "seal", "stamp")


def check_signature(item, text, ctx):
    low = text.lower()
    hits = [w for w in _SIGN_WORDS if w in low]
    if not hits:
        return FAIL, 0.85, "", "No signature, authorised signatory or seal/stamp indication found."
    pos = low.find(hits[0])
    ev = snippet(text, pos, pos + len(hits[0]))
    strong = ("signed" in low or "signature" in low) and ("signatory" in low or "digitally" in low)
    if strong or ctx.get("has_images"):
        return PASS, 0.85 if strong else 0.7, ev, f"Signature/stamp indicators found ({', '.join(hits)})."
    return REVIEW, 0.5, ev, "Signature wording present but no clear signature/seal evidence; verify manually."


_VALID_KEYS = ("valid", "expiry", "expires", "expiring", "till", "upto", "up to", "validity")


def check_validity(item, text, ctx):
    tender = ctx["tender"]
    required = max(ctx["today"], tender.bid_end_date)
    cands = []
    for line in text.splitlines():
        if any(k in line.lower() for k in _VALID_KEYS):
            cands += [(d, line) for d, _, _ in find_dates(line)]
    if not cands:
        return REVIEW, 0.4, "", "No explicit validity / expiry date found; verify manually."
    latest, line = max(cands, key=lambda c: c[0])
    ev = " ".join(line.split())[:220]
    if latest >= required:
        return PASS, 0.9, ev, f"Valid until {latest:%d %b %Y} (needed until {required:%d %b %Y})."
    return FAIL, 0.9, ev, f"Expired/expiring on {latest:%d %b %Y}; must be valid until at least {required:%d %b %Y}."


def check_ai(item, text, ctx):
    key = settings.ANTHROPIC_API_KEY
    if not key:
        return REVIEW, 0.3, "", "AI check unavailable (no ANTHROPIC_API_KEY configured); manual review needed."
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=key)
        prompt = (
            "You verify a government tender bid document against a requirement.\n"
            f"Requirement: {item.name}. {item.description}\n\nDocument text (truncated):\n{text[:6000]}\n\n"
            'Reply with ONLY JSON: {"status":"PASS|FAIL|REVIEW","confidence":0-1,"evidence":"short quote","reason":"one sentence"}'
        )
        msg = client.messages.create(model=settings.ANTHROPIC_MODEL, max_tokens=400, messages=[{"role": "user", "content": prompt}])
        raw = msg.content[0].text
        data = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
        status = data.get("status", REVIEW).upper()
        status = status if status in (PASS, FAIL, REVIEW) else REVIEW
        return status, float(data.get("confidence", 0.5)), str(data.get("evidence", ""))[:400], str(data.get("reason", ""))[:400]
    except Exception:
        return REVIEW, 0.3, "", "AI check unavailable (API call failed); manual review needed."


CHECKERS = {
    "DOC_PRESENT": check_doc_present,
    "KEYWORD": check_keyword,
    "REGEX": check_regex,
    "NUMERIC_THRESHOLD": check_numeric,
    "SIGNATURE_STAMP": check_signature,
    "VALIDITY_DATE": check_validity,
    "AI_SEMANTIC": check_ai,
}


def build_fix(item, status, has_doc=True):
    """Human-readable 'how to fix' hint shown to the bidder for non-passing items."""
    if status == PASS:
        return ""
    if not has_doc:
        return f"Upload '{item.name}' as a clear PDF, DOCX, PNG or JPG."
    c = item.config or {}
    hints = {
        "DOC_PRESENT": f"Re-upload a clear, readable copy of '{item.name}'.",
        "KEYWORD": f"Ensure the document clearly states: {', '.join(c.get('keywords', []))}.",
        "REGEX": f"Ensure the document shows a valid {c.get('pattern') or c.get('label') or 'ID number'}; check for typos.",
        "NUMERIC_THRESHOLD": f"The document must state an amount of at least Rs. {float(c.get('min_value') or 0):,.0f}.",
        "SIGNATURE_STAMP": "Sign the document by the authorised signatory and add the company seal/stamp before uploading.",
        "VALIDITY_DATE": "Upload a certificate that is valid at least until the bid end date (renew it if expired).",
        "AI_SEMANTIC": f"Make sure the document addresses: {(item.description or item.name).rstrip('. ')}.",
    }
    prefix = "Manual review needed. " if status == REVIEW else ""
    return prefix + hints.get(item.check_type, "Correct the document and re-submit.")


# --------------------------------------------------------------------------- #
# 4. Orchestration
# --------------------------------------------------------------------------- #

_RANK = {PASS: 2, REVIEW: 1, FAIL: 0}


def evaluate_item(item, docs, tender):
    """Run one checklist item against its uploaded documents; returns the best outcome."""
    if not docs:
        return FAIL, 1.0, "", "No document uploaded for this requirement.", None
    best = None
    for doc in docs:
        text = doc.extracted_text or ""
        ctx = {"tender": tender, "has_images": doc.has_images, "ocr_used": doc.ocr_used, "today": date.today()}
        if not text.strip():
            out = (REVIEW, 0.3, "", "No readable text could be extracted (poor scan or empty file).")
        else:
            out = CHECKERS[item.check_type](item, text, ctx)
        if best is None or (_RANK[out[0]], out[1]) > (_RANK[best[0][0]], best[0][1]):
            best = (out, doc)
    return (*best[0], best[1])


def check_consistency(bid):
    """Cross-document consistency check for GSTIN and PAN across all bid documents.

    Rule A: characters 3-12 of every GSTIN must equal every PAN found.
    Rule B: if two different PANs or two different GSTINs appear across documents, flag it.
    Returns a list of dicts: {"rule": str, "message": str, "documents": list[str]}
    """
    gstin_docs = defaultdict(set)
    pan_docs = defaultdict(set)

    for doc in bid.documents.all():
        text = (doc.extracted_text or "").upper()
        doc_name = os.path.basename(doc.file.name) if doc.file else (
            doc.checklist_item.name if doc.checklist_item else f"Doc #{doc.id}"
        )
        for g in set(re.findall(PATTERNS["GSTIN"], text)):
            gstin_docs[g].add(doc_name)
        for p in set(re.findall(PATTERNS["PAN"], text)):
            pan_docs[p].add(doc_name)

    findings = []

    # Rule B: Multiple different PANs or GSTINs across documents
    if len(gstin_docs) > 1:
        findings.append({
            "rule": "RULE_B",
            "message": f"Multiple different GSTINs found across documents: {', '.join(sorted(gstin_docs.keys()))}.",
            "documents": sorted({d for docs in gstin_docs.values() for d in docs}),
        })

    if len(pan_docs) > 1:
        findings.append({
            "rule": "RULE_B",
            "message": f"Multiple different PANs found across documents: {', '.join(sorted(pan_docs.keys()))}.",
            "documents": sorted({d for docs in pan_docs.values() for d in docs}),
        })

    # Rule A: Characters 3-12 of every GSTIN must match every PAN found
    for gstin, g_docs in gstin_docs.items():
        gstin_pan = gstin[2:12]
        for pan, p_docs in pan_docs.items():
            if gstin_pan != pan:
                findings.append({
                    "rule": "RULE_A",
                    "message": f"PAN in GSTIN ({gstin_pan} from {gstin}) does not match PAN ({pan}) found in documents.",
                    "documents": sorted(list(g_docs | p_docs)),
                })

    return findings


def recompute_report(report):
    """Recalculate score/verdict/summary from the current results (also used after manual overrides)."""
    results = list(report.results.select_related("checklist_item"))
    total = sum(r.checklist_item.weight for r in results) or 1
    earned = sum(r.checklist_item.weight * {PASS: 1, REVIEW: 0.5, FAIL: 0}[r.status] for r in results)
    score = round(100 * earned / total, 1)
    mandatory_fail = [r.checklist_item.name for r in results if r.status == FAIL and r.checklist_item.is_mandatory]
    n_fail = sum(r.status == FAIL for r in results)
    has_mismatch = bool(getattr(report, "consistency_findings", None))
    if mandatory_fail:
        overall = "NON_COMPLIANT"
    elif score >= 85 and n_fail == 0:
        overall = "PARTIALLY_COMPLIANT" if has_mismatch else "COMPLIANT"
    elif score >= 50:
        overall = "PARTIALLY_COMPLIANT"
    else:
        overall = "NON_COMPLIANT"
    report.score, report.overall_status = score, overall
    n_pass, n_rev = sum(r.status == PASS for r in results), sum(r.status == REVIEW for r in results)
    summary = f"{n_pass} of {len(results)} checks passed, {n_rev} need review, {n_fail} failed."
    if mandatory_fail:
        summary += " Mandatory requirements failed: " + ", ".join(mandatory_fail) + "."
    if has_mismatch:
        summary += f" Cross-document consistency issues detected ({len(report.consistency_findings)} mismatch{'es' if len(report.consistency_findings) > 1 else ''})."
    report.summary = summary
    report.save()
    return report


def run_compliance(bid):
    """Verify a bid against its tender checklist and persist the report.

    Runs synchronously. To scale, wrap this call in a Celery task (``run_compliance.delay(bid.id)``)
    and have the frontend poll ``GET /api/bids/<id>/report/``.
    """
    from compliance.models import ComplianceReport, ComplianceResult

    tender = bid.tender
    by_item = defaultdict(list)
    for d in bid.documents.all():
        by_item[d.checklist_item_id].append(d)
    report, _ = ComplianceReport.objects.get_or_create(bid=bid)
    report.results.all().delete()
    for item in tender.checklist.all():
        docs = by_item.get(item.id, [])
        status, conf, evidence, reason, source = evaluate_item(item, docs, tender)
        ComplianceResult.objects.create(
            report=report, checklist_item=item, status=status, confidence=conf,
            evidence_snippet=evidence, reason=reason, source_document=source,
            fix_suggestion=build_fix(item, status, has_doc=bool(docs)),
        )
    report.consistency_findings = check_consistency(bid)
    recompute_report(report)
    bid.status = "VERIFIED"
    bid.save(update_fields=["status"])
    return report
