<?php

declare(strict_types=1);

namespace Phillips\Tms\Http;

final class Router
{
    /** @var array<string, array<string, callable>> */
    private array $routes = [];

    /** @var array<string, array<int, array{segments: string[], handler: callable}>> */
    private array $patterns = [];

    public function get(string $path, callable $handler): void
    {
        $this->add('GET', $path, $handler);
    }

    public function post(string $path, callable $handler): void
    {
        $this->add('POST', $path, $handler);
    }

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
        if ($handler !== null) {
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

    /** @return string[] */
    public function routeList(): array
    {
        $all = [];
        foreach ($this->routes as $verb => $paths) {
            foreach (array_keys($paths) as $path) {
                $all[] = $verb . ' ' . $path;
            }
        }
        sort($all);

        return $all;
    }
}
