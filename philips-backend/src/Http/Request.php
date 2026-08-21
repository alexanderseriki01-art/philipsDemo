<?php

declare(strict_types=1);

namespace Phillips\Tms\Http;

final class Request
{
    private function __construct(
        private string $method,
        private string $path,
        private array $body,
        private array $headers,
        private string $ip
    ) {
    }

    public static function capture(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH);
        $path = is_string($path) ? $path : '/';

        // Normalise: strip any deploy sub-path prefix and the trailing slash, so
        // /api/v1/... and /tms/api/v1/.../ both resolve to the same route.
        $prefix = \Phillips\Tms\Support\Env::get('APP_PATH_PREFIX', '');
        if (is_string($prefix) && $prefix !== '' && str_starts_with($path, $prefix)) {
            $path = substr($path, strlen($prefix));
        }
        $path = '/' . trim($path, '/');

        return new self($method, $path, self::parseBody(), self::parseHeaders(), self::clientIp());
    }

    private static function parseBody(): array
    {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';

        if (stripos($contentType, 'application/json') !== false) {
            $raw = file_get_contents('php://input');
            if ($raw === false || trim($raw) === '') {
                return [];
            }

            $decoded = json_decode($raw, true);

            return is_array($decoded) ? $decoded : [];
        }

        // Form posts and query strings both feed the same accessor.
        return array_merge($_GET, $_POST);
    }

    private static function parseHeaders(): array
    {
        $headers = [];

        foreach ($_SERVER as $key => $value) {
            if (str_starts_with((string) $key, 'HTTP_')) {
                $name = strtolower(str_replace('_', '-', substr((string) $key, 5)));
                $headers[$name] = (string) $value;
            }
        }

        // Some FPM setups expose the auth header only under this name.
        if (!isset($headers['authorization']) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['authorization'] = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }

        return $headers;
    }

    private static function clientIp(): string
    {
        // The service sits behind the host nginx, so the forwarded header is the
        // real client. Take the left-most entry.
        $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if (is_string($forwarded) && $forwarded !== '') {
            $first = trim(explode(',', $forwarded)[0]);
            if ($first !== '') {
                return $first;
            }
        }

        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public function method(): string
    {
        return $this->method;
    }

    public function path(): string
    {
        return $this->path;
    }

    public function ip(): string
    {
        return $this->ip;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    public function string(string $key, string $default = ''): string
    {
        $value = $this->input($key, $default);

        return is_scalar($value) ? trim((string) $value) : $default;
    }

    public function boolean(string $key, bool $default = false): bool
    {
        $value = $this->input($key);
        if ($value === null) {
            return $default;
        }
        if (is_bool($value)) {
            return $value;
        }

        return in_array(strtolower((string) $value), ['1', 'true', 'yes', 'on'], true);
    }

    public function all(): array
    {
        return $this->body;
    }

    public function header(string $name, string $default = ''): string
    {
        return $this->headers[strtolower($name)] ?? $default;
    }

    public function bearerToken(): ?string
    {
        $header = $this->header('authorization');
        if ($header === '' || stripos($header, 'bearer ') !== 0) {
            return null;
        }

        $token = trim(substr($header, 7));

        return $token === '' ? null : $token;
    }

    public function userAgent(): string
    {
        return $this->header('user-agent', 'unknown');
    }

    public function origin(): string
    {
        return $this->header('origin');
    }
}
