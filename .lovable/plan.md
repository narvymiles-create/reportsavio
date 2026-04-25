
# Report Card Management System — v1 Plan

Stack: React + Vite + Tailwind + shadcn (this project) + Lovable Cloud (Postgres, Auth, Storage, Edge Functions). Single role: **Admin** (does everything). PDFs are rendered server-side in an edge function.

## v1 scope (ship now)

1. Auth (email/password) + Admin-only route guard
2. School Info (singleton) — logo + contacts + motto
3. Classes & Streams (P1–P7, A/B/…); assign class teacher
4. Subjects per class (max marks, subject teacher)
5. Learners (manual add, photo upload)
6. Academic Terms (Term 1/2/3, year, dates)
7. Marks entry per learner per subject for the 3 exam stages
8. Grading system (configurable bands → grade + points + remark)
9. Comment templates (range → multiple comments, random pick)
10. Teachers (with view of all assignments, editable)
11. Signatures upload (per class for class teacher; one for head teacher)
12. Report card generation: single + bulk per class, PDF stored in DB, view/download/regenerate

**Deferred to v2:** CSV bulk learner import, in-browser signature drawing pad, multi-role permissions (Class/Subject/Head Teacher), bulk print queues for whole school, conduct/co-curricular structured fields beyond free text.

## Database schema (Postgres on Lovable Cloud)

- `profiles` (id → auth.users, full_name, email)
- `user_roles` (id, user_id, role enum `app_role` = `admin`) + `has_role()` security definer fn
- `school_info` (singleton row: name, location, po_box, tel, email, website, motto, logo_path)
- `classes` (id, name, class_teacher_id → teachers, class_signature_path)
- `streams` (id, class_id, name)
- `subjects` (id, class_id, code [ENG/MTC/SCI/SST/RE/ICT], name, max_marks, subject_teacher_id)
- `teachers` (id, full_name, role enum [class_teacher, head_teacher, subject_teacher], signature_path, initials)
- `head_teacher_signature` (singleton: teacher_id, signature_path)
- `learners` (id, full_name, class_id, stream_id, section, age, house, index_no, pay_code, photo_path)
- `terms` (id, name, year, start_date, end_date, next_begins_on, ends_on)
- `exam_stages` enum: `beginning`, `mid`, `end`
- `marks` (id, learner_id, subject_id, term_id, stage, marks numeric, unique(learner,subject,term,stage))
- `grading_system` (id, min_marks, max_marks, grade, points, remark)
- `division_rules` (id, min_aggregates, max_aggregates, division)
- `comment_templates` (id, scope enum [class_teacher, head_teacher], min_avg, max_avg, text)
- `report_cards` (id, learner_id, term_id, pdf_path, generated_at, snapshot_json)

RLS: all tables `admin` only via `has_role(auth.uid(),'admin')`. Storage buckets (public read for assets used in PDF): `school-assets`, `learner-photos`, `signatures`, `report-cards`.

## Automation logic (computed on demand in DB views / edge fn)

- **Total** = Σ marks (end-of-term table)
- **Average** = total / subject count
- **Grade per subject** = lookup in `grading_system`
- **Aggregates** = Σ grade points
- **Division** = lookup in `division_rules`
- **Position** = `RANK()` over total within `(class_id, term_id, stage)`
- **Auto comment** = random row from `comment_templates` matching scope + average band

## Edge functions

- `generate-report-card` — input `{learner_id, term_id}`. Fetches school info, learner, marks for all 3 stages, computes totals/avg/position/aggregates/division, picks random comments, renders an HTML template, converts to PDF using `npm:@sparticuz/chromium` + `npm:puppeteer-core` (or `npm:playwright-core` with chromium-min — I'll pick whichever works in the Deno edge runtime; fallback `npm:html-pdf-node` / `npm:pdf-lib` template if browser binaries are too heavy). Uploads to `report-cards` bucket, upserts `report_cards` row, returns signed URL.
- `generate-report-cards-bulk` — input `{class_id, term_id}`; loops learners, returns ZIP of PDFs (using `npm:jszip`) or array of URLs.

The HTML template mirrors the uploaded reference: header (logo left, school text center, photo right), title with term/year, learner detail box, three exam tables (Beginning/Mid/End — first two compact 6-subject grid; End table with Full Marks/Marks Got/Grade/Remarks/Initials), totals row (Total/Average/Position/Aggregates/Division), bottom section (conduct, co-curricular, comments + signatures, next term dates), footer grading-system table.

## Frontend structure

Routes (all behind admin guard except `/auth`):

- `/auth` — login/signup (first signup auto-promoted to admin if no admin exists)
- `/` — Dashboard (counts: learners, classes, terms, recent report cards)
- `/school` — School Info form
- `/classes` — list + create classes/streams; assign class teacher; upload class-teacher signature
- `/subjects` — per-class subjects CRUD
- `/teachers` — list, add, edit; detail page shows all assignments (classes where they're class teacher, subjects they teach) + signature
- `/learners` — list with filters (class/stream); add/edit; photo upload
- `/terms` — terms CRUD
- `/marks` — pick term + class + stage → grid editor (rows=learners, cols=subjects)
- `/grading` — grading bands + division rules
- `/comments` — comment templates CRUD (multi per range)
- `/signatures` — class-teacher signatures (per class) + head-teacher signature
- `/report-cards` — generate single (pick learner+term) / bulk (pick class+term); list, view PDF, download, regenerate

Shared: sidebar layout (shadcn `sidebar`), data tables, design-system tokens in `index.css` (semantic HSL — no hardcoded colors).

## Implementation phases (commits)

1. **Auth + roles + sidebar layout + School Info** (migrations: profiles, user_roles, has_role, school_info; storage bucket school-assets)
2. **Classes/Streams + Teachers + Subjects** (with assignment views)
3. **Learners + Terms + photo upload**
4. **Grading system + Division rules + Comment templates**
5. **Marks entry grid + computed views (totals/position)**
6. **Signatures (class + head teacher)**
7. **`generate-report-card` edge function + PDF template + single generation UI**
8. **Bulk generation + report cards library (view/download/regenerate)**

## Out-of-scope notes shown to user

- Stack is Postgres (not MySQL) and React/Vite (not Laravel/Express) — Lovable's runtime.
- Whole-school bulk print and CSV import land in v2 immediately after v1 verification.
- Roles beyond Admin can be added later by extending `app_role` enum + RLS policies; no rework needed.

Approve this plan and I'll start building Phase 1.
