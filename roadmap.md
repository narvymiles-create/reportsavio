# Roadmap

- [x] Add real-learner pre-activation testing for both levels with matched/missing/unmatched checks, field corrections and saved required/optional choices.
- [x] Enforce current successful required-association verification before activation in the database; signed-in Primary/Nursery previews, missing-data warnings, optional blanks, required-field corrections, successful activation and stale-check rejection verified; 31 focused tests pass. Temporary uploads removed and original selection restored.

- [x] Expand local template uploads to PDF/scanned PDF/JPG/JPEG/PNG with fixed-PDF image conversion; preserve fields and defaults. User selected local-only handling, so DOC/DOCX must be exported to PDF before upload.
- [x] Fix school-scoped sidebar persistence, serialize switches and await saved level before uploads; normalize service errors and clean up failed registrations. Signed-in Primary PNG/Nursery JPG uploads, previews and deletion verified; 35 regression tests pass.

- [x] Add level-specific custom field definitions, typed school/learner/period values and simple template associations in Settings.
- [x] Enforce school/level/admin validation and retain values independently of template associations; signed-in cross-level attempts and invalid percentages rejected, removing associations retains saved values.
- [x] Populate uploaded templates through the shared PDF output; signed-in learner fillable and static-placement previews/downloads contain saved 95%, Nursery school-wide save verified, 31 focused tests pass. Temporary values/templates removed and test definitions archived; native physical print remains unavailable in headless Chrome.

- [x] Scope template upload and management to the sidebar level and school, with backend upload validation; fixed sidebar persistence for accounts with multiple school memberships.
- [x] Add default previews and retain uploaded previews; verified signed-in uploads for both levels, previews, cross-level rejection, list isolation and test cleanup. Twenty focused tests pass.

- [x] Add private school PDF template upload, preview, activation, deactivation and deletion for Primary/Nursery.
- [x] Select active alternatives consistently in preview, download and print; fill supported fields with actual data only and preserve default generation.
- [x] Verify signed-in upload/preview/activation/deactivation/deletion for both levels, real learner custom previews/downloads, and default restoration; focused report tests pass.

- [x] Separate Terms and Years settings and use the school's current year across system/report outputs.
- [x] Verify independent year switching with the signed-in account, matching term/report data and Primary report loader; restored the original current year and removed the temporary test year. Fourteen focused tests pass.

- [x] Add Hide remarks to Primary marksheet print/download options (existing Grading Scale remarks).
- [x] Share row-safe pagination between Primary marksheet print and PDF, repeating the grading scale and placing summaries only on the final page.
- [x] Test pagination rules: 20 tests pass; visually checked print and downloaded pages with 13/67 sample learners and the 63-row extra-summary-page case; corrected global print visibility conflicts.
- [ ] Verify Primary marksheet with existing learner records — blocked: the requesting account's available class has no learners; sample output verified without storing sample data.

- [x] Match Primary marksheet summaries to the reference using the configured grading scale; preserve calculations and other outputs.
- [x] Verify the updated summaries with 13 real learners on screen, print and download; both output files fit one A4 landscape page and 16 report regression tests pass.

- [x] Diagnose and fix Primary PDF loading, readiness and print URL lifetime without changing the download engine.
- [x] Verify Primary loading failures and print lifecycle with 16 regression tests and Chrome checks.

- [x] Move report sorting beside Generate / Refresh All.
- [x] Move marks-entry sorting after the optional-subject filter.
- [x] Add marksheet PDF and Excel CSV downloads.
- [x] Verify controls and downloads in the browser.
- [x] Unify Primary preview, single print and bulk print with the existing PDF download output.
- [x] Validate one A4 page per learner with six regression tests and isolated single/bulk viewer command checks.
- [x] Verify real learner single and bulk PDF previews, downloads and native tab opening: one A4 page for single, 24 A4 pages for 24 bulk learners, no runtime errors.
- [ ] Verify Chrome's native print dialog and physical output — blocked: automated headless Chrome does expose no native PDF print dialog; the user confirmed downloaded PDFs print correctly there.

- [x] Show learning-area comments in the configured blue on the Nursery report card across preview, print and download.
- [x] Verify the colour in the live preview and in a downloaded PDF from a real learner record; two regression tests added, 27 tests pass.

- [x] Uploaded templates: reuse default report data (marks, totals, divisions, comments, dates, teachers), image fields, stamp, watermark and an optional Settings border per level.
- [x] Settings previews show the active uploaded template; Fields Management follows the active template and is hidden for defaults.
- [x] Verify filled uploaded templates with real Primary and Nursery learners through pre-activation testing, including saved associations and Settings stamp/watermark; temporary uploads removed and defaults restored.
