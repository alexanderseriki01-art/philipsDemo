<?php

declare(strict_types=1);

use Phillips\Tms\Http\Router;

test('router matches a static path exactly', function () {
    $router = new Router();
    $router->get('/api/health', function () {});
    assertSame(['GET /api/health'], $router->routeList(), 'static route registered');
});

test('router extracts a single path parameter', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}', function () {});
    $match = $router->match('GET', '/api/v1/admin/programmes/prg_8f2a');
    assertTrue($match !== null, 'pattern matched');
    assertSame(['id' => 'prg_8f2a'], $match['params'], 'param captured');
});

test('router extracts a parameter from the middle of a path', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}/enrolments', function () {});
    $match = $router->match('GET', '/api/v1/admin/programmes/prg_1/enrolments');
    assertTrue($match !== null, 'pattern matched');
    assertSame(['id' => 'prg_1'], $match['params'], 'param captured');
});

test('router prefers a static route over a pattern', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}', function () { return 'pattern'; });
    $router->get('/api/v1/admin/programmes/summary', function () { return 'static'; });
    $match = $router->match('GET', '/api/v1/admin/programmes/summary');
    assertSame([], $match['params'], 'static match carries no params');
});

test('router does not match a different segment count', function () {
    $router = new Router();
    $router->get('/api/v1/admin/programmes/{id}', function () {});
    assertNull($router->match('GET', '/api/v1/admin/programmes/prg_1/enrolments'), 'too many segments');
    assertNull($router->match('GET', '/api/v1/admin/programmes'), 'too few segments');
});

test('router does not match the wrong verb', function () {
    $router = new Router();
    $router->post('/api/v1/admin/programmes/{id}', function () {});
    assertNull($router->match('GET', '/api/v1/admin/programmes/prg_1'), 'verb must match');
});
