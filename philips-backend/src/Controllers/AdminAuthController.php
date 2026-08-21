<?php

declare(strict_types=1);

namespace Phillips\Tms\Controllers;

use Phillips\Tms\Auth\AdminRepository;
use Phillips\Tms\Auth\AuthenticatesAdmin;
use Phillips\Tms\Auth\LoginThrottle;
use Phillips\Tms\Auth\TokenGuard;
use Phillips\Tms\Http\Request;
use Phillips\Tms\Http\Response;

/**
 * Administrator authentication for the Phillips Consulting TMS console.
 */
final class AdminAuthController
{
    use AuthenticatesAdmin;

    public function __construct(
        private AdminRepository $admins = new AdminRepository(),
        private TokenGuard $tokens = new TokenGuard(),
        private LoginThrottle $throttle = new LoginThrottle()
    ) {
    }

    /**
     * POST /api/v1/admin/auth/login
     */
    public function login(Request $request): never
    {
        $email = $request->string('email');
        $password = (string) $request->input('password', '');

        $errors = [];
        if ($email === '') {
            $errors['email'] = ['The email field is required.'];
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = ['Enter a valid email address.'];
        }
        if ($password === '') {
            $errors['password'] = ['The password field is required.'];
        }

        if ($errors !== []) {
            Response::validation($errors);
        }

        $retryAfter = $this->throttle->retryAfter($request->ip(), $email);
        if ($retryAfter > 0) {
            Response::json([
                'success' => false,
                'message' => sprintf('Too many sign-in attempts. Try again in %d seconds.', $retryAfter),
                'errors' => ['email' => ['Too many sign-in attempts.']],
            ], 429, ['Retry-After' => (string) $retryAfter]);
        }

        $admin = $this->admins->findByEmail($email);

        // Evaluated before the null check rather than inside it: verifyPassword
        // burns equivalent time on a missing account, so a wrong email and a
        // wrong password are indistinguishable to the caller. Short-circuiting
        // on $admin === null here would leak which addresses exist.
        $passwordMatches = $this->admins->verifyPassword($admin, $password);

        if ($admin === null || !$passwordMatches) {
            $this->throttle->recordFailure($request->ip(), $email);
            Response::error('Those credentials do not match our records.', 401, [
                'email' => ['Invalid email or password.'],
            ]);
        }

        $this->throttle->clear($request->ip(), $email);

        $issued = $this->tokens->issue($admin, $request->userAgent(), $request->ip());

        Response::ok([
            'token' => $issued['token'],
            'token_type' => 'Bearer',
            'expires_in' => $issued['expires_in'],
            'expires_at' => gmdate('c', $issued['expires_at']),
            'admin' => $this->admins->toPublicArray($admin),
        ], 'Signed in successfully.');
    }

    /**
     * GET /api/v1/admin/auth/me
     */
    public function me(Request $request): never
    {
        [$token, $session, $admin] = $this->authenticate($request);

        $this->tokens->touch($token, $session);

        Response::ok([
            'admin' => $this->admins->toPublicArray($admin),
            'session' => [
                'issued_at' => gmdate('c', (int) $session['issued_at']),
                'expires_at' => gmdate('c', (int) $session['expires_at']),
                'expires_in' => max(0, (int) $session['expires_at'] - time()),
            ],
        ], 'Authenticated.');
    }

    /**
     * POST /api/v1/admin/auth/refresh
     */
    public function refresh(Request $request): never
    {
        [$token, , $admin] = $this->authenticate($request);

        $issued = $this->tokens->rotate($token, $admin, $request->userAgent(), $request->ip());

        Response::ok([
            'token' => $issued['token'],
            'token_type' => 'Bearer',
            'expires_in' => $issued['expires_in'],
            'expires_at' => gmdate('c', $issued['expires_at']),
            'admin' => $this->admins->toPublicArray($admin),
        ], 'Session refreshed.');
    }

    /**
     * POST /api/v1/admin/auth/logout
     */
    public function logout(Request $request): never
    {
        $token = $request->bearerToken();

        // Signing out is idempotent: an already-dead token still reports success
        // so the console can always clear its local state.
        if ($token !== null) {
            $this->tokens->revoke($token);
        }

        Response::ok([], 'Signed out.');
    }

    /**
     * POST /api/v1/admin/auth/forgot-password
     *
     * Placeholder while there is no mail transport on this host. It never reveals
     * whether the address belongs to an account.
     */
    public function forgotPassword(Request $request): never
    {
        $email = $request->string('email');

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::validation(['email' => ['Enter a valid email address.']]);
        }

        Response::ok([
            'delivery' => 'not-configured',
        ], 'If that address belongs to an administrator, a reset link is on its way.');
    }
}
