"""Generates demo bid documents (1 compliant set, 1 non-compliant set) as simple PDFs."""
import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def make_pdf(path, title, lines):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    c = canvas.Canvas(path, pagesize=A4)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 790, title)
    c.setFont("Helvetica", 11)
    y = 755
    for line in lines:
        c.drawString(50, y, line)
        y -= 20
    c.save()


COMPLIANT = {
    "01_gst_certificate.pdf": ("GST Registration Certificate", [
        "Government of India - Goods and Services Tax", "Legal Name: Alpha Infra Pvt Ltd",
        "GSTIN: 03ABCDE1234F1Z5", "Registration Type: Regular", "Date of Registration: 01/04/2019"]),
    "02_pan_card.pdf": ("Permanent Account Number Card", [
        "Income Tax Department - Government of India", "Name: Alpha Infra Pvt Ltd", "PAN: ABCDE1234F"]),
    "03_udyam_certificate.pdf": ("Udyam Registration Certificate", [
        "Ministry of Micro, Small and Medium Enterprises", "Udyam Registration Number: UDYAM-PB-08-0012345",
        "Enterprise: Alpha Infra Pvt Ltd", "Type of Enterprise: Small"]),
    "04_turnover_certificate.pdf": ("Annual Turnover Certificate", [
        "Certified by: Sharma & Associates, Chartered Accountants",
        "Annual turnover FY 2023-24: Rs. 2,10,00,000", "Annual turnover FY 2024-25: Rs. 2,50,00,000",
        "Average annual turnover exceeds Rs. 2 crore."]),
    "05_emd_proof.pdf": ("Earnest Money Deposit - Bank Guarantee", [
        "State Bank of India, Ludhiana Main Branch", "Bank Guarantee No: BG/2026/00451",
        "Amount: Rs. 1,00,000 (Rupees One Lakh only)", "This guarantee is valid up to 31/12/2028"]),
    "06_experience_certificate.pdf": ("Experience Certificate", [
        "Issued by: Punjab State Power Corporation Ltd",
        "Work Order No. PSPCL/2023/778 for supply of IT equipment",
        "The work was completed successfully and to our satisfaction.", "Value of work: Rs. 80,00,000"]),
    "07_signed_declaration.pdf": ("Declaration by Bidder", [
        "We declare that all information furnished in this bid is true and correct.",
        "We accept all terms and conditions of the tender.", "",
        "Digitally signed by Rajesh Kumar, Authorised Signatory", "Company Seal affixed. Date: 20/11/2026"]),
    "08_technical_compliance_sheet.pdf": ("Technical Compliance Sheet", [
        "Item: Laptop - 16 GB RAM, 512 GB SSD, Intel i5 or higher", "Offered: 16 GB RAM, 512 GB SSD, Intel i5-1335U - Complies",
        "Item: Network Switch - 24 port managed", "Offered: 24 port managed gigabit switch - Complies"]),
}

NON_COMPLIANT = {
    "01_gst_certificate.pdf": ("GST Registration Certificate", [
        "Government of India - Goods and Services Tax", "Legal Name: Alpha Infra Pvt Ltd",
        "GSTIN: 03ABCDE1234", "Registration Type: Regular"]),
    "02_pan_card.pdf": ("Permanent Account Number Card", [
        "Income Tax Department - Government of India", "Name: Alpha Infra Pvt Ltd", "PAN: ABCDE1234F"]),
    "03_udyam_certificate.pdf": ("Udyam Registration Certificate", [
        "Ministry of Micro, Small and Medium Enterprises", "Registration Number: PB-08-0012345 (pending)"]),
    "04_turnover_certificate.pdf": ("Annual Turnover Certificate", [
        "Certified by: Sharma & Associates, Chartered Accountants", "Annual turnover FY 2024-25: Rs. 12,00,000"]),
    "05_emd_proof.pdf": ("Earnest Money Deposit - Bank Guarantee", [
        "State Bank of India, Ludhiana Main Branch", "Amount: Rs. 1,00,000", "This guarantee is valid up to 15/03/2025"]),
    "06_experience_certificate.pdf": ("Experience Certificate", [
        "Issued by: Local Traders Association", "We know this company since 2020."]),
    "07_signed_declaration.pdf": ("Declaration by Bidder", [
        "We declare that all information furnished in this bid is true and correct.", "We accept all terms and conditions.",
        "Bidder PAN: WXYZP9999K"]),
}


def generate_sample_docs(base_dir):
    """Write both document sets under ``base_dir/compliant`` and ``base_dir/non_compliant``."""
    for folder, docs in (("compliant", COMPLIANT), ("non_compliant", NON_COMPLIANT)):
        for fname, (title, lines) in docs.items():
            make_pdf(os.path.join(base_dir, folder, fname), title, lines)
    return base_dir
