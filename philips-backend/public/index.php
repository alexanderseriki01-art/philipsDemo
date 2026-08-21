<?php

declare(strict_types=1);

/**
 * Phillips Consulting TMS — temporary demo API.
 *
 * Front controller. Every request lands here; nginx rewrites all paths to this
 * file. Routes are declared inline because the surface is deliberately small and
 * temporary — endpoints get added here as the demo needs them.
 */

require __DIR__ . '/../src/bootstrap.php';

use Phillips\Tms\Controllers\AdminAuthController;
use Phillips\Tms\Controllers\ParticipantController;
use Phillips\Tms\Http\Request;
use Phillips\Tms\Http\Response;
use Phillips\Tms\Http\Router;

$request = Request::capture();

Response::applyCors($request);

if ($request->method() === 'OPTIONS') {
    Response::noContent();
}

$router = new Router();
$adminAuth = new AdminAuthController();
$participants = new ParticipantController();

/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

$router->get('/api/health', static function () use (&$router): never {
    Response::ok([
        'status' => 'healthy',
        'service' => 'phillips-tms-api',
        'time' => gmdate('c'),
        'routes' => $router->routeList(),
    ], 'Service is up.');
});

/*
|--------------------------------------------------------------------------
| Admin authentication
|--------------------------------------------------------------------------
*/

$router->post('/api/v1/admin/auth/login', [$adminAuth, 'login']);
$router->get('/api/v1/admin/auth/me', [$adminAuth, 'me']);
$router->post('/api/v1/admin/auth/refresh', [$adminAuth, 'refresh']);
$router->post('/api/v1/admin/auth/logout', [$adminAuth, 'logout']);
$router->post('/api/v1/admin/auth/forgot-password', [$adminAuth, 'forgotPassword']);

/*
|--------------------------------------------------------------------------
| Participants
|--------------------------------------------------------------------------
*/

$router->post('/api/v1/admin/participants/invite', [$participants, 'invite']);

$router->dispatch($request);
