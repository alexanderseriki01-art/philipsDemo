<?php

declare(strict_types=1);

/**
 * Generate a bcrypt hash for config/admins.php.
 *
 *   php bin/hash-password.php 'the-password'
 *
 * Paste the output as 'password_hash' => '...' and delete that account's
 * plaintext 'password' entry.
 */

if (PHP_SAPI !== 'cli') {
    exit("This script runs on the command line only.\n");
}

$password = $argv[1] ?? '';

if ($password === '') {
    fwrite(STDERR, "Usage: php bin/hash-password.php 'the-password'\n");
    exit(1);
}

echo password_hash($password, PASSWORD_BCRYPT), PHP_EOL;
