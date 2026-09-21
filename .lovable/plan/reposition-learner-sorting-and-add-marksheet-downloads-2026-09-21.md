# Reposition learner sorting and add marksheet downloads

## Changes

1. **Reports page**
   - Move the existing **Sort learners** selector out of the Selection area.
   - Place it directly beside **Generate / Refresh All**.
   - Keep both existing choices and behavior: alphabetical, or position then alphabetical.

2. **Marks entry pages**
   - Move the existing **Sort learners** selector beside the print/download options, immediately after **Hide optional subjects with no marks**.
   - Ensure the selected order controls the on-screen marksheet, print output, PDF, and CSV.

3. **Marksheet downloads**
   - Add a **Download** menu to every marks entry page with:
     - **PDF** — download the currently displayed marksheet in A4 landscape, including its summaries and current hide/sort options.
     - **Excel CSV** — export the same displayed learners, visible subjects, marks, totals, averages, optional position, aggregates, and divisions in the selected order.
   - Use clear filenames containing the exam stage, class, stream, term, and year.
   - Disable download when no class or learners are selected, and show a clear error if export fails.

## Technical details

- Reuse the existing sort state and calculated marks data; no grading or position formulas will change.
- Use the installed PDF export library for the marksheet and the existing CSV library for Excel-compatible CSV output.
- Reuse the existing download helper and dropdown menu components.
- Add PDF-export-only styling so the downloaded file matches the established landscape print layout without changing normal printing.

## Verification

- Confirm the Reports sort selector appears next to **Generate / Refresh All**.
- Confirm the Marks sort selector appears after **Hide optional subjects with no marks** on BOT, MID, and EOT pages.
- Test alphabetical and position sorting in screen, print, PDF, and CSV outputs.
- Test PDF and CSV downloads with position shown/hidden and empty optional subjects shown/hidden.
