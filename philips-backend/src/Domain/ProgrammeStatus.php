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
