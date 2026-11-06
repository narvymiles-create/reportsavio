# Roadmap

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
- [ ] Verify Chrome's native print dialog and physical output — blocked: automated headless Chrome does not expose the native PDF print dialog; the user confirmed downloaded PDFs print correctly there.

## Report card template upload + manual field mapping
- [x] Database: report_templates, template_field_mappings, template_custom_fields, custom_field_values tables + report-templates storage bucket, school-scoped RLS, one active template per level.
- [x] Template Management page: upload (Nursery/Primary only), preview, activate/deactivate, replace, delete with confirmation; defaults remain when no active custom template.
- [x] Mapping editor: click on the actual uploaded PDF preview to place fields; field panel with mapped/unmapped state; custom fields (text/number/date/percentage/multiline, school-wide or learner-specific).
- [x] Custom field values: school-wide central values; learner-specific per learner+term.
- [x] Generation: active custom template renders via the pdf-lib template engine for Preview, Download and Print; fallback to existing default report cards; Nursery never uses Primary templates and vice versa.
- [x] Tests + AGENTS.md rule. Verified in browser: upload, click-to-map, custom field creation, activation, real-learner report rendered on the custom template, and default fallback after deletion (sample template removed).

## View the default report card templates
- [x] Add View to the default Nursery and Primary template cards; preview the built-in design from the same PDF bytes it downloads as.
- [x] Test preview target selection: current term wins over newer terms, fullest learner wins, empty states return null; 7 new tests, 40 total pass.
- [x] Verify in the browser: Primary dialog renders one A4 page for ALEDY ATER BULLEN · Term 2 with a working Download PDF button; Nursery dialog renders for a temporary learner then that learner is removed (0 rows left).
