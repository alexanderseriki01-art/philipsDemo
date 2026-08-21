<?php

declare(strict_types=1);

namespace Phillips\Tms\Auth;

/**
 * Reads the seeded administrator list from config/admins.php.
 */
final class AdminRepository
{
    /** @var array<int, array<string, mixed>> */
    private array $admins;

    public function __construct(?string $configPath = null)
    {
        $path = $configPath ?? TMS_BASE_PATH . '/config/admins.php';

        $admins = is_file($path) ? require $path : [];
        $this->admins = is_array($admins) ? $admins : [];
    }

    public function findByEmail(string $email): ?array
    {
        $needle = strtolower(trim($email));

        foreach ($this->admins as $admin) {
            if (strtolower((string) ($admin['email'] ?? '')) === $needle) {
                return $admin;
            }
        }

        return null;
    }

    public function findById(string $id): ?array
    {
        foreach ($this->admins as $admin) {
            if ((string) ($admin['id'] ?? '') === $id) {
                return $admin;
            }
        }

        return null;
    }

    /**
     * Verify a password against the account's hash, or its plaintext demo value.
     *
     * Always runs a hash comparison — including when the account does not exist —
     * so response timing does not reveal which emails are registered.
     */
    public function verifyPassword(?array $admin, string $password): bool
    {
        $hash = is_array($admin) ? (string) ($admin['password_hash'] ?? '') : '';

        if ($hash !== '') {
            return password_verify($password, $hash);
        }

        $plain = is_array($admin) ? (string) ($admin['password'] ?? '') : '';

        // Burn equivalent time on the miss path before answering.
        if ($plain === '') {
            password_verify($password, '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30M1MlG5c9y2');

            return false;
        }

        return hash_equals($plain, $password);
    }

    /**
     * The account as the client should see it — never includes credentials.
     */
    public function toPublicArray(array $admin): array
    {
        $name = (string) ($admin['name'] ?? '');

        return [
            'id' => (string) ($admin['id'] ?? ''),
            'name' => $name,
            'email' => (string) ($admin['email'] ?? ''),
            'role' => (string) ($admin['role'] ?? 'Administrator'),
            'initials' => self::initials($name),
            'permissions' => array_values((array) ($admin['permissions'] ?? [])),
        ];
    }

    private static function initials(string $name): string
    {
        $parts = preg_split('/\s+/', trim($name)) ?: [];
        $letters = '';

        foreach ($parts as $part) {
            if ($part !== '') {
                $letters .= strtoupper(substr($part, 0, 1));
            }
            if (strlen($letters) === 2) {
                break;
            }
        }

        return $letters === '' ? 'PC' : $letters;
    }
}
