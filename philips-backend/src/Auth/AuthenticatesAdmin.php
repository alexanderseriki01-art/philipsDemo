<?php

declare(strict_types=1);

namespace Phillips\Tms\Auth;

use Phillips\Tms\Http\Request;
use Phillips\Tms\Http\Response;

/**
 * Bearer-token authentication for admin endpoints.
 *
 * Expects the using class to expose `$this->tokens` (TokenGuard) and
 * `$this->admins` (AdminRepository).
 */
trait AuthenticatesAdmin
{
    /**
     * Resolve the caller, or answer 401 and stop.
     *
     * @return array{0: string, 1: array<string, mixed>, 2: array<string, mixed>}
     */
    protected function authenticate(Request $request): array
    {
        $token = $request->bearerToken();
        $session = $this->tokens->resolve($token);

        if ($token === null || $session === null) {
            Response::unauthorized('Your session has expired. Please sign in again.');
        }

        $admin = $this->admins->findById((string) ($session['admin_id'] ?? ''));

        // The account was removed from config while a token was still live.
        if ($admin === null) {
            $this->tokens->revoke($token);
            Response::unauthorized('That account is no longer active.');
        }

        return [$token, $session, $admin];
    }

    /**
     * Require a named permission, or answer 403 and stop.
     *
     * @param array<string, mixed> $admin
     */
    protected function requirePermission(array $admin, string $permission): void
    {
        $granted = array_values((array) ($admin['permissions'] ?? []));

        if (!in_array($permission, $granted, true)) {
            Response::error(
                'Your role does not have access to that.',
                403,
                ['permission' => ['Requires the "' . $permission . '" permission.']]
            );
        }
    }
}
