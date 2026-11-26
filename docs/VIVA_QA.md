# GeM BidCheck: 25 High-Frequency Viva Voce Questions & Answers

This document provides 25 essential questions and technical, grounded answers for project viva examinations and technical reviews, directly mapped to the **GeM BidCheck** codebase.

---

### Q1. What is the core problem that GeM BidCheck solves?
**Answer:** On public procurement portals like the Government e-Marketplace (GeM), vendors frequently face technical disqualification due to avoidable clerical errors in documentation (e.g., missing authorized signatory seals, minor typos in statutory IDs, expired certificates, or turnover slightly below tender criteria). GeM BidCheck automates multi-document compliance verification against tender checklists before or during technical evaluation, providing evidence-backed scores, verdicts, and remediation hints to prevent unfair rejections and save weeks of manual scrutiny.

---

### Q2. What is the high-level technical stack of the project?
**Answer:**
- **Backend:** Python 3.11, Django 5.2, Django REST Framework (DRF), and `djangorestframework-simplejwt`.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide icons, and Recharts.
- **Document AI & Processing:** `pdfplumber` (digital PDF extraction), `pdf2image` and `pytesseract` (OCR fallback), `python-docx` (Word documents), `Pillow` (image handling), `rapidfuzz` (fuzzy matching), and ReportLab (PDF generation).
- **AI Verification:** Anthropic Claude Python SDK for semantic evaluation.
- **Database:** SQLite (development / demonstration) or PostgreSQL (production).

---

### Q3. Why did you choose JWT (JSON Web Tokens) for authentication rather than traditional Django session cookies?
**Answer:** In `config/settings.py` and `accounts/`, the platform uses `djangorestframework-simplejwt`. JWT provides stateless authentication ideal for modern Single Page Applications (SPAs) like React. The backend does not need to store session states in database tables or memory caches on every request. Tokens carry user identity and roles in signed claims, allowing the frontend to easily verify authorization on the client side while enabling seamless horizontal API scaling.

---

### Q4. What roles exist in the system, and how are permissions enforced?
**Answer:** There are three roles defined in `accounts.models.Profile.Role`:
1. **BUYER / Admin:** Creates tenders, builds checklists, reviews bids, overrides results, and issues accept/reject decisions.
2. **BIDDER:** Views open tenders and uploads bid document sets.
3. **EVALUATOR:** Performs technical verification, inspects evidence, and enters audited manual overrides.
Permissions are enforced at the API level using DRF permission classes (`IsAuthenticated`, custom role permissions) and reflected dynamically in the React frontend navigation.

---

### Q5. How does the document text extraction pipeline work in `compliance/engine.py`?
**Answer:** The function `extract_text(path)` inspects file extensions:
- For `.docx`, it extracts body paragraphs and table cells via `python-docx`.
- For `.png`, `.jpg`, `.jpeg`, it directly runs Tesseract OCR.
- For `.pdf`, it first attempts native digital extraction via `pdfplumber`. If the extracted text has an average character density under 50 characters per page (indicating a scanned or image-only PDF), it automatically triggers OCR fallback via `_extract_pdf`.

---

### Q6. How does the OCR fallback determine when a PDF is a scan?
**Answer:** In `_extract_pdf(path)` in `backend/compliance/engine.py`:
```python
if pages and len(text) < 50 * pages:  # scanned / image-only -> OCR fallback
```
If the total text extracted digitally is less than 50 characters per page, the document is categorized as an image-only scan. The system invokes `pdf2image.convert_from_path(path, dpi=200)` and feeds the rendered raster images into `pytesseract.image_to_string()`. If the OCR output produces more text than the digital extraction, the OCR text is adopted and flagged with `ocr_used = True`.

---

### Q7. Why does the regex checker return `REVIEW` instead of `FAIL` for scanned documents?
**Answer:** Tesseract OCR frequently misreads visually ambiguous characters on scanned, low-contrast, or skewed documents (e.g., confusing "0" and "O", "1" and "I", or "8" and "B"). In `check_regex()`:
```python
if ctx.get("ocr_used"):
    return REVIEW, 0.5, "", f"No valid {label} found, but this is a scanned document (OCR)... verify manually."
```
Failing a bidder outright due to OCR noise would be unfair. Returning `REVIEW` flags the document for human verification without zeroing out the score or triggering an immediate mandatory failure.

---

### Q8. What are the 7 check types supported by the verification engine?
**Answer:** Defined in `ChecklistItem.CheckType`:
1. `DOC_PRESENT`: Verifies a readable document was provided (text $\ge 20$ chars).
2. `KEYWORD`: Fuzzy keyword alignment across required phrases using `rapidfuzz`.
3. `REGEX`: Statutory pattern checking for GSTIN, PAN, Udyam, CIN, and IFSC.
4. `NUMERIC_THRESHOLD`: Monetary threshold validation supporting Lakhs and Crores.
5. `SIGNATURE_STAMP`: Detection of signature/seal indicators and visual page elements.
6. `VALIDITY_DATE`: Multi-format date extraction ensuring validity extends past the tender end date.
7. `AI_SEMANTIC`: LLM-based verification of narrative technical clauses using Claude.

