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
