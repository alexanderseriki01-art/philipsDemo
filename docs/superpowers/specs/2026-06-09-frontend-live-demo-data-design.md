# Frontend-only "live" demo data — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Problem

The Phillips Consulting TMS demo is entirely static HTML. The admin "+ New …"
buttons only fire a toast, and the participant portal shows hardcoded rows.
For the demo we want the admin to be able to **create** content that then
**appears in the participant portal** — with **no backend**. Everything runs
client-side in the browser.

## Approach

A single shared data layer over `localStorage`. Admin pages **write**, portal
pages **read**. Admin and portal are the same origin, so data persists and is
shared across pages within one browser.

```
Admin form → Store.add(type, record) → localStorage → Portal reads on load → renders at top
```

### Scope (wired up)

All four create→show flows:

- `trainings` — Admin creates a programme → appears in My Trainings + dashboard
- `materials` — Admin adds a material → appears in portal Materials
- `certificates` — Admin issues a certificate → appears in portal Certificates
- `announcements` — Admin posts an announcement → appears on portal dashboard

### Seed-data behaviour

**Add on top (keep mockups).** The existing rich static rows remain as a
realistic baseline. Admin-created items are rendered dynamically and
**prepended** above the static content, each marked with a green **"New"**
badge. The portal always looks populated.

## Components

### `assets/js/store.js` (new)

Tiny wrapper over `localStorage` under the `pcl.` namespace, with an in-memory
fallback if `localStorage` is unavailable.

**Add mode** (new records):

- `Store.list(type)` → array of records, newest first
- `Store.add(type, record)` → assigns `id` (timestamp + random suffix),
  `createdAt`, and `isNew: true`; persists; returns the saved record
- Key: `pcl.<type>` holding a JSON array.

**Override/patch mode** (status changes on existing *static* rows):

- `Store.patch(entity, id, patch)` → merges `patch` into an overrides map keyed
  by the row's stable `data-id` (e.g. email or slug)
- `Store.overrides(entity)` → the overrides map for that entity
- Key: `pcl.overrides.<entity>` holding a JSON object `{ id: {...patch} }`
- On load, each page re-applies overrides to its static rows (e.g. swap the
  status tag). This is what makes reactivate / KYC / revoke work on seeded
  people and certificates without converting every mockup to data.

**Reset:**

- `Store.reset()` → removes all `pcl.*` keys (added items + overrides)

Add-types: `trainings`, `materials`, `certificates`, `announcements`,
`participants`. Override-entities: `participants`, `certificates` (extendable).

### `assets/js/filter.js` (new)

Generic filter helper. Given a `.filter-bar` and a target table/list, shows or
hides rows by a `data-status` / `data-category` attribute matching the active
chip's `data-filter`. Replaces the current toast-only chip behaviour across all
pages. Existing static rows get `data-status` attributes added.

### Vendored QR (`assets/js/vendor/qrcode.min.js`, new)

A tiny MIT pure-JS QR generator (no deps, no network) used to render a real,
scannable class check-in QR code into a canvas inside a modal.

### Admin modal (added to `admin.css` + `admin.js`)

A single reusable modal component:

- `openModal(title, formHTML, onSubmit)` helper in `admin.js`
- Overlay + centered card styling in `admin.css`, matching the existing admin
  visual language (tokens, card, btn styles already exist)
- Closes on overlay click, Esc, or Cancel

### Admin auth fix (Overview bug)

`admin/index.html` currently always renders the login screen and only reveals
the dashboard after the form submits, so navigating back to Overview from any
other admin page re-shows login. Fix:

- On successful login, set `sessionStorage['pcl.adminAuth'] = '1'`.
- On `index.html` load, if the flag is set, skip the login screen and show the
  dashboard directly (run the chart/counter animations immediately).
- "Sign out" / "Back to site" links clear the flag.

### Admin features

Each action is frontend-only and persists through the store.

- **New Training / Material / Certificate / Announcement**: "+ New …" opens the
  modal; on submit `Store.add(type, data)` → toast → **prepend the new row into
  the current admin table/list** → close modal.
