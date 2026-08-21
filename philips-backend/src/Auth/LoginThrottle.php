<?php

declare(strict_types=1);

namespace Phillips\Tms\Auth;

use Phillips\Tms\Support\Env;
use Phillips\Tms\Support\JsonStore;

/**
 * Fixed-window attempt limiter for the login endpoint. The service is reachable
 * from the public internet, so unbounded password guessing is not an option even
 * for a demo.
 */
final class LoginThrottle
{
    private JsonStore $store;

    public function __construct(?JsonStore $store = null)
    {
        $this->store = $store ?? new JsonStore(TMS_BASE_PATH . '/storage/throttle');
    }

    private function maxAttempts(): int
    {
        return Env::int('AUTH_MAX_ATTEMPTS', 10);
    }

    private function decaySeconds(): int
    {
        return Env::int('AUTH_THROTTLE_DECAY', 900); // 15 minutes
    }

    /**
     * Seconds the caller must wait, or 0 when they may proceed.
     */
    public function retryAfter(string $ip, string $email): int
    {
        $record = $this->store->get($this->key($ip, $email));

        if ($record === null) {
            return 0;
        }

        $expiresAt = (int) ($record['expires_at'] ?? 0);
        if ($expiresAt < time()) {
            return 0;
        }

        if ((int) ($record['attempts'] ?? 0) < $this->maxAttempts()) {
            return 0;
        }

        return max(1, $expiresAt - time());
    }

    public function recordFailure(string $ip, string $email): void
    {
        $key = $this->key($ip, $email);
        $record = $this->store->get($key);
        $now = time();

        // Start a fresh window if the previous one has lapsed.
        if ($record === null || (int) ($record['expires_at'] ?? 0) < $now) {
            $record = ['attempts' => 0, 'expires_at' => $now + $this->decaySeconds()];
        }

        $record['attempts'] = (int) ($record['attempts'] ?? 0) + 1;

        $this->store->purgeExpired();
        $this->store->put($key, $record);
    }

    public function clear(string $ip, string $email): void
    {
        $this->store->forget($this->key($ip, $email));
    }

    private function key(string $ip, string $email): string
    {
        return hash('sha256', strtolower(trim($email)) . '|' . $ip);
    }
}
