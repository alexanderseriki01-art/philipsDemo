# Programmes and enrolments on the backend — Design

**Date:** 2026-08-21
**Status:** Approved, ready for an implementation plan
**Scope:** Pieces 1 and 2 of a five-part feature (see Decomposition)

## Problem

Training programmes live only in browser `localStorage`. Status is a label an
administrator picks by hand, so a cohort can read "Nearly Full" at 3 of 40
seats, and enrolment and revenue figures are static HTML that no action changes.

The intended model is the opposite. A lecturer confirms their cohort and logs
each participant onto it; enrolment, revenue and status are then consequences of
those actions rather than things anyone types. The admin console reports what
the lecturer recorded.

## Decomposition

This does not ship as one change. Each piece depends on the one before it.

| # | Piece | State |
| --- | --- | --- |
| 1 | Programmes as a backend resource | **This spec** |
| 2 | Enrolments | **This spec** |
| 3 | Lecturer accounts | Later, own spec |
| 4 | Lecturer portal | Later, own spec |
| 5 | Admin and portal read the API | Partly here (admin), portal read repointed |

Approach A was chosen: move programmes and enrolments server-side and leave the
rest of the demo alone. Materials, certificates and announcements stay in
`localStorage`. This is the smallest change that makes status and enrolment
genuinely true, and it avoids migrating the whole demo layer.

Rejected alternatives: keeping `localStorage` and adding the backend only for
lecturer-logged data (two sources of truth for one programme, and every screen
has to pick a winner); and migrating every entity server-side (a rewrite of the
demo layer, far beyond what status and enrolment need).

## Decisions

Each of these was settled before design and is recorded so the implementation
does not relitigate them.

**Status is hybrid.** The lecturer sets the lifecycle explicitly (confirm,
complete, cancel). The fill label is computed from enrolment and never chosen by
hand. A hand-picked "Nearly Full" is exactly the failure the current demo has.

**Enrolment accepts both existing and new people.** The lecturer usually picks
from participants who have registered, but can add a walk-in inline. The cost of
that choice is duplicate detection, specified below.

**Revenue is expected, not collected.** `enrolled x price_per_seat`. Enrolments
carry no payment state. This is the simplest model that answers "how much was
earned" for a demo; it will overstate reality when someone has not paid, which
is accepted for now.

## Data model

Two collections in the existing flat-file store. Records are small and few, so
each collection is a single JSON array written atomically, rather than one file
per record as tokens use.

```
programme
    id              prg_<random>
    title           string, required
    format          string
    location        string
    price_per_seat  integer, minor unit not used; whole naira
    seats           integer > 0
    tutor_name      string
    tutor_id        lec_<id> | null      reserved for piece 3
    start_date      YYYY-MM-DD | null
    end_date        YYYY-MM-DD | null
    lifecycle       draft | confirmed | completed | cancelled
    created_at, updated_at

enrolment
    id              enr_<random>
    programme_id    prg_<id>
    participant_id  string | null        set when picked from the directory
    name            string, required
    email           string, required
    organisation    string
    source          existing | inline
    logged_by       admin id now; lecturer id once piece 3 lands
    created_at
```

`tutor_name` stays a free-text name so this piece does not block on lecturer
accounts. `tutor_id` is written only once piece 3 exists; nothing reads it yet.

**Uniqueness.** At most one enrolment per `(programme_id, lower(email))`. A
second attempt returns `409` rather than silently creating a duplicate. This is
the direct cost of allowing inline adds: a lecturer can type in someone the
admin already invited.

**Revenue is never stored.** It is computed on read as
`enrolled x price_per_seat`. Storing it would let it drift from the enrolment
count.

## Status derivation

Computed server-side on every read and returned as `status`, so the admin
console, the participant portal and the future lecturer portal cannot disagree.
No client re-implements these rules.

```
lifecycle = cancelled                    -> cancelled
lifecycle = completed                    -> completed
lifecycle = draft                        -> draft
lifecycle = confirmed:
    today > end_date                     -> completed      (automatic)
    fill >= FILL_NEARLY_FULL  (0.85)     -> nearly-full
    fill <  FILL_UNDER_TARGET (0.60)     -> under-target
    otherwise                            -> open

fill = enrolled / seats     (0 when seats is 0 or missing)
```

Thresholds are configuration (`FILL_NEARLY_FULL`, `FILL_UNDER_TARGET`), not
literals, so they can be tuned without a deploy of new code.

A programme past its end date reports `completed` without the lecturer acting.
An explicit `completed` lifecycle covers finishing early; `cancelled` always
wins over both.

