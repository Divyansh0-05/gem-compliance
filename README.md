# GeM BidCheck: AI-Powered Integrated Bid Compliance Verification Platform

Document AI that checks GeM-style bid documents against a tender's compliance checklist and produces an evidence-backed compliance report.

- **Backend:** Django 5 + Django REST Framework + JWT (`backend/`)
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + Recharts (`frontend/`)
- **Document AI:** pdfplumber, Tesseract OCR (scanned PDFs / images), python-docx, rapidfuzz, optional Claude API for semantic checks

## How it works
1. A **Buyer** creates a tender and builds a checklist (GSTIN, PAN, Udyam, turnover threshold, bank-guarantee validity, keywords, signature/seal, AI semantic check...).
2. A **Bidder** uploads one document per checklist item.
3. The engine extracts text (OCR fallback for scans), runs one checker per item, and produces a weighted **score (0-100)**, a **verdict** (Compliant / Partially / Non-compliant), per-item **evidence**, **confidence** and a **"how to fix"** hint. Any failed *mandatory* item forces Non-compliant.
4. Buyers/Evaluators can **override** a result (remark required, audit-trailed), **accept/reject** the bid, and **download a PDF report**.

## Setup

### Prerequisites
- Python 3.11+ and Node 18+
- **Tesseract OCR** and **Poppler** (only needed for scanned PDFs / images; digital PDFs and DOCX work without them)
  - Ubuntu/Debian: `sudo apt install tesseract-ocr poppler-utils`
  - macOS: `brew install tesseract poppler`
  - Windows: install Tesseract from <https://github.com/UB-Mannheim/tesseract/wiki> and Poppler from <https://github.com/oschwartz10612/poppler-windows/releases>, then set in `backend/.env`:
    `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` and `POPPLER_PATH=C:\poppler\Library\bin`

### Backend (terminal 1)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # optional; add ANTHROPIC_API_KEY to enable AI checks
python manage.py migrate
python manage.py seed_demo                             # demo users, tender, checklist and sample PDFs
python manage.py runserver                             # http://localhost:8000
```

### Frontend (terminal 2)
```bash
cd frontend
npm install
cp .env.example .env
npm run dev                                            # http://localhost:5173
```

### Demo logins (created by `seed_demo`)
| Role | Username | Password |
|---|---|---|
| Buyer | `buyer` | `buyer123` |
| Evaluator | `evaluator` | `eval123` |
| Bidder | `bidder1` / `bidder2` | `bidder123` |

### Demo script (2 minutes)
1. Sign in as **bidder1** -> *Open Tenders* -> the laptop tender -> **Submit bid**.
2. Upload the 8 files in `sample_docs/compliant/` (one per box, in order). You get **97 / Compliant**. The 8th item (AI check) shows "Review" unless an API key is set.
3. Submit again with `sample_docs/non_compliant/`. You get **12 / Non-compliant** with the reason and a fix hint per item. Click **Download PDF**.
4. Sign in as **buyer** -> *Bids & Reports* -> open the failed bid -> **Override result** (add a remark) -> **Reject**.

### Tests
```bash
cd backend && python manage.py test        # 10 tests: checkers, scoring, full API flow
cd frontend && npm run build               # type-check + production build
```

## API (all under `/api/`, JWT bearer auth)
`POST auth/register | auth/login | auth/refresh`, `GET auth/me` · `tenders/` CRUD · `tenders/<id>/checklist/`, `checklist/<id>/` · `POST tenders/<id>/bids/` (multipart `file_<checklist_item_id>`) · `GET bids/`, `bids/<id>/`, `bids/<id>/report/`, `bids/<id>/report/pdf/` · `PATCH results/<id>/override/` · `POST bids/<id>/decision/` · `GET dashboard/stats/`

## Project structure
```
backend/
  config/         settings, urls
  accounts/       Profile(role), JWT auth, seed_demo command
  tenders/        Tender, ChecklistItem
  bids/           Bid, BidDocument, upload endpoint
  compliance/     engine.py (Document AI core), report/results, PDF export, sampledocs.py, tests.py
frontend/src/     api.ts, auth.tsx, components/, pages/
sample_docs/      compliant/ and non_compliant/ demo PDFs
docs/             screenshots and a sample exported report
```

## Check types
| Type | What it verifies |
|---|---|
| `DOC_PRESENT` | A readable document was uploaded |
| `KEYWORD` | All/any keywords present (fuzzy matching) |
| `REGEX` | GSTIN, PAN, Udyam, CIN, IFSC or a custom regex |
| `NUMERIC_THRESHOLD` | Amount (Rs./lakh/crore) is at least a minimum |
| `SIGNATURE_STAMP` | Signature / authorised signatory / seal indicators |
| `VALIDITY_DATE` | Latest validity date is on/after today and the bid end date |
| `AI_SEMANTIC` | Claude judges the document against the requirement (needs `ANTHROPIC_API_KEY`; otherwise flagged for manual review) |

## Assumptions
- Verification runs synchronously on submit (a Celery hook point is marked in `engine.run_compliance`).
- Scored items: Pass = full weight, Review = half, Fail = zero. Compliant needs score >= 85 with no failures.
- OCR'd documents that miss an ID pattern are marked *Review* instead of *Fail*, since the miss may be a scan-reading error.
- Anyone can self-register as Buyer or Bidder; Evaluator accounts are created via `seed_demo` / Django admin.
- Uploaded files are served from `/media/` without authentication in development.
