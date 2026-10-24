# Architecture rules

- Primary marksheet summary tables render in `MarksFormPage` from its existing grading bands and computed summary data; keep the 80/20 summary arrangement in shared screen/export/print CSS so layout changes do not alter calculations or PDF generation.

- Primary learner previews use PDF.js in `PrimaryPdfViewer` to read the existing download bytes; printing opens those exact bytes in a native Chrome PDF tab because iframe load events cannot establish native plugin print readiness.
- Primary PDF URL sessions outlive previews while native PDF tabs remain open; revoke only after the preview and all tracked tabs close to avoid interrupting printing.
- Bulk Primary printing copies and validates complete one-page A4 PDFs without transforming artwork; download geometry and grading remain authoritative.
- Legacy report CSS is retained only for the existing settings overlay illustrations; Nursery rendering and print styles remain independent and must not be changed for Primary fixes.