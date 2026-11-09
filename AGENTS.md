# Architecture rules

- Optional school templates use private report-templates storage and atomic school/level selection; active alternatives share PDF bytes across preview/print/download while defaults retain their existing renderers. Custom fields use independent level-scoped definitions and contextual values with validated associations; archive definitions and cascade only associations on template removal to retain historical values. Supported AcroForm fields preserve their fonts; static placements use top-left PDF-point rectangles and fit text without erasing or reflowing artwork.
- Template management remounts its form/list on school or sidebar-level changes; uploads use a server-validated current-level RPC and immutable school/level/file scope. Default previews call the existing default renderers directly, bypassing active alternatives.

- Academic years are school-scoped independent settings; database triggers project the current year onto the compatibility `terms.year` field so every existing selector and report renderer uses it without changing report artwork or marks identities. Current-year switches are atomic and admin-authorized.

- Primary marksheet summary tables render in `MarksFormPage` from its existing grading bands and computed summary data; keep the 80/20 summary arrangement in shared screen/export/print CSS so layout changes do not alter calculations or report-card PDF generation.
- Primary marksheet print and PDF use the same measured static page DOM from `marksheetOutput`; reserve configured scale/footer height on every page and keep both summaries together on the final page to avoid canvas slicing through learner rows.
- Mount the Primary marksheet's landscape print-page rule with the sheet, after globally imported report styles, and hide sidebar spacer ancestors only when a marksheet is present; this avoids portrait page-rule collisions without changing Nursery or report print styles.

- Primary learner previews use PDF.js in `PrimaryPdfViewer` to read the existing download bytes; printing opens those exact bytes in a native Chrome PDF tab because iframe load events cannot establish native plugin print readiness.
- Primary PDF URL sessions outlive previews while native PDF tabs remain open; revoke only after the preview and all tracked tabs close to avoid interrupting printing.
- Bulk Primary printing copies and validates complete one-page A4 PDFs without transforming artwork; download geometry and grading remain authoritative.
- Legacy report CSS is retained only for the existing settings overlay illustrations; Nursery rendering and print styles remain independent and must not be changed for Primary fixes.