**Known flaw, accepted.** A freshly confirmed cohort with no enrolments computes
to `under-target` immediately, because `0 / seats` is below the threshold. That
is technically true and practically noisy: it means "nobody logged yet", not
"this cohort is failing". The alternative considered was to apply `under-target`
only within N weeks of `start_date`. Deferred until there are real numbers to
tune against. Revisit before this is shown to a client as a management report.

## API

Admin routes require a bearer token and the `trainings` permission, matching the
existing pattern in `AuthenticatesAdmin`.

```
GET    /api/v1/admin/programmes                    list, computed fields included
POST   /api/v1/admin/programmes                    create
GET    /api/v1/admin/programmes/{id}               one programme
PATCH  /api/v1/admin/programmes/{id}               edit, including lifecycle
GET    /api/v1/admin/programmes/{id}/enrolments    roster
POST   /api/v1/admin/programmes/{id}/enrolments    log a participant (temporary)
GET    /api/v1/programmes                          public; portal reads this
```

Every programme response carries the computed fields:

```json
{
  "id": "prg_8f2a",
  "title": "Strategic HR Management",
  "seats": 40,
  "price_per_seat": 310000,
  "tutor_name": "Halima Bello",
  "start_date": "2026-07-03",
  "end_date": "2026-07-05",
  "lifecycle": "confirmed",
  "status": "under-target",
  "enrolled": 22,
  "revenue": 6820000
}
```

The public `GET /api/v1/programmes` omits `lifecycle` and `revenue` and excludes
anything in `draft` or `cancelled`. The portal is participant-facing and has no
business seeing either.

**`POST .../enrolments` on the admin prefix is temporary.** Until the lecturer
portal exists nobody can confirm a cohort or log anyone, and the trainings page
would render an empty table. Piece 4 moves this to
`/api/v1/lecturer/programmes/{id}/enrolments` and the admin route is withdrawn.
It is marked as such in the route file so it is not mistaken for permanent API.

### Failure shapes

Consistent with the existing envelope.

| Case | Status |
| --- | --- |
| Missing or expired token | `401` |
| Role lacks `trainings` | `403` |
| Unknown programme id | `404` |
| Validation (missing title, seats < 1, end before start) | `422` |
| Duplicate email on a programme | `409` |

## Router change

The router matches exact paths against a hash map and has no concept of a path
parameter. `/programmes/{id}` cannot be expressed. It needs pattern support:
segment-wise matching that extracts named parameters and passes them to the
handler.

This touches a component every existing endpoint depends on, so the existing
auth suite is the regression check. Static routes must keep matching before any
pattern is tried, so behaviour for current endpoints is unchanged.

## Seeding

The six catalogue programmes are hardcoded table rows in `admin/trainings.html`.
They are seeded into the backend on first run from a seed file, so the migrated
page has content and the existing demo narrative survives. Seeding runs only
when the collection is empty, so it cannot overwrite real records on redeploy.

Programmes previously created into `localStorage` are not migrated. They were
demo artefacts of a browser session and carry no data worth keeping.

## Frontend changes

**Admin trainings page.** Reads `GET /api/v1/admin/programmes` on load and
renders every row from the response, seeded rows included. The hardcoded `<tr>`
block, the `localStorage` read, and the DOM-parsing hydration built for the Edit
button all come out; that parsing existed only because rows had no backing data.
Create and Edit call `POST` and `PATCH`. Status becomes read-only in the Edit
modal, since it is derived; lifecycle gets its own control.

**Participant portal.** Its trainings read repoints from `Store.list('trainings')`
to `GET /api/v1/programmes`.

## Testing

Extends the existing shell suite, run against the deployed API.

- Status derivation at the boundaries: 0 enrolled, just under and just over each
  threshold, exactly at `0.85` and `0.60`, past end date, cancelled beating a
  past end date, seats absent or zero.
- Revenue equals `enrolled x price_per_seat`, and changes when an enrolment is
  added.
- Duplicate email on the same programme returns `409`; the same email on a
  different programme succeeds.
- Permissions: a Finance Officer gets `403` on every programme route.
- Validation: missing title, `seats` below 1, `end_date` before `start_date`.
- Public list excludes `draft` and `cancelled` and omits `revenue`.
- The full existing auth suite passes unchanged, as the router regression check.

## Out of scope

Lecturer accounts and authentication; the lecturer portal; payment state on
enrolments; attendance; migrating materials, certificates or announcements off
`localStorage`; deleting programmes.
