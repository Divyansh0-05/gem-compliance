# Handoff: finish the GeM Bid Compliance Verification Platform

You are continuing a project that is **already built and working**. Do NOT rebuild or restructure anything. Your job is the small list of remaining tasks below.

**Quota is limited: be efficient.** Read `PROGRESS.md` and `README.md` first (do not read the whole codebase). Edit only the files a task needs, write each file fully in one go, and don't re-run installs or tests repeatedly. After each task, tick it in `PROGRESS.md`. If you run low, stop cleanly after finishing the current task. Never leave the app broken. Do not ask questions; make sensible assumptions.

## Project in one paragraph
Django 5 + DRF + JWT backend (`backend/`) and React 18 + Vite + TypeScript + Tailwind frontend (`frontend/`). Buyers create tenders and a compliance checklist; bidders upload one document per item; `backend/compliance/engine.py` extracts text (pdfplumber, Tesseract OCR fallback), runs one checker per item (DOC_PRESENT, KEYWORD, REGEX, NUMERIC_THRESHOLD, SIGNATURE_STAMP, VALIDITY_DATE, AI_SEMANTIC), and produces a weighted score, a verdict, evidence, confidence and fix hints. Buyers can override results, accept/reject bids and download a PDF report.

## What is DONE (already verified, do not redo)
- Full backend: models, JWT auth with 3 roles, all REST endpoints (listed in README), verification engine, scoring, PDF export, `seed_demo` command, sample PDFs in `sample_docs/`, 10 passing tests (`python manage.py test`).
- Full frontend: login/register, dashboard with charts, tenders list/form/detail with checklist builder, drag-and-drop upload with progress, bids list with filters, polished report page, override modal, accept/reject, PDF download, toasts, skeletons, responsive layout. `npm run build` passes.
- Browser-tested end to end: compliant sample set scores **97 / Compliant**, non-compliant set scores **12 / Non-compliant**, PDF downloads, buyer override and reject work.

## What is REMAINING (do in this order)

### Task 1: Confirm it runs on this machine (must)
1. Follow the README setup for backend and frontend. Run `python manage.py migrate`, `python manage.py seed_demo`, `python manage.py test`, and `npm run build`.
2. Fix **only environment problems**. If on Windows and OCR fails, set `TESSERACT_CMD` and `POPPLER_PATH` in `backend/.env` (already supported in `config/settings.py`). Digital PDFs work without OCR tools.
3. Do not change application logic in this task.

### Task 2: Submission documents (must, this is for a college submission)
Create `docs/PROJECT_REPORT.md` and `docs/VIVA_QA.md`. Use the real code and the screenshots already in `docs/screenshots/` (reference them with relative image links).
- `PROJECT_REPORT.md` sections: Abstract; Problem statement (GeM bids rejected for avoidable document errors); Objectives; Scope; System architecture (include a Mermaid diagram: React -> Django REST -> Verification engine -> SQLite/media); Modules (accounts, tenders, bids, compliance, frontend); Database design (include a Mermaid ER diagram of User/Profile, Tender, ChecklistItem, Bid, BidDocument, ComplianceReport, ComplianceResult); The 7 check types and how each works; Scoring and verdict rules (Pass=full weight, Review=half, Fail=0; Compliant needs score >= 85 and no failures; any failed mandatory item forces Non-compliant); Document processing pipeline (pdfplumber -> OCR fallback); Technologies used; Testing (10 backend tests + the browser demo results above); Screenshots with captions; Limitations; Future scope; Conclusion.
- `VIVA_QA.md`: 25 likely viva questions with short, accurate answers grounded in this codebase (e.g. why JWT, how OCR fallback decides, how scoring works, how overrides are audited, why Review instead of Fail for OCR'd docs, how to scale with Celery, how AI_SEMANTIC degrades without an API key).

### Task 3: Cross-document consistency check (should; this is the "Integrated" part of the title)
Add a small rule-based cross-check that runs after the per-item checks in `engine.run_compliance`:
- Collect any GSTIN and PAN found across all of the bid's documents (reuse `PATTERNS`).
- Rule A: characters 3-12 of every GSTIN must equal every PAN found. Rule B: if two different PANs or two different GSTINs appear across documents, flag it.
- Store findings as a list of `{"rule", "message", "documents"}` in a new `consistency_findings = models.JSONField(default=list)` on `ComplianceReport` (add a migration), expose it in `ComplianceReportSerializer`, and show it in `frontend/src/pages/BidReport.tsx` as a "Cross-document consistency" card (green "All identifiers match" or amber list of mismatches) and in `compliance/pdf_report.py`.
- A mismatch must cap the verdict at `PARTIALLY_COMPLIANT` (never `COMPLIANT`) but must not change the score. Make sure `recompute_report` (used after overrides) keeps this behaviour.
- Add 3 tests in `compliance/tests.py` (match, PAN mismatch, no identifiers found) and confirm the existing 10 still pass. The sample compliant set must still score 97 / Compliant.
- Add a mismatching PAN to one document of `compliance/sampledocs.py` `NON_COMPLIANT` only if it doesn't change that set's expected failures.

### Task 4: Optional polish (only if quota remains)
- Put a real `ANTHROPIC_API_KEY` in `backend/.env` and verify the `AI_SEMANTIC` item on the compliant set returns PASS/FAIL with a reason (it was only tested in fallback mode, which returns REVIEW).
- Browser-test with Playwright or manually: register a new user, create and edit a tender, add/edit/delete a checklist item through the modal, and the evaluator role (`evaluator` / `eval123`). Fix any bug found.
- Reduce the frontend bundle warning with `React.lazy` code-splitting for the page components in `App.tsx`.

## Rules
- Keep the API contract unchanged except for the `consistency_findings` field.
- No placeholders, TODO stubs or fake data. Every button must work.
- Keep `README.md` and `PROGRESS.md` accurate at the end (tick tasks, note anything left undone).
- Finish with a 5-line summary: what you changed, test results, anything still pending.
