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