- **View participant (detailed)**: "View" opens a detail modal — name, org,
  email, programmes, KYC/status, recent activity — built from the row's data
  attributes plus any store override.
- **Reactivate account**: `Store.patch('participants', id, {status:'Active'})`;
  row + any open detail update live.
- **Request KYC**: `Store.patch('participants', id, {status:'KYC Requested'})`.
- **Invite participant via email**: modal collects name/email/org → adds a
  `participants` record with `status:'Pending (Invited)'` (prepended into the
  directory) and opens a prefilled `mailto:` draft.
- **Class QR code**: button opens a modal rendering a real QR (vendored lib)
  encoding a check-in URL such as `…/verify/?class=<id>`.
- **Upload materials**: modal with `<input type="file">` browse; on submit store
  filename/type/size (+ a data-URL for small files, ≲1 MB, so it stays openable
  after reload) as a `materials` record.
- **Issue / revoke certificate**: issue → `Store.add('certificates', …)`;
  revoke → `Store.patch('certificates', id, {status:'Revoked'})`.
- **Reply feedback**: reply modal appends a persisted reply under the feedback
  item.

Form fields per add-type:

- **Training**: title, format (e.g. "4-Day Intensive"), location, price (₦),
  seats, start date
- **Material**: title, type (PDF / Video / Slides), linked programme, file
- **Certificate**: participant name, programme, date issued
- **Announcement**: title, body
- **Invite**: name, email, organisation

### Reports

Live charts render on load; filter chips / date-range controls re-draw them;
**Export** buttons generate and download a real `.csv` client-side (Blob +
object URL) from the visible data.

### Portal rendering

On load, each relevant portal page calls `Store.list(type)` and prepends
admin-created items above the existing static markup, reusing the existing
markup patterns (`.card`, `.training-item`, table rows, etc.) so they look
native. Each injected item carries a `tag tag-success` style **"New"** badge.

- `portal/trainings.html` → trainings list
- `portal/materials.html` → materials list
- `portal/certificate.html` → certificates list
- `portal/index.html` (dashboard) → latest announcement + newest training

## Data flow

1. Presenter opens an admin page, clicks "+ New …", fills the form, submits.
2. `Store.add` writes the record to `localStorage`.
3. Admin table updates immediately (prepended row).
4. Presenter switches to the portal (same browser); the page reads
   `Store.list` on load and shows the new item at the top with a "New" badge.

## Assumptions

- **One demo participant** (Adaeze Okonkwo). Admin-created items target
  "everyone," i.e. they appear for her.
- **"Reset demo data"** button on admin Settings calls `Store.reset()` for a
  clean slate between demo runs.
- **Same-browser constraint**: `localStorage` is per-browser/origin, so admin
  and portal must be viewed in the same browser. Acceptable for a demo; the
  presenter should know this.

## Error handling

- `Store` guards against malformed/absent JSON (returns `[]` on parse failure).
- Forms require the key fields (title/name) before submit; empty optional
  fields render sensible fallbacks.
- If `localStorage` is unavailable (private mode edge case), `Store` degrades
  to an in-memory array for the session and the app still functions.

## Files touched

- New: `assets/js/store.js`, `assets/js/filter.js`,
  `assets/js/vendor/qrcode.min.js`
- Edit: `assets/css/admin.css` (modal + detail styles), `assets/js/admin.js`
  (modal helper, auth persistence)
- Edit admin: `index.html`, `participants.html`, `trainings.html`,
  `materials.html`, `certificates.html`, `feedback.html`, `reports.html`,
  `settings.html`, and `attendance.html` / `payments.html` / `refunds.html`
  (filters)
- Edit portal: `index.html`, `trainings.html`, `materials.html`,
  `certificate.html`

## Out of scope

- Editing/deleting individual created items (create + reset only; certificates
  can be revoked)
- Multiple participant accounts / targeting specific participants
- Cross-browser or cross-device sync (no backend); object-URL/data-URL file
  previews are best-effort within storage limits
- Real email delivery (invite uses a `mailto:` draft)
