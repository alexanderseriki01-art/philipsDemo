<?php

declare(strict_types=1);

namespace Phillips\Tms\Http;

use Phillips\Tms\Support\Env;

/**
 * JSON responses in the same envelope the colat API uses:
 * { success, message, data } / { success, message, errors }.
 */
final class Response
{
    public static function applyCors(Request $request): void
    {
        $allowed = Env::csv('CORS_ALLOWED_ORIGINS', ['*']);
        $origin = $request->origin();

        if (in_array('*', $allowed, true)) {
            // No cookies are used (auth is a Bearer token), so a wildcard is safe.
            header('Access-Control-Allow-Origin: *');
        } elseif ($origin !== '' && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, X-Requested-With, Origin');
        header('Access-Control-Max-Age: 3600');
    }

    public static function json(array $payload, int $status = 200, array $headers = []): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');

        foreach ($headers as $name => $value) {
            header($name . ': ' . $value);
        }

        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function ok(array $data = [], string $message = 'OK', int $status = 200): never
    {
        self::json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $status);
    }

    public static function error(string $message, int $status = 400, ?array $errors = null): never
    {
        $payload = [
            'success' => false,
            'message' => $message,
        ];

        if ($errors !== null) {
            $payload['errors'] = $errors;
        }

        self::json($payload, $status);
    }

    public static function validation(array $errors, string $message = 'Validation errors'): never
    {
        self::error($message, 422, $errors);
    }

    public static function unauthorized(string $message = 'Unauthenticated.'): never
    {
        self::error($message, 401);
    }

    public static function notFound(string $message = 'Endpoint not found.'): never
    {
        self::error($message, 404);
    }

    public static function noContent(): never
    {
        http_response_code(204);
        exit;
    }
}
