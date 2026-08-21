# Programmes and Enrolments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make programme status, enrolment and revenue consequences of recorded actions instead of hand-picked labels, by moving programmes and enrolments onto the backend with status derived server-side.

**Architecture:** Two flat-file collections (`programmes`, `enrolments`) behind repositories, with a pure `ProgrammeStatus` class deriving status, fill and revenue on every read. The router gains path parameters so `/programmes/{id}` can exist. The admin trainings page stops reading `localStorage` and renders from the API.

**Tech Stack:** PHP 8.3 (no Composer, no framework), flat-file JSON storage, vanilla ES5-style browser JS, plain-CSS admin console.

**Spec:** `docs/superpowers/specs/2026-08-21-programmes-enrolments-design.md`

## Global Constraints

- **No Composer, no framework, no database.** Deployment is copying a directory. Never add a dependency.
- **PHP 8.3**, `declare(strict_types=1)` at the top of every new PHP file.
- **Response envelope** is always `{ success, message, data }` or `{ success, message, errors }`.
- **Admin routes** require a bearer token and the `trainings` permission via `AuthenticatesAdmin`.
- **Revenue is never stored.** Always `enrolled * price_per_seat`, computed on read.
- **Status is never stored.** Only `lifecycle` is stored; `status` is derived on every read.
- **Fill thresholds are config**, not literals: `FILL_NEARLY_FULL` (0.85), `FILL_UNDER_TARGET` (0.60).
- **`storage/` must be owned by uid 82** or php-fpm cannot write. Re-applied by `deploy.sh`.
- **British spelling** in user-facing copy (`programme`, `enrolment`, `organisation`).
- **No em-dashes** in any user-facing string.

## How to run tests

There is no PHP or Docker on the development workstation, so tests run in a
container on the server. Deploy first, then:

```bash
# unit tests (fast, pure logic)
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"

# integration tests (hit the live API)
ssh -p 10041 administrator@173.208.144.68 "bash ~/apitest.sh https://api.colat.ng/tms"
```

`./deploy.sh` from `philips-backend/` syncs and restarts. The existing 18-test
auth suite in `apitest.sh` is the regression check for every task that touches
shared code.

## File Structure

| File | Responsibility |
| --- | --- |
| `philips-backend/tests/run.php` | Zero-dependency test runner and assertions |
| `philips-backend/tests/router_test.php` | Router path-parameter matching |
| `philips-backend/tests/status_test.php` | Status derivation, fill, revenue |
| `philips-backend/tests/collection_test.php` | Collection insert/find/update |
| `philips-backend/src/Http/Router.php` | **Modify** — add path parameters |
| `philips-backend/src/Support/Collection.php` | Array-backed JSON collection |
| `philips-backend/src/Domain/ProgrammeStatus.php` | Pure derivation: fill, status, revenue |
| `philips-backend/src/Repositories/ProgrammeRepository.php` | Programme persistence + seeding |
| `philips-backend/src/Repositories/EnrolmentRepository.php` | Enrolment persistence + duplicate check |
| `philips-backend/src/Controllers/ProgrammeController.php` | Admin programme + enrolment endpoints |
| `philips-backend/config/programmes.php` | Seed catalogue |
| `philips-backend/public/index.php` | **Modify** — register routes |
| `philips-backend/.env.example` | **Modify** — threshold config |
| `assets/js/api.js` | **Modify** — add `Api.patch` |
| `admin/trainings.html` | **Modify** — render from API |
| `portal/trainings.html` | **Modify** — read public endpoint |

---

### Task 1: Test runner and router path parameters

**Files:**
- Create: `philips-backend/tests/run.php`
- Create: `philips-backend/tests/router_test.php`
- Modify: `philips-backend/src/Http/Router.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `test(string $name, callable $fn)`, `assertSame($expected, $actual, string $label)`, `assertTrue(bool $cond, string $label)`, `assertNull($actual, string $label)` — globals available to every later test file. `Router::add()` accepts `{param}` segments; handlers are invoked as `$handler($request, array $params)`.

- [ ] **Step 1: Write the test runner**

Create `philips-backend/tests/run.php`:

```php
<?php

declare(strict_types=1);

/**
 * Zero-dependency test runner. This project has no Composer, so it has no
 * PHPUnit either. Each tests/*_test.php file registers cases with test().
 *
 *   docker run --rm -v /opt/philips-tms-api:/app -w /app \
 *     php:8.3-cli-alpine php tests/run.php
 */

require __DIR__ . '/../src/bootstrap.php';

$GLOBALS['tms_tests'] = [];
$GLOBALS['tms_failures'] = [];

function test(string $name, callable $fn): void
{
    $GLOBALS['tms_tests'][] = [$name, $fn];
}

function fail(string $label, string $detail): void
{
    $GLOBALS['tms_current_failures'][] = $label . ': ' . $detail;
}

function assertSame($expected, $actual, string $label = ''): void
{
    if ($expected !== $actual) {
        fail($label, sprintf('expected %s, got %s', var_export($expected, true), var_export($actual, true)));
    }
}

function assertTrue($condition, string $label = ''): void
{
    if ($condition !== true) {
        fail($label, 'expected true, got ' . var_export($condition, true));
    }
}

function assertNull($actual, string $label = ''): void
{
    if ($actual !== null) {
        fail($label, 'expected null, got ' . var_export($actual, true));
    }
}

foreach (glob(__DIR__ . '/*_test.php') ?: [] as $file) {
    require $file;
}

$passed = 0;
$failed = 0;

foreach ($GLOBALS['tms_tests'] as [$name, $fn]) {
    $GLOBALS['tms_current_failures'] = [];
    try {
        $fn();
    } catch (\Throwable $e) {
        $GLOBALS['tms_current_failures'][] = 'threw ' . get_class($e) . ': ' . $e->getMessage();
    }

    if ($GLOBALS['tms_current_failures'] === []) {
        $passed++;
        printf("  PASS  %s\n", $name);
    } else {
        $failed++;
        printf("  FAIL  %s\n", $name);
        foreach ($GLOBALS['tms_current_failures'] as $detail) {
            printf("        %s\n", $detail);
        }
    }
}

