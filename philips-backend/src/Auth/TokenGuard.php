<?php

declare(strict_types=1);

namespace Phillips\Tms\Auth;

use Phillips\Tms\Support\Env;
use Phillips\Tms\Support\JsonStore;

/**
 * Opaque bearer tokens backed by the flat-file store.
 *
 * The plaintext token is returned to the client once and never stored; the store
 * holds only its SHA-256, so a leaked storage directory does not yield usable
 * sessions.
 */
final class TokenGuard
{
    private JsonStore $store;

    public function __construct(?JsonStore $store = null)
    {
        $this->store = $store ?? new JsonStore(TMS_BASE_PATH . '/storage/tokens');
    }

    public function ttlSeconds(): int
    {
        return Env::int('AUTH_TOKEN_TTL', 28800); // 8 hours
    }

    /**
     * @return array{token: string, expires_at: int, expires_in: int}
     */
    public function issue(array $admin, string $userAgent, string $ip): array
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $now = time();
        $expiresAt = $now + $this->ttlSeconds();

        $this->store->purgeExpired();
        $this->store->put($this->key($token), [
            'admin_id' => (string) ($admin['id'] ?? ''),
            'email' => (string) ($admin['email'] ?? ''),
            'issued_at' => $now,
            'last_used_at' => $now,
            'expires_at' => $expiresAt,
            'user_agent' => substr($userAgent, 0, 255),
            'ip' => $ip,
        ]);

        return [
            'token' => $token,
            'expires_at' => $expiresAt,
            'expires_in' => $this->ttlSeconds(),
        ];
    }

    /**
     * Resolve a token to its session record, or null when missing/expired.
     */
    public function resolve(?string $token): ?array
    {
        if ($token === null || $token === '') {
            return null;
        }

        $key = $this->key($token);
        $session = $this->store->get($key);

        if ($session === null) {
            return null;
        }

        if ((int) ($session['expires_at'] ?? 0) < time()) {
            $this->store->forget($key);

            return null;
        }

        return $session;
    }

    public function touch(string $token, array $session): void
    {
        $session['last_used_at'] = time();
        $this->store->put($this->key($token), $session);
    }

    public function revoke(string $token): void
    {
        $this->store->forget($this->key($token));
    }

    /**
     * Issue a replacement and drop the old token in one step, so a refreshed
     * session never leaves two live tokens behind.
     *
     * @return array{token: string, expires_at: int, expires_in: int}
     */
    public function rotate(string $oldToken, array $admin, string $userAgent, string $ip): array
    {
        $fresh = $this->issue($admin, $userAgent, $ip);
        $this->revoke($oldToken);

        return $fresh;
    }

    private function key(string $token): string
    {
        return hash('sha256', $token);
    }
}
