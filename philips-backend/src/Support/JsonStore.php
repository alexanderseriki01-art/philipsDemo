<?php

declare(strict_types=1);

namespace Phillips\Tms\Support;

/**
 * Flat-file JSON storage. Deliberately not a database: these are temporary demo
 * endpoints, so the service must run by copying a directory — no migrations, no
 * MySQL credentials, nothing shared with the inspirtag stack on the same host.
 */
final class JsonStore
{
    public function __construct(private string $directory)
    {
        if (!is_dir($this->directory)) {
            mkdir($this->directory, 0775, true);
        }
    }

    private function pathFor(string $key): string
    {
        // Keys are hashes or slugs; hard-fail on anything that could walk the path.
        if (preg_match('/^[A-Za-z0-9._-]+$/', $key) !== 1) {
            throw new \InvalidArgumentException('Invalid store key.');
        }

        return rtrim($this->directory, '/\\') . '/' . $key . '.json';
    }

    public function get(string $key): ?array
    {
        $path = $this->pathFor($key);
        if (!is_file($path)) {
            return null;
        }

        $raw = file_get_contents($path);
        if ($raw === false || trim($raw) === '') {
            return null;
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    public function put(string $key, array $value): void
    {
        $path = $this->pathFor($key);
        $encoded = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        if ($encoded === false) {
            throw new \RuntimeException('Could not encode store payload.');
        }

        // Write to a sibling temp file then rename, so a concurrent reader never
        // sees a half-written file.
        $temp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($temp, $encoded, LOCK_EX) === false) {
            throw new \RuntimeException('Could not write to the store.');
        }

        if (!rename($temp, $path)) {
            @unlink($temp);
            throw new \RuntimeException('Could not commit the store write.');
        }

        @chmod($path, 0664);
    }

    public function forget(string $key): void
    {
        $path = $this->pathFor($key);
        if (is_file($path)) {
            @unlink($path);
        }
    }

    /**
     * Delete every record whose `expires_at` is in the past. Called opportunistically
     * on writes so the directory does not grow without bound.
     */
    public function purgeExpired(): void
    {
        $files = glob(rtrim($this->directory, '/\\') . '/*.json');
        if ($files === false) {
            return;
        }

        $now = time();
        foreach ($files as $file) {
            $raw = file_get_contents($file);
            if ($raw === false) {
                continue;
            }

            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                @unlink($file);
                continue;
            }

            if (isset($decoded['expires_at']) && (int) $decoded['expires_at'] < $now) {
                @unlink($file);
            }
        }
    }
}
