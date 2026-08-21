<?php

declare(strict_types=1);

/**
 * Demo administrator accounts for the Phillips Consulting TMS.
 *
 * Each entry accepts EITHER:
 *   'password_hash' => '$2y$...'   (preferred — generate with bin/hash-password.php)
 *   'password'      => 'plaintext' (demo convenience only; never for real accounts)
 *
 * When both are present the hash wins. Passwords here gate a demo console with
 * no real participant data behind it; swap in hashes before this is pointed at
 * anything that matters.
 */

return [
    [
        'id' => 'adm_001',
        'name' => 'Tunde Okafor',
        'email' => 'tunde.okafor@phillipsconsulting.net',
        'role' => 'Programme Administrator',
        'permissions' => ['participants', 'trainings', 'attendance', 'payments', 'refunds', 'materials', 'certificates', 'feedback', 'reports', 'settings'],
        'password' => 'passphrase',
    ],
    [
        'id' => 'adm_002',
        'name' => 'Amaka Eze',
        'email' => 'amaka.eze@phillipsconsulting.net',
        'role' => 'Finance Officer',
        'permissions' => ['payments', 'refunds', 'reports'],
        'password' => 'passphrase',
    ],
    [
        'id' => 'adm_003',
        'name' => 'Bola Adeyemi',
        'email' => 'bola.adeyemi@phillipsconsulting.net',
        'role' => 'Training Coordinator',
        'permissions' => ['trainings', 'attendance', 'materials', 'certificates', 'feedback'],
        'password' => 'passphrase',
    ],
];
