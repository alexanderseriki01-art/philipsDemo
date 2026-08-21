<?php

declare(strict_types=1);

/**
 * Phillips Consulting TMS — temporary demo API.
 *
 * Zero-dependency bootstrap: a small PSR-4 autoloader plus .env loading, so the
 * service can be deployed by copying the directory. There is no `composer
 * install` step and no database.
 */

define('TMS_BASE_PATH', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    $prefix = 'Phillips\\Tms\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $path = TMS_BASE_PATH . '/src/' . str_replace('\\', '/', $relative) . '.php';

    if (is_file($path)) {
        require $path;
    }
});

\Phillips\Tms\Support\Env::load(TMS_BASE_PATH . '/.env');

date_default_timezone_set(\Phillips\Tms\Support\Env::get('APP_TIMEZONE', 'Africa/Lagos'));

// The API always answers in JSON, including on fatal errors. Without this a PHP
// warning would leak an HTML error page into a response the client parses as JSON.
$debug = \Phillips\Tms\Support\Env::bool('APP_DEBUG', false);
ini_set('display_errors', $debug ? '1' : '0');
error_reporting(E_ALL);

set_exception_handler(static function (\Throwable $e) use ($debug): void {
    error_log('[tms-api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());

    \Phillips\Tms\Http\Response::error(
        'Something went wrong on our end.',
        500,
        $debug ? ['exception' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()] : null
    );
});

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if ((error_reporting() & $severity) === 0) {
        return false;
    }
    throw new \ErrorException($message, 0, $severity, $file, $line);
});
