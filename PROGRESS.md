# PROGRESS (read this first, then continue from "Remaining")

Last updated: 2026-11-26. Project: GeM BidCheck (Django REST + React). See README.md for run commands.

## Done and verified
- Backend (Django 5, DRF, SimpleJWT): apps `accounts`, `tenders`, `bids`, `compliance`; roles BUYER / BIDDER / EVALUATOR; all endpoints in README; PDF report; `seed_demo`; sample PDFs.
- Verification engine `backend/compliance/engine.py`: text extraction (pdfplumber -> OCR fallback, DOCX, images), 7 checkers, weighted scoring, mandatory-fail rule, override recompute.
- Frontend (React 18 + Vite + TS + Tailwind): login/register, dashboard with charts, tenders list/form/detail, checklist builder modal, drag-drop bid upload with progress, bids list with filters, report page (gauge, verdict, expandable rows, evidence, fix hints), override modal, accept/reject, PDF download, toasts, skeletons, responsive layout.
- Verified: `python manage.py test` -> 10 passing; `npm run build` passes; real-browser run: bidder1 uploads compliant set -> 97 Compliant; non-compliant set -> 12 Non-compliant; PDF download works; buyer override + reject works.

## Remaining (see prompt.md for exact tasks)
- [ ] 1. Run on the student's own machine; fix only environment issues (Windows Tesseract/Poppler paths).
- [ ] 2. Submission docs: `docs/PROJECT_REPORT.md`, `docs/VIVA_QA.md`.
- [ ] 3. Cross-document consistency check (PAN inside GSTIN must match the PAN card).
- [ ] 4. Optional: test AI_SEMANTIC with a real API key; browser-test evaluator role + create/edit tender + checklist add/edit/delete via UI; code-split the frontend bundle.

## Known limitations
- Tesseract can misread characters in scanned IDs (e.g. "03" read as "0O83"); engine returns REVIEW (not FAIL) for OCR'd docs missing an ID pattern.
- AI_SEMANTIC only verified in fallback mode (no API key).
- Synchronous verification; SQLite; media served unauthenticated in dev.
