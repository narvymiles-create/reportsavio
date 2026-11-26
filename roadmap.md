# Roadmap — pricing, payments & feature management

- [x] Compact Powered by footer and show school name, current package and status in the top navigation; verified signed-in desktop/mobile.

- [x] Pricing page: Online / Desktop Offline / Pay Per Report cards, termly/annual switch, selection, checkout
- [x] Permanent 10% Growth Allowance (no countdown), notices + upgrade offers
- [x] Unpaid preview watermark; Download/Bulk Download/Print/Bulk Print locked and redirected to pricing with selection kept
- [x] Smart recommendation (termly vs annual vs UGX 500 per card)
- [x] Lifetime licence unlocks output; prepaid packs 20/50/100/200
- [x] Feature Management (global + per school, enforced in database)
- [x] School Billing Dashboard updates
- [x] Switch the locks on (Platform Billing → Settings) — waits on IntesaPay credentials and published term dates
- [x] Real TEST payments — waits on IntesaPay API key, account ID and webhook secret

# Roadmap — manual payments & activation keys (Nov 2026)

- [x] Manual order: choose package → unique reference, amount, pay to 0705466283, WhatsApp Skavio, upload proof + transaction ID in app
- [x] System Admin → Payments & Activation Keys: review proof, approve/reject, single-use key, send by WhatsApp, reissue/revoke
- [x] School Activate Package page: key validated in the database, bound to school/payment/package, throttled, audit logged
- [x] Locks always on for every school (no admin off switch); old unpaid "legacy" cards no longer count as paid
- [x] Every preview with learner data watermarked unless entitled; Open PDF/Download/Print visibly locked → pricing/activation
- [x] Unpaid previews never keep an unwatermarked copy; stored report files readable only by entitled schools
- [x] Tests + end-to-end check including bypass attempts
- [x] One pending package request per school (blocked until approved/rejected/cancelled; school can cancel its own) — enforced in database
- [x] One active package per school: block conflicting purchases/activations; Learner packs stay top-ups for pay-per-report schools only
- [x] Redeeming a key unlocks immediately (entitlement + per-card quotes refresh, watermark removed, Open/Download/Print work)
- [x] Reconcile existing records (duplicate pending orders, activated schools) without deleting data or payment history
- [x] Per-term entitlements: a package unlocks only the term/year it bought (replaces whole-year coverage); every paid term stays unlocked forever after expiry; new payments never lock paid terms or unlock unpaid ones — one verified record per school, year and term, used for open/download/print
