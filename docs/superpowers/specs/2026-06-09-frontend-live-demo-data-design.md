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

Tiny wrapper over `localStorage` under the `pcl.` namespace.

API:

- `Store.list(type)` → array of records, newest first
- `Store.add(type, record)` → assigns `id` (timestamp + random suffix),
  `createdAt`, and `isNew: true`; persists; returns the saved record
- `Store.reset()` → removes all `pcl.*` keys

Records are plain objects whose shape depends on `type` (see forms below).
Storage key per type: `pcl.<type>` holding a JSON array.

### Admin modal (added to `admin.css` + `admin.js`)

A single reusable modal component:

- `openModal(title, formHTML, onSubmit)` helper in `admin.js`
- Overlay + centered card styling in `admin.css`, matching the existing admin
  visual language (tokens, card, btn styles already exist)
- Closes on overlay click, Esc, or Cancel

### Admin forms

Each "+ New …" button opens the modal with the relevant form. On submit:
`Store.add(type, data)` → toast confirmation → **prepend the new row into the
current admin table/list** so the admin sees it live → close modal.

Form fields per type:

- **Training**: title, format (e.g. "4-Day Intensive"), location, price (₦),
  seats, start date
- **Material**: title, type (PDF / Video / Slides), linked programme
- **Certificate**: participant name, programme, date issued
- **Announcement**: title, body

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

- New: `assets/js/store.js`
- Edit: `assets/css/admin.css` (modal), `assets/js/admin.js` (modal helper)
- Edit admin: `trainings.html`, `materials.html`, `certificates.html`,
  `feedback.html`, `settings.html`
- Edit portal: `index.html`, `trainings.html`, `materials.html`,
  `certificate.html`

## Out of scope

- Editing/deleting individual created items (create + reset only)
- Multiple participant accounts / targeting specific participants
- Cross-browser or cross-device sync (no backend)
