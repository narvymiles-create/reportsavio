# Backend rules

- Commercial billing lives in database functions (issuing, fulfilment, capacity) plus edge functions for IntesaPay and desktop licences; prices are computed server-side from shared modules, `billing_settings.enforcement_enabled` keeps existing schools unrestricted until switched on, and scenario checks in `scripts/billing-scenarios.sql` always roll back.
- Report generation and preview never bill; `billing_unlock_report_output` is the single download/print gate (feature switches, then `billing__issue`), so Learners are charged once per unique card on first output and active desktop licences count as paid.
- Feature switches live in `platform_features` (global) and `school_feature_overrides` (school wins); `feature_guard` triggers refuse writes for switched-off features without touching existing rows, and skip calls without a signed-in user (background jobs).
