# Roadmap — pricing, payments & feature management

- [x] Pricing page: Online / Desktop Offline / Pay Per Report cards, termly/annual switch, selection, checkout
- [x] Permanent 10% Growth Allowance (no countdown), notices + upgrade offers
- [x] Unpaid preview watermark; Download/Bulk Download/Print/Bulk Print locked and redirected to pricing with selection kept
- [x] Smart recommendation (termly vs annual vs UGX 500 per card)
- [x] Lifetime licence unlocks output; prepaid packs 20/50/100/200
- [x] Feature Management (global + per school, enforced in database)
- [x] School Billing Dashboard updates
- [ ] Switch the locks on (Platform Billing → Settings) — waits on IntesaPay credentials and published term dates
- [ ] Real TEST payments — waits on IntesaPay API key, account ID and webhook secret

# Roadmap — manual payments & activation keys (Nov 2026)

- [ ] Manual order: choose package → unique reference, amount, pay to 0705466283, WhatsApp Skavio, upload proof + transaction ID in app
- [ ] System Admin → Payments & Activation Keys: review proof, approve/reject, single-use key, send by WhatsApp, reissue/revoke
- [ ] School Activate Package page: key validated in the database, bound to school/payment/package, throttled, audit logged
- [ ] Locks always on for every school (no admin off switch); old unpaid "legacy" cards no longer count as paid
- [ ] Every preview with learner data watermarked unless entitled; Open PDF/Download/Print visibly locked → pricing/activation
- [ ] Unpaid previews never keep an unwatermarked copy; stored report files readable only by entitled schools
- [ ] Tests + end-to-end check including bypass attempts