---

### Q9. How does the `NUMERIC_THRESHOLD` checker handle Indian monetary formats?
**Answer:** The helper `find_amounts(text)` in `engine.py` uses regular expressions to match numbers prefixed by `₹`, `Rs.`, or `INR` and factors in Indian numbering denomination multipliers:
```python
UNITS = {"crore": 1e7, "crores": 1e7, "cr": 1e7, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5}
```
If a turnover document specifies `"Rs. 12.5 Crores"`, it parses the numeric part `12.5` and scales it by $10^7$ to `125,000,000.0`, comparing it against the checklist's `min_value`.

---

### Q10. How does the `VALIDITY_DATE` checker verify if a certificate is valid?
**Answer:** In `check_validity()`:
1. It scans lines containing validity keywords (`valid`, `expiry`, `expires`, `till`, `upto`).
2. It parses dates using regular expressions for `dd/mm/yyyy`, `yyyy-mm-dd`, and text variations like `"15 March 2027"`.
3. It determines the minimum required validity threshold: $\max(\text{today}, \text{tender.bid\_end\_date})$.
4. If the latest validity date found is equal to or later than this threshold, it returns `PASS`; if earlier, it returns `FAIL`. If no dates are found, it returns `REVIEW`.

---

### Q11. How does the `KEYWORD` checker tolerate spelling variations or noisy OCR?
**Answer:** Rather than simple exact string containment (`kw in text`), `check_keyword()` leverages `rapidfuzz.fuzz.partial_ratio_alignment(kw.lower(), text.lower())`. If the alignment score is $\ge 88\%$, the keyword is treated as present and its location is captured for the evidence snippet. This tolerates minor character substitutions common in scanned documents.

---

### Q12. How does the `AI_SEMANTIC` checker work, and how does it degrade if no API key is present?
**Answer:** In `check_ai()`:
- If `settings.ANTHROPIC_API_KEY` is present, it constructs a prompt containing the requirement description and the first 6,000 characters of the document text, asking Claude to respond with strict JSON: `{"status": "PASS|FAIL|REVIEW", "confidence": float, "evidence": "...", "reason": "..."}`.
- If `ANTHROPIC_API_KEY` is unset or an API error occurs, the function gracefully returns:
  `REVIEW, 0.3, "", "AI check unavailable (no ANTHROPIC_API_KEY configured); manual review needed."`
  The application never crashes, and offline operations remain fully functional.

---

### Q13. How is the overall compliance score calculated?
**Answer:** In `recompute_report()`:
Each checklist item has a user-defined weight $w_i$. Multipliers are assigned based on status:
- `PASS` = $1.0$ (full weight)
- `REVIEW` = $0.5$ (half weight)
- `FAIL` = $0.0$ (zero points)

The score is:
$$\text{Score} = \text{round}\left(100 \times \frac{\sum (w_i \times \text{multiplier}_i)}{\sum w_i}, 1\right)$$

---

### Q14. What are the exact verdict rules for COMPLIANT, PARTIALLY_COMPLIANT, and NON_COMPLIANT?
**Answer:** In `engine.recompute_report()`:
1. **Mandatory Failure Gate:** If any item with `is_mandatory=True` receives `FAIL`, the overall verdict is immediately forced to **`NON_COMPLIANT`**, regardless of total score.
2. **`COMPLIANT`:** Requires $\text{Score} \ge 85$ **AND** zero failed items ($\text{n\_fail} == 0$).
3. **`PARTIALLY_COMPLIANT`:** When no mandatory items fail and $50 \le \text{Score} < 85$.
4. **`NON_COMPLIANT`:** Any bid with $\text{Score} < 50$ or with mandatory item failures.

---

### Q15. How does the platform audit manual overrides by Buyers or Evaluators?
**Answer:** The `ComplianceResult` model includes dedicated audit columns:
- `original_status`: Stores the automated engine's original verdict before override.
- `overridden_by`: Foreign key pointing to the `User` who performed the override.
- `override_remark`: Mandatory text field documenting the justification.
When `PATCH /api/results/<id>/override/` is called, the system records these audit fields and immediately invokes `recompute_report(report)` to update the overall score and verdict dynamically.

---

### Q16. How is the downloadable PDF report generated in `compliance/pdf_report.py`?
**Answer:** It uses the `reportlab` library:
- A `SimpleDocTemplate` creates a structured PDF canvas.
- A custom `NumberedCanvas` prints dynamic footers ("Page X of Y") and timestamps.
- A summary banner displays the tender details, overall score, and verdict color-coded (Green for Compliant, Red for Non-compliant).
- A detailed ReportLab `Table` lists every requirement, check type, status, evidence quote, and fix hints with automated text wrapping.
- The compiled bytes are returned as a `FileResponse` with MIME type `application/pdf`.

---

