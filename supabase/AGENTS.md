# Backend rules

- Commercial billing lives in database functions (issuing, fulfilment, capacity) plus edge functions for IntesaPay and desktop licences; prices are computed server-side from shared modules, `billing_settings.enforcement_enabled` keeps existing schools unrestricted until switched on, and scenario checks in `scripts/billing-scenarios.sql` always roll back.
