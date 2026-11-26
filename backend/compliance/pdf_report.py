"""PDF compliance report generated with reportlab."""
import io
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

STATUS_COLORS = {"PASS": "#15803d", "FAIL": "#b91c1c", "REVIEW": "#b45309"}
VERDICT = {"COMPLIANT": ("COMPLIANT", "#15803d"), "PARTIALLY_COMPLIANT": ("PARTIALLY COMPLIANT", "#b45309"), "NON_COMPLIANT": ("NON-COMPLIANT", "#b91c1c")}


def build_report_pdf(bid):
    report = bid.report
    tender = bid.tender
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"Compliance Report - {tender.tender_no}")
    ss = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=ss["BodyText"], fontSize=8, leading=10)
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontSize=18, textColor=colors.HexColor("#1e3a8a"), alignment=0)
    story = [Paragraph("Bid Compliance Verification Report", h1)]

    company = getattr(getattr(bid.bidder, "profile", None), "company_name", "") or bid.bidder.username
    info = [
        ["Tender No.", tender.tender_no, "Bid ID", f"#{bid.id}"],
        ["Title", Paragraph(tender.title, small), "Bidder", Paragraph(company, small)],
        ["Bid end date", tender.bid_end_date.strftime("%d %b %Y"), "Submitted", bid.submitted_at.strftime("%d %b %Y %H:%M")],
    ]
    t = Table(info, colWidths=[28 * mm, 66 * mm, 25 * mm, 63 * mm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8), ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                           ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [t, Spacer(1, 6 * mm)]

    label, color = VERDICT.get(report.overall_status, ("-", "#334155"))
    story.append(Paragraph(f'<font size="14" color="{color}"><b>{label}</b></font> &nbsp; <font size="12">Score: <b>{report.score:.1f}/100</b></font>', ss["BodyText"]))
    story += [Spacer(1, 2 * mm), Paragraph(report.summary, ss["BodyText"]), Spacer(1, 5 * mm)]

    rows = [["#", "Requirement", "Status", "Conf.", "Reason / evidence"]]
    for i, r in enumerate(report.results.select_related("checklist_item", "overridden_by"), 1):
        reason = r.reason
        if r.evidence_snippet:
            reason += f"<br/><i>Evidence: {r.evidence_snippet[:180]}</i>"
        if r.override_remark:
            reason += f"<br/><b>Override by {r.overridden_by.username if r.overridden_by else 'reviewer'}:</b> {r.override_remark}"
        if r.fix_suggestion and r.status != "PASS":
            reason += f"<br/><font color='#1d4ed8'>Fix: {r.fix_suggestion}</font>"
        name = r.checklist_item.name + (" *" if r.checklist_item.is_mandatory else "")
        rows.append([str(i), Paragraph(name, small),
                     Paragraph(f'<font color="{STATUS_COLORS[r.status]}"><b>{r.status}</b></font>', small),
                     f"{int(r.confidence * 100)}%", Paragraph(reason, small)])
    tbl = Table(rows, colWidths=[8 * mm, 40 * mm, 18 * mm, 13 * mm, 103 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                             ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                             ("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")])]))
    story += [tbl, Spacer(1, 4 * mm), Paragraph("* mandatory requirement. Generated automatically; REVIEW items need manual verification.", small)]
    doc.build(story)
    return buf.getvalue()