### Q17. How does the system handle "how-to-fix" remediation hints for bidders?
**Answer:** The function `build_fix(item, status, has_doc)` generates targeted advice based on why an item didn't pass:
- If missing a document: *"Upload '{name}' as a clear PDF, DOCX, PNG or JPG."*
- If regex failed: *"Ensure the document shows a valid {pattern}; check for typos."*
- If numeric threshold failed: *"The document must state an amount of at least Rs. {min_value}."*
- If signature missing: *"Sign the document by the authorised signatory and add the company seal/stamp before uploading."*
These hints appear directly in the bidder's verification report.

---

### Q18. How would you scale the verification engine to handle thousands of concurrent bid submissions?
**Answer:** Currently, `run_compliance(bid)` executes synchronously during the upload request. To scale for enterprise loads:
1. Wrap `run_compliance` in a **Celery** asynchronous task (`run_compliance.delay(bid.id)`).
2. Use **Redis** or **RabbitMQ** as a message broker.
3. Upon upload, immediately return `202 Accepted` with bid status `PROCESSING`.
4. Run OCR and LLM evaluations across a cluster of background worker nodes.
5. In the frontend, either poll `GET /api/bids/<id>/report/` or establish a **WebSocket** (using Django Channels) to stream live progress indicators.

---

### Q19. What database is used, and how would you configure it for production?
**Answer:** Development uses SQLite (`db.sqlite3`) for zero-configuration local runs. For production:
1. Switch to **PostgreSQL** in `config/settings.py` via `django.db.backends.postgresql` and `psycopg2-binary`.
2. Offload media file storage from local filesystem (`/media/`) to an object storage service like **AWS S3** or **Google Cloud Storage** using `django-storages`.
3. Implement connection pooling (e.g., PgBouncer) and read replicas.

---

### Q20. How is CORS (Cross-Origin Resource Sharing) handled between frontend and backend?
**Answer:** The backend uses the `django-cors-headers` middleware (`corsheaders.middleware.CorsMiddleware`). Allowed origins are configured in `config/settings.py` via `CORS_ALLOWED_ORIGINS` which reads from the environment (defaulting to `http://localhost:5173` and `http://127.0.0.1:5173` for Vite). This allows the React browser application to make credentials-backed cross-origin REST requests to Django on port 8000.

---

### Q21. How do you prevent malicious file uploads or security vulnerabilities in uploaded files?
**Answer:**
1. **Filename Sanitization:** `bid_upload_path` in `bids/models.py` uses `os.path.basename()` to eliminate directory traversal attacks (`../`).
2. **Isolated Storage Paths:** Files are segregated by tender and bid ID: `bids/<tender_id>/<bid_id>/<filename>`.
3. **MIME/Extension Validation:** Text extractors restrict processing to safe parsers (`pdfplumber`, `python-docx`, `PIL`), ignoring executable extensions.
4. **Production Safeguards:** In production, media directories are configured without script execution permissions (`noexec`), or stored on separate S3 buckets with unauthenticated public access disabled.

---

### Q22. How are the automated backend tests structured in `compliance/tests.py`?
**Answer:** The test suite uses Django's `TestCase` and DRF's `APITestCase`:
- Unit tests test individual checkers (`check_doc_present`, `check_regex`, `check_numeric`, `check_signature`, `check_validity`) in isolation with mock text inputs.
- Integration tests test `recompute_report` ensuring weight formulas and mandatory-failure constraints hold true.
- API tests verify the full HTTP lifecycle: user registration, tender creation, bid multipart file upload, report generation, and override endpoints.

---

### Q23. What were the results of the end-to-end demo test with compliant and non-compliant sample documents?
**Answer:**
- **Compliant Dataset (`sample_docs/compliant/`):** Produced an overall score of **97 / Compliant**. All 7 deterministic checks passed; the AI check defaulted cleanly to Review in fallback mode.
- **Non-Compliant Dataset (`sample_docs/non_compliant/`):** Produced an overall score of **12 / Non-compliant**. All mandatory items failed with explicit error diagnostics and remediation suggestions.

---

### Q24. How does the frontend handle responsive layouts, loading states, and notifications?
**Answer:**
- **Responsiveness:** Built with Tailwind CSS utility classes using mobile-first grid and flex layouts.
- **Loading States:** Implements skeleton loaders (`components/Skeleton.tsx`) across dashboards, tender cards, and report screens during asynchronous API fetches.
- **Notifications:** Integrated toast notification system (`components/Toast.tsx`) alerting users to upload progress, authentication errors, and successful manual overrides.

---

### Q25. If an applicant uploads a multi-page document where the relevant certificate is on page 4, how does the engine locate it?
**Answer:**
- `pdfplumber` iterates over every page in `pdf.pages` and aggregates text with newline separators into a unified string.
- If OCR fallback is triggered, `pdf2image` converts every page into an image and OCRs them sequentially.
- The checkers (`find_amounts`, `find_dates`, regex searches, and keyword fuzzy alignment) search the entire aggregate text across all pages.
- When a match is found, `snippet()` calculates the character offsets in the aggregated text and extracts the surrounding sentence/paragraph as the evidence quote.