printf("\n== passed: %d   failed: %d\n", $passed, $failed);
exit($failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Write the failing router test**

Create `philips-backend/tests/router_test.php`:

```php
<?php

declare(strict_types=1);

use Phillips\Tms\Http\Router;

test('router matches a static path exactly', function () {
    $router = new Router();
    $router->get('/api/health', function () {});
    assertSame(['GET /api/health'], $router->routeList(), 'static route registered');
});

test('router extracts a single path parameter', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}', function () {});
    $match = $router->match('GET', '/api/v1/admin/programmes/prg_8f2a');
    assertTrue($match !== null, 'pattern matched');
    assertSame(['id' => 'prg_8f2a'], $match['params'], 'param captured');
});

test('router extracts a parameter from the middle of a path', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}/enrolments', function () {});
    $match = $router->match('GET', '/api/v1/admin/programmes/prg_1/enrolments');
    assertTrue($match !== null, 'pattern matched');
    assertSame(['id' => 'prg_1'], $match['params'], 'param captured');
});

test('router prefers a static route over a pattern', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}', function () { return 'pattern'; });
    $router->get('/api/v1/admin/programmes/summary', function () { return 'static'; });
    $match = $router->match('GET', '/api/v1/admin/programmes/summary');
    assertSame([], $match['params'], 'static match carries no params');
});

test('router does not match a different segment count', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}', function () {});
    assertNull($router->match('GET', '/api/v1/admin/programmes/prg_1/enrolments'), 'too many segments');
    assertNull($router->match('GET', '/api/v1/admin/programmes'), 'too few segments');
});

test('router does not match the wrong verb', function () {
    $router = new Router();
    $router->post('/api/v1/admin/programmes/{id}', function () {});
    assertNull($router->match('GET', '/api/v1/admin/programmes/prg_1'), 'verb must match');
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: FAIL, `threw Error: Call to undefined method ... ::match()`

- [ ] **Step 4: Add path-parameter support to the Router**

In `philips-backend/src/Http/Router.php`, add a `$patterns` property beside `$routes`, replace `add()`, and add `match()`:

```php
    /** @var array<string, array<int, array{segments: string[], handler: callable}>> */
    private array $patterns = [];

    private function add(string $method, string $path, callable $handler): void
    {
        $normalised = '/' . trim($path, '/');
        $this->routes[$method][$normalised] = $handler;

        // Patterns are kept in a second list so static paths stay an O(1) hash
        // lookup and always win over a pattern that could also match.
        if (str_contains($normalised, '{')) {
            $this->patterns[$method][] = [
                'segments' => explode('/', trim($normalised, '/')),
                'handler' => $handler,
            ];
        }
    }

    /**
     * @return array{handler: callable, params: array<string, string>}|null
     */
    public function match(string $method, string $path): ?array
    {
        $normalised = '/' . trim($path, '/');

        $handler = $this->routes[$method][$normalised] ?? null;
        if ($handler !== null && !str_contains($normalised, '{')) {
            return ['handler' => $handler, 'params' => []];
        }

        $actual = explode('/', trim($normalised, '/'));

        foreach ($this->patterns[$method] ?? [] as $route) {
            $params = self::capture($route['segments'], $actual);
            if ($params !== null) {
                return ['handler' => $route['handler'], 'params' => $params];
            }
        }

        return null;
    }

    /**
     * @param string[] $expected
     * @param string[] $actual
     * @return array<string, string>|null
     */
    private static function capture(array $expected, array $actual): ?array
    {
        if (count($expected) !== count($actual)) {
            return null;
        }

        $params = [];
        foreach ($expected as $i => $segment) {
            if (strlen($segment) > 2 && $segment[0] === '{' && substr($segment, -1) === '}') {
                $name = substr($segment, 1, -1);
                if ($actual[$i] === '') {
                    return null;
                }
                $params[$name] = rawurldecode($actual[$i]);
                continue;
            }
            if ($segment !== $actual[$i]) {
                return null;
            }
        }

        return $params;
    }
```

Then rewrite `dispatch()` to use `match()`. Handlers are called with two
arguments; PHP passes extra positional arguments harmlessly to handlers that
declare only `Request`, so existing controllers need no change.

```php
    public function dispatch(Request $request): never
    {
        $path = $request->path();
        $method = $request->method();

        $match = $this->match($method, $path);
        if ($match !== null) {
            ($match['handler'])($request, $match['params']);
            Response::error('The handler returned no response.', 500);
        }

        $allowed = $this->allowedFor($path);
        if ($allowed !== []) {
            Response::error(
                sprintf('Method %s is not supported for %s.', $method, $path),
                405,
                ['allowed' => $allowed]
            );
        }

        Response::notFound(sprintf('No route matches %s %s.', $method, $path));
    }
```

Update `allowedFor()` so a 405 still works for pattern routes:

```php
    /** @return string[] */
    private function allowedFor(string $path): array
    {
        $allowed = [];
        foreach (array_keys($this->routes) as $verb) {
            if ($this->match($verb, $path) !== null) {
                $allowed[] = $verb;
            }
        }

        return $allowed;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: PASS, 6 passed 0 failed.

- [ ] **Step 6: Run the auth suite as a regression check**

```bash
ssh -p 10041 administrator@173.208.144.68 "bash ~/apitest.sh https://api.colat.ng/tms"
```

Expected: `passed: 18   failed: 0`. The router is shared by every endpoint, so
this must be green before continuing.

- [ ] **Step 7: Commit**

```bash
git add philips-backend/tests philips-backend/src/Http/Router.php
git commit -m "feat: path parameters in the router, plus a test runner"
```

---

### Task 2: Collection storage

**Files:**
- Create: `philips-backend/src/Support/Collection.php`
- Create: `philips-backend/tests/collection_test.php`

**Interfaces:**
- Consumes: `JsonStore` from `src/Support/JsonStore.php`.
- Produces: `Collection::__construct(string $name, ?string $directory = null)`, `all(): array`, `find(string $id): ?array`, `insert(array $record, string $prefix): array`, `update(string $id, array $patch): ?array`, `isEmpty(): bool`, `replaceAll(array $records): void`.

- [ ] **Step 1: Write the failing test**

Create `philips-backend/tests/collection_test.php`:

```php
<?php

declare(strict_types=1);

use Phillips\Tms\Support\Collection;

function fresh_collection(string $name): Collection
{
    $dir = sys_get_temp_dir() . '/tms_test_' . bin2hex(random_bytes(4));
    return new Collection($name, $dir);
}

test('a new collection is empty', function () {
    $c = fresh_collection('programmes');
    assertTrue($c->isEmpty(), 'starts empty');
    assertSame([], $c->all(), 'no records');
});

test('insert assigns a prefixed id and returns the record', function () {
    $c = fresh_collection('programmes');
    $saved = $c->insert(['title' => 'Negotiation Mastery'], 'prg');
    assertTrue(str_starts_with($saved['id'], 'prg_'), 'id is prefixed');
    assertSame('Negotiation Mastery', $saved['title'], 'field preserved');
    assertSame(1, count($c->all()), 'one record stored');
});

test('find returns a stored record and null for a miss', function () {
    $c = fresh_collection('programmes');
    $saved = $c->insert(['title' => 'A'], 'prg');
    assertSame('A', $c->find($saved['id'])['title'], 'found by id');
    assertNull($c->find('prg_nope'), 'unknown id returns null');
});

test('update merges a patch and leaves other fields alone', function () {
    $c = fresh_collection('programmes');
    $saved = $c->insert(['title' => 'A', 'seats' => 40], 'prg');
    $updated = $c->update($saved['id'], ['seats' => 50]);
    assertSame(50, $updated['seats'], 'patched field changed');
    assertSame('A', $updated['title'], 'untouched field preserved');
});

test('update returns null for an unknown id', function () {
    $c = fresh_collection('programmes');
    assertNull($c->update('prg_nope', ['seats' => 1]), 'unknown id');
});

test('records survive a new Collection over the same directory', function () {
    $dir = sys_get_temp_dir() . '/tms_test_' . bin2hex(random_bytes(4));
    $first = new Collection('programmes', $dir);
    $first->insert(['title' => 'Persisted'], 'prg');
    $second = new Collection('programmes', $dir);
    assertSame(1, count($second->all()), 'read back from disk');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: FAIL, `Class "Phillips\Tms\Support\Collection" not found`.

- [ ] **Step 3: Write the implementation**

Create `philips-backend/src/Support/Collection.php`:

```php
<?php

declare(strict_types=1);

namespace Phillips\Tms\Support;

/**
 * A list of records kept in one JSON file.
 *
 * Tokens use one file per record because they are looked up by key and expire
 * independently. Programmes and enrolments are listed far more often than they
 * are fetched by id, and there are tens of them rather than thousands, so a
 * single array per collection is simpler and cheaper.
 *
 * Writes are read-modify-write. JsonStore commits atomically via a temp file
 * and rename, so a reader never sees a half-written file, but two concurrent
 * writers can still lose one update. Acceptable at demo scale, and the reason
 * this is not a general-purpose store.
 */
final class Collection
{
    private JsonStore $store;

    public function __construct(private string $name, ?string $directory = null)
    {
        $this->store = new JsonStore($directory ?? TMS_BASE_PATH . '/storage/data');
    }

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        $data = $this->store->get($this->name);
        $records = $data['records'] ?? null;

        return is_array($records) ? array_values($records) : [];
    }

    public function isEmpty(): bool
    {
        return $this->all() === [];
    }

    public function find(string $id): ?array
    {
        foreach ($this->all() as $record) {
            if (($record['id'] ?? null) === $id) {
                return $record;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    public function insert(array $record, string $prefix): array
    {
        $record['id'] = $record['id'] ?? $prefix . '_' . bin2hex(random_bytes(5));
        $record['created_at'] = $record['created_at'] ?? gmdate('c');

        $records = $this->all();
        $records[] = $record;
        $this->write($records);

        return $record;
    }

    public function update(string $id, array $patch): ?array
    {
        $records = $this->all();
        $updated = null;

        foreach ($records as $i => $record) {
            if (($record['id'] ?? null) === $id) {
                unset($patch['id'], $patch['created_at']);
                $updated = array_merge($record, $patch);
                $updated['updated_at'] = gmdate('c');
                $records[$i] = $updated;
                break;
            }
        }

        if ($updated === null) {
            return null;
        }

        $this->write($records);

        return $updated;
    }

    public function replaceAll(array $records): void
    {
        $this->write(array_values($records));
    }

    private function write(array $records): void
    {
        $this->store->put($this->name, ['records' => $records]);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: PASS, 12 passed 0 failed.

- [ ] **Step 5: Commit**

```bash
git add philips-backend/src/Support/Collection.php philips-backend/tests/collection_test.php
git commit -m "feat: array-backed JSON collection storage"
```

---

### Task 3: Status derivation

**Files:**
- Create: `philips-backend/src/Domain/ProgrammeStatus.php`
- Create: `philips-backend/tests/status_test.php`
- Modify: `philips-backend/.env.example`

**Interfaces:**
- Consumes: `Env` from `src/Support/Env.php`.
- Produces: `ProgrammeStatus::fill(int $enrolled, int $seats): float`, `ProgrammeStatus::revenue(int $enrolled, int $pricePerSeat): int`, `ProgrammeStatus::derive(array $programme, int $enrolled, ?string $today = null): string`. `$today` is `YYYY-MM-DD` and defaults to the current date; tests pass it explicitly.

- [ ] **Step 1: Write the failing test**

Create `philips-backend/tests/status_test.php`:

```php
<?php

declare(strict_types=1);

use Phillips\Tms\Domain\ProgrammeStatus;

function programme(array $overrides = []): array
{
    return array_merge([
        'lifecycle' => 'confirmed',
        'seats' => 40,
        'price_per_seat' => 310000,
        'start_date' => '2026-07-03',
        'end_date' => '2026-07-05',
    ], $overrides);
}

test('fill is enrolled over seats, and zero when seats are missing', function () {
    assertSame(0.55, ProgrammeStatus::fill(22, 40), '22 of 40');
    assertSame(0.0, ProgrammeStatus::fill(5, 0), 'no seats means no fill');
});

test('revenue is enrolled times price per seat', function () {
    assertSame(6820000, ProgrammeStatus::revenue(22, 310000), '22 x 310000');
    assertSame(0, ProgrammeStatus::revenue(0, 310000), 'nobody enrolled');
});

test('cancelled and completed lifecycles win outright', function () {
    assertSame('cancelled', ProgrammeStatus::derive(programme(['lifecycle' => 'cancelled']), 40, '2026-01-01'), 'cancelled');
    assertSame('completed', ProgrammeStatus::derive(programme(['lifecycle' => 'completed']), 0, '2026-01-01'), 'completed early');
});

test('cancelled beats a cohort that is already past its end date', function () {
    assertSame(
        'cancelled',
        ProgrammeStatus::derive(programme(['lifecycle' => 'cancelled']), 40, '2026-12-01'),
        'cancelled outranks the date rule'
    );
});

test('a draft is a draft regardless of enrolment', function () {
    assertSame('draft', ProgrammeStatus::derive(programme(['lifecycle' => 'draft']), 39, '2026-01-01'), 'draft');
});

test('a confirmed cohort past its end date completes automatically', function () {
    assertSame('completed', ProgrammeStatus::derive(programme(), 22, '2026-07-06'), 'day after the end');
    assertSame('under-target', ProgrammeStatus::derive(programme(), 22, '2026-07-05'), 'on the end date is not over');
});

test('fill thresholds are inclusive at nearly-full and exclusive at under-target', function () {
    assertSame('nearly-full', ProgrammeStatus::derive(programme(), 34, '2026-01-01'), '34/40 = 0.85 exactly');
    assertSame('open', ProgrammeStatus::derive(programme(), 33, '2026-01-01'), '33/40 = 0.825');
    assertSame('open', ProgrammeStatus::derive(programme(), 24, '2026-01-01'), '24/40 = 0.60 exactly');
    assertSame('under-target', ProgrammeStatus::derive(programme(), 23, '2026-01-01'), '23/40 = 0.575');
});

test('a confirmed cohort with nobody logged reads as under-target', function () {
    // Known and accepted per the spec: this means "nobody logged yet", not
    // "failing". Recorded as a test so a future change to the rule is deliberate.
    assertSame('under-target', ProgrammeStatus::derive(programme(), 0, '2026-01-01'), 'zero enrolled');
});

test('a confirmed cohort with no end date never auto-completes', function () {
    assertSame(
        'open',
        ProgrammeStatus::derive(programme(['end_date' => null]), 30, '2030-01-01'),
        'no end date, no completion'
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: FAIL, `Class "Phillips\Tms\Domain\ProgrammeStatus" not found`.

- [ ] **Step 3: Write the implementation**

Create `philips-backend/src/Domain/ProgrammeStatus.php`:

```php
<?php

declare(strict_types=1);

namespace Phillips\Tms\Domain;

use Phillips\Tms\Support\Env;

/**
 * Derives what an administrator sees from what was actually recorded.
 *
 * Pure and side-effect free: the same programme and enrolment count always
 * produce the same status. Nothing here is stored, so the label can never drift
 * from the numbers behind it, which is the failure this replaces.
 */
final class ProgrammeStatus
{
    public const LIFECYCLES = ['draft', 'confirmed', 'completed', 'cancelled'];

    public static function fill(int $enrolled, int $seats): float
    {
        if ($seats <= 0) {
            return 0.0;
        }

        return $enrolled / $seats;
    }

    public static function revenue(int $enrolled, int $pricePerSeat): int
    {
        return max(0, $enrolled) * max(0, $pricePerSeat);
    }

    /**
     * @param array<string, mixed> $programme
     * @param string|null $today YYYY-MM-DD; defaults to the current date
     */
    public static function derive(array $programme, int $enrolled, ?string $today = null): string
    {
        $lifecycle = (string) ($programme['lifecycle'] ?? 'draft');

        // An explicit decision by a person outranks anything derived.
        if ($lifecycle === 'cancelled') {
            return 'cancelled';
        }
        if ($lifecycle === 'completed') {
            return 'completed';
        }
        if ($lifecycle !== 'confirmed') {
            return 'draft';
        }

        $endDate = $programme['end_date'] ?? null;
        if (is_string($endDate) && $endDate !== '') {
            $now = $today ?? gmdate('Y-m-d');
            // ISO dates compare correctly as strings.
            if ($now > $endDate) {
                return 'completed';
            }
        }

        $seats = (int) ($programme['seats'] ?? 0);
        $fill = self::fill($enrolled, $seats);

        if ($fill >= self::threshold('FILL_NEARLY_FULL', 0.85)) {
            return 'nearly-full';
        }
        if ($fill < self::threshold('FILL_UNDER_TARGET', 0.60)) {
            return 'under-target';
        }

        return 'open';
    }

    private static function threshold(string $key, float $default): float
    {
        $value = Env::get($key);

        return is_numeric($value) ? (float) $value : $default;
    }
}
```

- [ ] **Step 4: Add the thresholds to `.env.example`**

Append to `philips-backend/.env.example`:

```
# Fill thresholds for derived programme status, as a fraction of seats taken.
# At or above NEARLY_FULL is "nearly-full"; below UNDER_TARGET is "under-target".
FILL_NEARLY_FULL=0.85
FILL_UNDER_TARGET=0.60
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: PASS, 21 passed 0 failed.

- [ ] **Step 6: Commit**

```bash
git add philips-backend/src/Domain philips-backend/tests/status_test.php philips-backend/.env.example
git commit -m "feat: derive programme status from lifecycle and enrolment"
```

---

### Task 4: Programme repository and seed catalogue

**Files:**
- Create: `philips-backend/src/Repositories/ProgrammeRepository.php`
- Create: `philips-backend/config/programmes.php`

**Interfaces:**
- Consumes: `Collection`, `ProgrammeStatus`.
- Produces: `ProgrammeRepository::all(): array`, `find(string $id): ?array`, `create(array $attributes): array`, `update(string $id, array $patch): ?array`, `present(array $programme, int $enrolled): array`, `seedIfEmpty(): void`.

`present()` returns the wire shape: the stored fields plus `status`, `enrolled` and `revenue`.

- [ ] **Step 1: Write the seed catalogue**

Create `philips-backend/config/programmes.php`. These are the six rows currently
hardcoded in `admin/trainings.html`, so the migrated page keeps its content:

```php
<?php

declare(strict_types=1);

/**
 * Seed catalogue, loaded once when the programmes collection is empty.
 * These mirror the rows that were hardcoded into admin/trainings.html.
 */

return [
    [
        'title' => 'Advanced Leadership & Management',
        'format' => '4-day',
        'location' => 'Landmark Lagos',
        'price_per_seat' => 485000,
        'seats' => 50,
        'tutor_name' => 'Dr. Folake Aderinto',
        'start_date' => '2026-04-24',
        'end_date' => '2026-04-27',
        'lifecycle' => 'confirmed',
    ],
    [
        'title' => 'Project Management Professional Prep',
        'format' => '5-day',
        'location' => 'Hybrid (Zoom + Lagos)',
        'price_per_seat' => 240000,
        'seats' => 40,
        'tutor_name' => 'Ikechukwu Nwankwo',
        'start_date' => '2026-05-15',
        'end_date' => '2026-05-19',
        'lifecycle' => 'confirmed',
    ],
    [
        'title' => 'Finance for Non-Finance Managers',
        'format' => '2-day',
        'location' => 'Phillips HQ',
        'price_per_seat' => 185000,
        'seats' => 35,
        'tutor_name' => 'Halima Bello',
        'start_date' => '2026-06-12',
        'end_date' => '2026-06-13',
        'lifecycle' => 'confirmed',
    ],
    [
        'title' => 'Strategic HR Management',
        'format' => '3-day',
        'location' => 'Phillips HQ',
        'price_per_seat' => 310000,
        'seats' => 40,
        'tutor_name' => 'Segun Oyelaran',
        'start_date' => '2026-07-03',
        'end_date' => '2026-07-05',
        'lifecycle' => 'confirmed',
    ],
    [
        'title' => 'Data Analytics for Decision Makers',
        'format' => '3-day',
        'location' => 'Hybrid',
        'price_per_seat' => 275000,
        'seats' => 40,
        'tutor_name' => 'Dr. Chiamaka Umeh',
        'start_date' => '2026-07-22',
        'end_date' => '2026-07-24',
        'lifecycle' => 'confirmed',
    ],
    [
        'title' => 'Executive Communication & Influence',
        'format' => '2-day',
        'location' => 'Landmark Lagos',
        'price_per_seat' => 220000,
        'seats' => 36,
        'tutor_name' => 'Yusuf Danjuma',
        'start_date' => '2026-08-14',
        'end_date' => '2026-08-15',
        'lifecycle' => 'confirmed',
    ],
];
```

- [ ] **Step 2: Write the repository**

Create `philips-backend/src/Repositories/ProgrammeRepository.php`:

```php
<?php

declare(strict_types=1);

namespace Phillips\Tms\Repositories;

use Phillips\Tms\Domain\ProgrammeStatus;
use Phillips\Tms\Support\Collection;

final class ProgrammeRepository
{
    private Collection $collection;

    public function __construct(?Collection $collection = null)
    {
        $this->collection = $collection ?? new Collection('programmes');
    }

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        return $this->collection->all();
    }

    public function find(string $id): ?array
    {
        return $this->collection->find($id);
    }

    /** @param array<string, mixed> $attributes */
    public function create(array $attributes): array
    {
        return $this->collection->insert(self::normalise($attributes), 'prg');
    }

    public function update(string $id, array $patch): ?array
    {
        return $this->collection->update($id, self::normalise($patch, true));
    }

    /**
     * The wire shape: stored fields plus everything derived. Clients never
     * compute status or revenue themselves.
     *
     * @param array<string, mixed> $programme
     */
    public function present(array $programme, int $enrolled): array
    {
        $seats = (int) ($programme['seats'] ?? 0);
        $price = (int) ($programme['price_per_seat'] ?? 0);

        return [
            'id' => (string) ($programme['id'] ?? ''),
            'title' => (string) ($programme['title'] ?? ''),
            'format' => (string) ($programme['format'] ?? ''),
            'location' => (string) ($programme['location'] ?? ''),
            'price_per_seat' => $price,
            'seats' => $seats,
            'tutor_name' => (string) ($programme['tutor_name'] ?? ''),
            'tutor_id' => $programme['tutor_id'] ?? null,
            'start_date' => $programme['start_date'] ?? null,
            'end_date' => $programme['end_date'] ?? null,
            'lifecycle' => (string) ($programme['lifecycle'] ?? 'draft'),
            'status' => ProgrammeStatus::derive($programme, $enrolled),
            'enrolled' => $enrolled,
            'revenue' => ProgrammeStatus::revenue($enrolled, $price),
        ];
    }

    /**
     * Load the catalogue the first time only. Guarded on emptiness so a
     * redeploy can never overwrite real records.
     */
    public function seedIfEmpty(): void
    {
        if (!$this->collection->isEmpty()) {
            return;
        }

        $path = TMS_BASE_PATH . '/config/programmes.php';
        $seed = is_file($path) ? require $path : [];

        foreach (is_array($seed) ? $seed : [] as $programme) {
            $this->collection->insert(self::normalise($programme), 'prg');
        }
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private static function normalise(array $input, bool $patchOnly = false): array
    {
        $out = [];

        foreach (['title', 'format', 'location', 'tutor_name'] as $key) {
            if (array_key_exists($key, $input)) {
                $out[$key] = trim((string) $input[$key]);
            }
        }

        foreach (['price_per_seat', 'seats'] as $key) {
            if (array_key_exists($key, $input)) {
                $out[$key] = max(0, (int) $input[$key]);
            }
        }

        foreach (['start_date', 'end_date'] as $key) {
            if (array_key_exists($key, $input)) {
                $value = trim((string) $input[$key]);
                $out[$key] = $value === '' ? null : $value;
            }
        }

        if (array_key_exists('lifecycle', $input)) {
            $lifecycle = (string) $input['lifecycle'];
            $out['lifecycle'] = in_array($lifecycle, ProgrammeStatus::LIFECYCLES, true)
                ? $lifecycle
                : 'draft';
        } elseif (!$patchOnly) {
            $out['lifecycle'] = 'draft';
        }

        if (array_key_exists('tutor_id', $input)) {
            $out['tutor_id'] = $input['tutor_id'] === null ? null : (string) $input['tutor_id'];
        }

        return $out;
    }
}
```

- [ ] **Step 3: Verify it parses**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine sh -c 'php -l src/Repositories/ProgrammeRepository.php && php -l config/programmes.php'"
```

Expected: `No syntax errors detected` for both.

- [ ] **Step 4: Run the existing tests to confirm nothing regressed**

```bash
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: PASS, 21 passed 0 failed.

- [ ] **Step 5: Commit**

```bash
git add philips-backend/src/Repositories/ProgrammeRepository.php philips-backend/config/programmes.php
git commit -m "feat: programme repository with seeded catalogue"
```

---

### Task 5: Enrolment repository with duplicate detection

**Files:**
- Create: `philips-backend/src/Repositories/EnrolmentRepository.php`
- Create: `philips-backend/tests/enrolment_test.php`

**Interfaces:**
- Consumes: `Collection`.
- Produces: `EnrolmentRepository::forProgramme(string $programmeId): array`, `countFor(string $programmeId): int`, `countsByProgramme(): array<string,int>`, `hasEmail(string $programmeId, string $email): bool`, `log(string $programmeId, array $attributes): array`.

- [ ] **Step 1: Write the failing test**

Create `philips-backend/tests/enrolment_test.php`:

```php
<?php

declare(strict_types=1);

use Phillips\Tms\Repositories\EnrolmentRepository;
use Phillips\Tms\Support\Collection;

function fresh_enrolments(): EnrolmentRepository
{
    $dir = sys_get_temp_dir() . '/tms_test_' . bin2hex(random_bytes(4));
    return new EnrolmentRepository(new Collection('enrolments', $dir));
}

test('logging an enrolment stores it against the programme', function () {
    $repo = fresh_enrolments();
    $saved = $repo->log('prg_1', ['name' => 'Tobi Balogun', 'email' => 'tobi@gtbank.com']);
    assertTrue(str_starts_with($saved['id'], 'enr_'), 'id is prefixed');
    assertSame('prg_1', $saved['programme_id'], 'linked to the programme');
    assertSame(1, $repo->countFor('prg_1'), 'counted');
});

test('duplicate detection is case-insensitive on email', function () {
    $repo = fresh_enrolments();
    $repo->log('prg_1', ['name' => 'Tobi', 'email' => 'tobi@gtbank.com']);
    assertTrue($repo->hasEmail('prg_1', 'TOBI@GTBANK.COM'), 'same address, different case');
    assertSame(false, $repo->hasEmail('prg_1', 'someone@else.com'), 'different address');
});

test('the same email may enrol on a different programme', function () {
    $repo = fresh_enrolments();
    $repo->log('prg_1', ['name' => 'Tobi', 'email' => 'tobi@gtbank.com']);
    assertSame(false, $repo->hasEmail('prg_2', 'tobi@gtbank.com'), 'scoped per programme');
});

test('counts are grouped by programme', function () {
    $repo = fresh_enrolments();
    $repo->log('prg_1', ['name' => 'A', 'email' => 'a@x.com']);
    $repo->log('prg_1', ['name' => 'B', 'email' => 'b@x.com']);
    $repo->log('prg_2', ['name' => 'C', 'email' => 'c@x.com']);
    $counts = $repo->countsByProgramme();
    assertSame(2, $counts['prg_1'], 'two on the first');
    assertSame(1, $counts['prg_2'], 'one on the second');
});

test('a programme with no enrolments counts zero', function () {
    $repo = fresh_enrolments();
    assertSame(0, $repo->countFor('prg_nobody'), 'zero');
    assertSame([], $repo->forProgramme('prg_nobody'), 'empty roster');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: FAIL, `Class "Phillips\Tms\Repositories\EnrolmentRepository" not found`.

- [ ] **Step 3: Write the implementation**

Create `philips-backend/src/Repositories/EnrolmentRepository.php`:

```php
<?php

declare(strict_types=1);

namespace Phillips\Tms\Repositories;

use Phillips\Tms\Support\Collection;

final class EnrolmentRepository
{
    private Collection $collection;

    public function __construct(?Collection $collection = null)
    {
        $this->collection = $collection ?? new Collection('enrolments');
    }

    /** @return array<int, array<string, mixed>> */
    public function forProgramme(string $programmeId): array
    {
        return array_values(array_filter(
            $this->collection->all(),
            static fn (array $e): bool => ($e['programme_id'] ?? null) === $programmeId
        ));
    }

    public function countFor(string $programmeId): int
    {
        return count($this->forProgramme($programmeId));
    }

    /**
     * One pass for the whole list. Counting per programme inside a list loop
     * would re-read every enrolment once per programme.
     *
     * @return array<string, int>
     */
    public function countsByProgramme(): array
    {
        $counts = [];

        foreach ($this->collection->all() as $enrolment) {
            $id = (string) ($enrolment['programme_id'] ?? '');
            if ($id === '') {
                continue;
            }
            $counts[$id] = ($counts[$id] ?? 0) + 1;
        }

        return $counts;
    }

    public function hasEmail(string $programmeId, string $email): bool
    {
        $needle = mb_strtolower(trim($email));

        foreach ($this->forProgramme($programmeId) as $enrolment) {
            if (mb_strtolower((string) ($enrolment['email'] ?? '')) === $needle) {
                return true;
            }
        }

        return false;
    }

    /** @param array<string, mixed> $attributes */
    public function log(string $programmeId, array $attributes): array
    {
        return $this->collection->insert([
            'programme_id' => $programmeId,
            'participant_id' => $attributes['participant_id'] ?? null,
            'name' => trim((string) ($attributes['name'] ?? '')),
            'email' => trim((string) ($attributes['email'] ?? '')),
            'organisation' => trim((string) ($attributes['organisation'] ?? '')),
            'source' => ($attributes['source'] ?? 'inline') === 'existing' ? 'existing' : 'inline',
            'logged_by' => (string) ($attributes['logged_by'] ?? ''),
        ], 'enr');
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd philips-backend && ./deploy.sh
ssh -p 10041 administrator@173.208.144.68 \
  "docker run --rm -v /opt/philips-tms-api:/app -w /app php:8.3-cli-alpine php tests/run.php"
```

Expected: PASS, 26 passed 0 failed.

- [ ] **Step 5: Commit**

```bash
git add philips-backend/src/Repositories/EnrolmentRepository.php philips-backend/tests/enrolment_test.php
git commit -m "feat: enrolment repository with per-programme duplicate detection"
```

---

### Task 6: Admin programme endpoints

**Files:**
- Create: `philips-backend/src/Controllers/ProgrammeController.php`
- Modify: `philips-backend/public/index.php`

**Interfaces:**
- Consumes: `AuthenticatesAdmin`, `ProgrammeRepository`, `EnrolmentRepository`, `ProgrammeStatus`, `Router::get/post/patch`.
- Produces: `ProgrammeController::index`, `store`, `show`, `update`, `enrolments`, `logEnrolment`, `publicIndex`.

- [ ] **Step 1: Add `patch()` to the Router**

`Router` has `get()` and `post()` only. In `philips-backend/src/Http/Router.php`, beside `post()`:

```php
    public function patch(string $path, callable $handler): void
    {
        $this->add('PATCH', $path, $handler);
    }
```

- [ ] **Step 2: Write the controller**

Create `philips-backend/src/Controllers/ProgrammeController.php`:

```php
<?php

declare(strict_types=1);

namespace Phillips\Tms\Controllers;

use Phillips\Tms\Auth\AdminRepository;
use Phillips\Tms\Auth\AuthenticatesAdmin;
use Phillips\Tms\Auth\TokenGuard;
use Phillips\Tms\Domain\ProgrammeStatus;
use Phillips\Tms\Http\Request;
use Phillips\Tms\Http\Response;
use Phillips\Tms\Repositories\EnrolmentRepository;
use Phillips\Tms\Repositories\ProgrammeRepository;

final class ProgrammeController
{
    use AuthenticatesAdmin;

    public function __construct(
        private AdminRepository $admins = new AdminRepository(),
        private TokenGuard $tokens = new TokenGuard(),
        private ProgrammeRepository $programmes = new ProgrammeRepository(),
        private EnrolmentRepository $enrolments = new EnrolmentRepository()
    ) {
    }

    /** GET /api/v1/admin/programmes */
    public function index(Request $request): never
    {
        [, , $admin] = $this->authenticate($request);
        $this->requirePermission($admin, 'trainings');

        $this->programmes->seedIfEmpty();
        $counts = $this->enrolments->countsByProgramme();

        $out = [];
        foreach ($this->programmes->all() as $programme) {
            $id = (string) ($programme['id'] ?? '');
            $out[] = $this->programmes->present($programme, $counts[$id] ?? 0);
        }

        Response::ok(['programmes' => $out], 'Programmes listed.');
    }

    /** GET /api/v1/programmes  (public; participant portal) */
    public function publicIndex(Request $request): never
    {
        $this->programmes->seedIfEmpty();
        $counts = $this->enrolments->countsByProgramme();

        $out = [];
        foreach ($this->programmes->all() as $programme) {
            $lifecycle = (string) ($programme['lifecycle'] ?? 'draft');
            if ($lifecycle === 'draft' || $lifecycle === 'cancelled') {
                continue;
            }

            $presented = $this->programmes->present($programme, $counts[(string) $programme['id']] ?? 0);
            // Participants have no business seeing revenue or internal lifecycle.
            unset($presented['revenue'], $presented['lifecycle'], $presented['tutor_id']);
            $out[] = $presented;
        }

        Response::ok(['programmes' => $out], 'Programmes listed.');
    }

    /** POST /api/v1/admin/programmes */
    public function store(Request $request): never
    {
        [, , $admin] = $this->authenticate($request);
        $this->requirePermission($admin, 'trainings');

        $errors = self::validate($request->all(), true);
        if ($errors !== []) {
            Response::validation($errors);
        }

        $created = $this->programmes->create($request->all());

        Response::ok(
            ['programme' => $this->programmes->present($created, 0)],
            'Programme created.',
            201
        );
    }

    /** GET /api/v1/admin/programmes/{id} */
    public function show(Request $request, array $params): never
    {
        [, , $admin] = $this->authenticate($request);
        $this->requirePermission($admin, 'trainings');

        $programme = $this->requireProgramme($params['id'] ?? '');

        Response::ok(
            ['programme' => $this->programmes->present($programme, $this->enrolments->countFor($programme['id']))],
            'Programme found.'
        );
    }

    /** PATCH /api/v1/admin/programmes/{id} */
    public function update(Request $request, array $params): never
    {
        [, , $admin] = $this->authenticate($request);
        $this->requirePermission($admin, 'trainings');

        $programme = $this->requireProgramme($params['id'] ?? '');

        $errors = self::validate($request->all(), false, $programme);
        if ($errors !== []) {
            Response::validation($errors);
        }

        $updated = $this->programmes->update((string) $programme['id'], $request->all());
        if ($updated === null) {
            Response::notFound('That programme no longer exists.');
        }

        Response::ok(
            ['programme' => $this->programmes->present($updated, $this->enrolments->countFor($updated['id']))],
            'Programme updated.'
        );
    }

    /** GET /api/v1/admin/programmes/{id}/enrolments */
    public function enrolments(Request $request, array $params): never
    {
        [, , $admin] = $this->authenticate($request);
        $this->requirePermission($admin, 'trainings');

        $programme = $this->requireProgramme($params['id'] ?? '');

        Response::ok([
            'programme_id' => $programme['id'],
            'enrolments' => $this->enrolments->forProgramme((string) $programme['id']),
        ], 'Enrolments listed.');
    }

    /**
     * POST /api/v1/admin/programmes/{id}/enrolments
     *
     * TEMPORARY. Until the lecturer portal exists nobody can log a participant,
     * and the trainings page would show every cohort permanently empty. Piece 4
     * moves this to /api/v1/lecturer/... and this route is withdrawn.
     */
    public function logEnrolment(Request $request, array $params): never
    {
        [, , $admin] = $this->authenticate($request);
        $this->requirePermission($admin, 'trainings');

        $programme = $this->requireProgramme($params['id'] ?? '');

        $name = $request->string('name');
        $email = $request->string('email');

        $errors = [];
        if ($name === '') {
            $errors['name'] = ['A participant name is required.'];
        }
        if ($email === '') {
            $errors['email'] = ['An email address is required.'];
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = ['Enter a valid email address.'];
        }
        if ($errors !== []) {
            Response::validation($errors);
        }

        if ($this->enrolments->hasEmail((string) $programme['id'], $email)) {
            Response::error('That person is already enrolled on this programme.', 409, [
                'email' => ['Already enrolled on this programme.'],
            ]);
        }

        $enrolment = $this->enrolments->log((string) $programme['id'], [
            'name' => $name,
            'email' => $email,
            'organisation' => $request->string('organisation'),
            'participant_id' => $request->input('participant_id'),
            'source' => $request->string('source', 'inline'),
            'logged_by' => (string) ($admin['id'] ?? ''),
        ]);

        $count = $this->enrolments->countFor((string) $programme['id']);

        Response::ok([
            'enrolment' => $enrolment,
            'programme' => $this->programmes->present($programme, $count),
        ], 'Participant enrolled.', 201);
    }

    /** @return array<string, mixed> */
    private function requireProgramme(string $id): array
    {
        $this->programmes->seedIfEmpty();
        $programme = $id === '' ? null : $this->programmes->find($id);

        if ($programme === null) {
            Response::notFound('No programme with that id.');
        }

        return $programme;
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed>|null $existing
     * @return array<string, array<int, string>>
     */
    private static function validate(array $input, bool $creating, ?array $existing = null): array
    {
        $errors = [];

        if ($creating || array_key_exists('title', $input)) {
            if (trim((string) ($input['title'] ?? '')) === '') {
                $errors['title'] = ['A programme title is required.'];
            }
        }

        if (array_key_exists('seats', $input) && (int) $input['seats'] < 1) {
            $errors['seats'] = ['Seats must be at least 1.'];
        }

        if (array_key_exists('lifecycle', $input)
            && !in_array((string) $input['lifecycle'], ProgrammeStatus::LIFECYCLES, true)) {
            $errors['lifecycle'] = ['Unknown lifecycle. Use one of: ' . implode(', ', ProgrammeStatus::LIFECYCLES) . '.'];
        }

        // Compare against whichever date is not being changed in this request.
        $start = array_key_exists('start_date', $input)
            ? trim((string) $input['start_date'])
            : (string) ($existing['start_date'] ?? '');
        $end = array_key_exists('end_date', $input)
            ? trim((string) $input['end_date'])
            : (string) ($existing['end_date'] ?? '');

        if ($end !== '' && $start === '') {
            $errors['start_date'] = ['Add a start date as well as an end date.'];
        }
        if ($start !== '' && $end !== '' && $end < $start) {
            $errors['end_date'] = ['The end date cannot fall before the start date.'];
        }

        return $errors;
    }
}
```

- [ ] **Step 3: Allow a default in `Request::string()`**

`ProgrammeController::logEnrolment` calls `$request->string('source', 'inline')`.
Confirm `src/Http/Request.php` already declares
`public function string(string $key, string $default = ''): string`. It does; no
change needed. Do not add an overload.

- [ ] **Step 4: Register the routes**

In `philips-backend/public/index.php`, add the import and instance beside the
others, then the routes after the participants block:

```php
use Phillips\Tms\Controllers\ProgrammeController;

$programmes = new ProgrammeController();
```

```php
/*
|--------------------------------------------------------------------------
| Programmes
|--------------------------------------------------------------------------
*/

$router->get('/api/v1/admin/programmes', [$programmes, 'index']);
$router->post('/api/v1/admin/programmes', [$programmes, 'store']);
$router->get('/api/v1/admin/programmes/{id}', [$programmes, 'show']);
$router->patch('/api/v1/admin/programmes/{id}', [$programmes, 'update']);
$router->get('/api/v1/admin/programmes/{id}/enrolments', [$programmes, 'enrolments']);

// TEMPORARY: withdrawn once the lecturer portal owns enrolment logging.
$router->post('/api/v1/admin/programmes/{id}/enrolments', [$programmes, 'logEnrolment']);

// Public: the participant portal reads this. No auth, no revenue.
$router->get('/api/v1/programmes', [$programmes, 'publicIndex']);
```

- [ ] **Step 5: Deploy and smoke-test by hand**

```bash
cd philips-backend && ./deploy.sh
TOKEN=$(curl -sS -X POST https://api.colat.ng/tms/api/v1/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tunde.okafor@phillipsconsulting.net","password":"passphrase"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -sS https://api.colat.ng/tms/api/v1/admin/programmes -H "Authorization: Bearer $TOKEN"
```

Expected: six seeded programmes, each with `status`, `enrolled: 0`, `revenue: 0`.

- [ ] **Step 6: Commit**

```bash
git add philips-backend/src/Controllers/ProgrammeController.php philips-backend/public/index.php philips-backend/src/Http/Router.php
git commit -m "feat: admin and public programme endpoints"
```

---

### Task 7: Integration test suite

**Files:**
- Create: `philips-backend/tests/programmes_api.sh`

**Interfaces:**
- Consumes: the endpoints from Task 6.
- Produces: a runnable suite in the style of the existing `apitest.sh`.

- [ ] **Step 1: Write the suite**

Create `philips-backend/tests/programmes_api.sh`:

```bash
#!/usr/bin/env bash
# Integration tests for the programme and enrolment endpoints.
# Run against the deployed API:  bash tests/programmes_api.sh https://api.colat.ng/tms

BASE="${1:-https://api.colat.ng/tms}"
ADMIN="$BASE/api/v1/admin/programmes"

pass=0; fail=0
check() {
  if [ "$2" = "$3" ]; then printf '  PASS  %-46s %s\n' "$1" "$3"; pass=$((pass+1))
  else printf '  FAIL  %-46s expected %s got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
status() { curl -sS -m 25 -o /dev/null -w '%{http_code}' "$@"; }

login() {
  curl -sS -m 20 -X POST "$BASE/api/v1/admin/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"passphrase\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

TOKEN=$(login tunde.okafor@phillipsconsulting.net)
FIN=$(login amaka.eze@phillipsconsulting.net)
AUTH="Authorization: Bearer $TOKEN"

echo "== $ADMIN"

check 'list without a token            -> 401' 401 "$(status "$ADMIN")"
check 'list as Finance Officer         -> 403' 403 "$(status "$ADMIN" -H "Authorization: Bearer $FIN")"
check 'list as admin                   -> 200' 200 "$(status "$ADMIN" -H "$AUTH")"
check 'unknown programme               -> 404' 404 "$(status "$ADMIN/prg_nope" -H "$AUTH")"

check 'create without a title          -> 422' 422 \
  "$(status -X POST "$ADMIN" -H "$AUTH" -H 'Content-Type: application/json' -d '{"seats":10}')"
check 'create with zero seats          -> 422' 422 \
  "$(status -X POST "$ADMIN" -H "$AUTH" -H 'Content-Type: application/json' -d '{"title":"X","seats":0}')"
check 'create with end before start    -> 422' 422 \
  "$(status -X POST "$ADMIN" -H "$AUTH" -H 'Content-Type: application/json' \
     -d '{"title":"X","start_date":"2026-05-10","end_date":"2026-05-01"}')"

CREATED=$(curl -sS -m 25 -X POST "$ADMIN" -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "title":"Integration Test Cohort","seats":10,"price_per_seat":100000,
  "start_date":"2026-09-01","end_date":"2026-09-03","lifecycle":"confirmed"}')
PID=$(printf '%s' "$CREATED" | sed -n 's/.*"id":"\(prg_[^"]*\)".*/\1/p')
[ -n "$PID" ] && { printf '  PASS  %-46s %s\n' 'created a programme' "$PID"; pass=$((pass+1)); } \
              || { printf '  FAIL  %-46s %s\n' 'created a programme' "$CREATED"; fail=$((fail+1)); }

# 0 of 10 seats is below the under-target threshold.
echo "$CREATED" | grep -q '"status":"under-target"' \
  && { printf '  PASS  %-46s\n' 'new confirmed cohort is under-target'; pass=$((pass+1)); } \
  || { printf '  FAIL  %-46s %s\n' 'new confirmed cohort is under-target' "$CREATED"; fail=$((fail+1)); }

ENROL="$ADMIN/$PID/enrolments"

check 'enrol without an email          -> 422' 422 \
  "$(status -X POST "$ENROL" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"A"}')"
check 'enrol a participant             -> 201' 201 \
  "$(status -X POST "$ENROL" -H "$AUTH" -H 'Content-Type: application/json' \
     -d '{"name":"Tobi Balogun","email":"tobi@gtbank.com","organisation":"GTBank"}')"
check 'the same email again            -> 409' 409 \
  "$(status -X POST "$ENROL" -H "$AUTH" -H 'Content-Type: application/json' \
     -d '{"name":"Tobi Balogun","email":"TOBI@GTBANK.COM"}')"

AFTER=$(curl -sS -m 25 "$ADMIN/$PID" -H "$AUTH")
echo "$AFTER" | grep -q '"enrolled":1' \
  && { printf '  PASS  %-46s\n' 'enrolment count reflects the log'; pass=$((pass+1)); } \
  || { printf '  FAIL  %-46s %s\n' 'enrolment count reflects the log' "$AFTER"; fail=$((fail+1)); }

echo "$AFTER" | grep -q '"revenue":100000' \
  && { printf '  PASS  %-46s\n' 'revenue is enrolled x price'; pass=$((pass+1)); } \
  || { printf '  FAIL  %-46s %s\n' 'revenue is enrolled x price' "$AFTER"; fail=$((fail+1)); }

CANCELLED=$(curl -sS -m 25 -X PATCH "$ADMIN/$PID" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"lifecycle":"cancelled"}')
echo "$CANCELLED" | grep -q '"status":"cancelled"' \
  && { printf '  PASS  %-46s\n' 'cancelling changes the derived status'; pass=$((pass+1)); } \
  || { printf '  FAIL  %-46s %s\n' 'cancelling changes the derived status' "$CANCELLED"; fail=$((fail+1)); }

PUBLIC=$(curl -sS -m 25 "$BASE/api/v1/programmes")
echo "$PUBLIC" | grep -q "$PID" \
  && { printf '  FAIL  %-46s cancelled cohort is public\n' 'public list hides cancelled'; fail=$((fail+1)); } \
  || { printf '  PASS  %-46s\n' 'public list hides cancelled'; pass=$((pass+1)); }

echo "$PUBLIC" | grep -q '"revenue"' \
  && { printf '  FAIL  %-46s revenue exposed publicly\n' 'public list omits revenue'; fail=$((fail+1)); } \
  || { printf '  PASS  %-46s\n' 'public list omits revenue'; pass=$((pass+1)); }

echo
echo "== passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: Run it**

```bash
cd philips-backend && ./deploy.sh
scp -P 10041 tests/programmes_api.sh administrator@173.208.144.68:~/
ssh -p 10041 administrator@173.208.144.68 "bash ~/programmes_api.sh https://api.colat.ng/tms"
```

Expected: `passed: 17   failed: 0`.

- [ ] **Step 3: Run the auth suite as a regression check**

```bash
ssh -p 10041 administrator@173.208.144.68 "bash ~/apitest.sh https://api.colat.ng/tms"
```

Expected: `passed: 18   failed: 0`.

- [ ] **Step 4: Commit**

```bash
git add philips-backend/tests/programmes_api.sh
git commit -m "test: integration suite for programmes and enrolments"
```

---

### Task 8: Admin trainings page reads the API

**Files:**
- Modify: `assets/js/api.js`
- Modify: `admin/trainings.html`

**Interfaces:**
- Consumes: `GET/POST/PATCH /api/v1/admin/programmes`.
- Produces: `Api.patch(path, body, opts)`.

- [ ] **Step 1: Add `Api.patch`**

In `assets/js/api.js`, inside the `Api` object beside `post`:

```javascript
        patch: function (path, body, opts) { return request('PATCH', path, body, opts); },
```

- [ ] **Step 2: Replace the table body and its script**

In `admin/trainings.html`:

1. Delete the six hardcoded `<tr>` rows from the catalogue `<tbody>`, leaving it
   empty with its existing id.
2. Keep `cohortLabel`, `parseISO` and `MONTHS`. They format `start_date` and
   `end_date` for display and are still needed.
3. Delete `hydrateProgramme` entirely. It parsed values back out of rendered
   HTML because rows had no backing data. Rows now arrive as objects.
4. Replace `programmeRow`, `paintProgramme` and the load block with:

```javascript
    const STATUSES = {
        'draft':        { label: 'Draft',        cls: '' },
        'open':         { label: 'Open',         cls: 'tag-blue' },
        'nearly-full':  { label: 'Nearly Full',  cls: 'tag-warn' },
        'under-target': { label: 'Under Target', cls: 'tag-warn' },
        'completed':    { label: 'Completed',    cls: 'tag-success' },
        'cancelled':    { label: 'Cancelled',    cls: 'tag-danger' }
    };

    const naira = (n) => '₦' + Number(n || 0).toLocaleString();

    function money(n) {
        const v = Number(n || 0);
        return v >= 1000000 ? '₦' + (v / 1000000).toFixed(1) + 'M' : naira(v);
    }

    // One row from an API programme object. Status, enrolment and revenue are
    // whatever the server derived; nothing is computed here.
    function programmeRow(p) {
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.dataset.status = p.status;
        tr.dataset.title = p.title;
        tr.programme = p;

        const st = STATUSES[p.status] || STATUSES.draft;
        const pct = p.seats > 0 ? Math.round((p.enrolled / p.seats) * 100) : 0;
        const bits = [p.format, p.location, naira(p.price_per_seat) + '/seat'];
        if (p.tutor_name) bits.push('Tutor: ' + p.tutor_name);

        tr.innerHTML = `
            <td><strong>${esc(p.title)}</strong><div class="cell-muted" style="font-size:11.5px;">${esc(bits.filter(Boolean).join(' · '))}</div></td>
            <td class="cell-muted">${esc(cohortLabel({ startDate: p.start_date, endDate: p.end_date }))}</td>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:80px;"><div class="progress"><span style="width:${pct}%"></span></div></div>
                    <span style="font-size:12px;color:var(--ink-700);">${p.enrolled}/${p.seats}</span>
                </div>
            </td>
            <td><strong>${money(p.revenue)}</strong></td>
            <td><span class="tag ${st.cls}">${st.label}</span></td>
            <td style="text-align:right;"><button class="btn btn-ghost btn-sm js-qr">QR</button> <button class="btn btn-ghost btn-sm js-edit">Edit</button></td>`;
        return tr;
    }

    function renderProgrammes(list) {
        tbody.innerHTML = '';
        list.forEach((p) => tbody.appendChild(programmeRow(p)));
    }

    function loadProgrammes() {
        return Api.get('/api/v1/admin/programmes')
            .then((data) => { renderProgrammes(data.programmes || []); })
            .catch((err) => {
                tbody.innerHTML = '<tr><td colspan="6" class="cell-muted" style="padding:26px;">' +
                    esc(err && err.firstError ? err.firstError() : 'Could not load programmes.') +
                    '</td></tr>';
            });
    }

    loadProgrammes();
```

5. Point the create modal's `onSubmit` at the API. Replace the `Store.add` call
   and row insertion with:

```javascript
                Api.post('/api/v1/admin/programmes', {
                    title: p.title,
                    format: p.format,
                    location: p.location,
                    price_per_seat: p.price,
                    seats: p.seats,
                    tutor_name: p.tutor,
                    start_date: p.startDate,
                    end_date: p.endDate,
                    lifecycle: 'draft'
                }).then(() => {
                    loadProgrammes();
                    toast('Programme created');
                    close();
                }).catch((err) => {
                    setError(err && err.firstError ? err.firstError() : 'Could not create the programme.');
                });
                return false;
```

Change the modal options to receive `close`: `onSubmit: (form, close) => {`.

6. Rewrite the Edit modal. Status becomes read-only text and lifecycle gets the
   control, because status is derived. Replace the status `<select>` with:

```javascript
            <div class="field">
                <label for="ep-lifecycle">Lifecycle</label>
                <select id="ep-lifecycle" name="lifecycle">
                    <option value="draft">Draft</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>
            <div class="field-hint">
                Status is worked out from the lifecycle and how many people are enrolled. It cannot be set by hand.
            </div>
```

Select the current value after opening: `form.lifecycle.value = p.lifecycle;`

And submit via the API:

```javascript
                Api.patch('/api/v1/admin/programmes/' + p.id, {
                    title: form.title.value.trim(),
                    format: form.format.value.trim(),
                    location: form.location.value.trim(),
                    price_per_seat: form.price.value,
                    seats: form.seats.value,
                    tutor_name: form.tutor.value.trim(),
                    start_date: form.startDate.value,
                    end_date: form.endDate.value,
                    lifecycle: form.lifecycle.value
                }).then(() => {
                    loadProgrammes();
                    toast('Programme updated');
                    close();
                }).catch((err) => {
                    setError(err && err.firstError ? err.firstError() : 'Could not save the changes.');
                });
                return false;
```

7. Delete the `Store.list('trainings')` load block and every `Store.patch('trainings', ...)`
   and `Store.override('trainings', ...)` call. The backend is the only source now.

- [ ] **Step 3: Verify in a browser**

Serve the site and sign in, then confirm on `admin/trainings.html`:
- Six seeded programmes render, each showing `0/seats` and `₦0`.
- Creating a programme adds it after the list reloads.
- Editing lifecycle to `cancelled` shows `Cancelled`.
- The status control is gone from the Edit modal.

- [ ] **Step 4: Commit**

```bash
git add assets/js/api.js admin/trainings.html
git commit -m "feat: admin trainings page renders from the API"
```

---

### Task 9: Participant portal reads the public endpoint

**Files:**
- Modify: `portal/trainings.html`

**Interfaces:**
- Consumes: `GET /api/v1/programmes`.

- [ ] **Step 1: Confirm the portal loads the API client**

`portal/trainings.html` must include, before its inline script:

```html
<script src="../assets/js/config.js"></script>
<script src="../assets/js/api.js"></script>
```

Add them if absent, immediately before the existing `app.js` tag.

- [ ] **Step 2: Replace the store read**

Find the `Store.list('trainings')` block and replace it with:

```javascript
    Api.get('/api/v1/programmes').then((data) => {
        (data.programmes || []).forEach((p) => {
            // Render newest first, same as the previous store-backed behaviour.
            container.insertBefore(programmeCard(p), container.firstChild);
        });
    }).catch(() => {
        // The portal still shows its seeded content if the API is unreachable.
    });
```

Adjust `programmeCard` to read `p.title`, `p.format`, `p.location`,
`p.start_date`, `p.end_date` and `p.status`. It must not read `p.revenue` or
`p.lifecycle`; the public endpoint does not send them.

- [ ] **Step 3: Verify in a browser**

Open `portal/trainings.html`. The seeded programmes appear. Cancelled and draft
programmes do not. No console errors.

- [ ] **Step 4: Commit**

```bash
git add portal/trainings.html
git commit -m "feat: participant portal reads programmes from the API"
```

---

### Task 10: Documentation

**Files:**
- Modify: `philips-backend/README.md`

- [ ] **Step 1: Document the endpoints**

Add the seven programme routes to the endpoint table, and a section covering:
- Status is derived, never stored, and the exact rules.
- Revenue is `enrolled x price_per_seat` and does not track payment.
- The thresholds are `FILL_NEARLY_FULL` and `FILL_UNDER_TARGET`.
- Seeding happens once, guarded on an empty collection.
- `POST /api/v1/admin/programmes/{id}/enrolments` is temporary and is withdrawn
  when the lecturer portal lands.
- How to run both test suites.

- [ ] **Step 2: Commit**

```bash
git add philips-backend/README.md
git commit -m "docs: programme and enrolment endpoints"
```

---

## Self-Review

**Spec coverage.** Data model → Tasks 2, 4, 5. Status derivation including every
documented rule → Task 3. API surface, all seven routes → Task 6. Failure shapes
401/403/404/422/409 → Tasks 6, 7. Router change → Task 1. Seeding → Task 4.
Frontend changes, admin and portal → Tasks 8, 9. Testing → Tasks 1, 3, 5, 7.
Out-of-scope items are absent, as intended.

**Known gap, deliberate.** The spec mentions picking an existing participant
from the directory (`source: existing`, `participant_id`). The field and its
handling exist in Task 5 and Task 6, but no UI populates them, because the
lecturer portal is piece 4. The temporary admin route accepts both shapes so the
data model is proven before the UI arrives.

**Type consistency.** `ProgrammeStatus::derive/fill/revenue` signatures match
between Task 3 and their callers in Task 4 and Task 6.
`EnrolmentRepository::countsByProgramme()` returns `array<string,int>`, keyed by
programme id, and is consumed that way in Task 6. `Collection::insert()` takes
`(array $record, string $prefix)` in Task 2 and is called that way in Tasks 4
and 5. `Router::match()` returns `['handler' =>, 'params' =>]` in Task 1 and is
destructured that way in `dispatch()`.
