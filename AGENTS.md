# Architecture rules

- Primary learner previews and printing use `PrimaryPdfViewer` and `generatePrimaryOutput`, sourced from the existing download generator; native PDF viewing/printing prevents HTML pagination drift and blank pages.
- Bulk Primary printing copies and validates complete one-page A4 PDFs without transforming artwork; download geometry and grading remain authoritative.
- Legacy report CSS is retained only for the existing settings overlay illustrations; Nursery rendering and print styles remain independent and must not be changed for Primary fixes.