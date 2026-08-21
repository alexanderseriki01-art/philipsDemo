<?php

declare(strict_types=1);

namespace Phillips\Tms\Http;

final class Router
{
    /** @var array<string, array<string, callable>> */
    private array $routes = [];

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
        $this->routes[$method]['/' . trim($path, '/')] = $handler;
    }

    public function dispatch(Request $request): never
    {
        $path = $request->path();
        $method = $request->method();

        $handler = $this->routes[$method][$path] ?? null;

        if ($handler !== null) {
            $handler($request);
            Response::error('The handler returned no response.', 500);
        }

        // The path exists but not for this verb — say so rather than a bare 404.
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
        foreach ($this->routes as $verb => $paths) {
            if (isset($paths[$path])) {
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
