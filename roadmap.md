# Roadmap

- [ ] Apply exact Primary filing margins (18 mm left / 12 mm right) with uniform artwork scaling and unchanged A4 page count.
- [ ] Verify margin geometry, existing output tests and real-learner preview/download.

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
