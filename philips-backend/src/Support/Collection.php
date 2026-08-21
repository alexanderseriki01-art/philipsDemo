<?php

declare(strict_types=1);

namespace Phillips\Tms\Support;

/**
 * A list of records kept in one JSON file.
 *
 * Tokens use one file per record because they are looked up by key and expire
 * independently. Programmes and enrolments are listed far more often than they
 * are fetched by id, and there are tens of them rather than thousands, so a
 * single array per collection is simpler and cheaper.
 *
 * Writes are read-modify-write. JsonStore commits atomically via a temp file
 * and rename, so a reader never sees a half-written file, but two concurrent
 * writers can still lose one update. Acceptable at demo scale, and the reason
 * this is not a general-purpose store.
 */
final class Collection
{
    private JsonStore $store;

    public function __construct(private string $name, ?string $directory = null)
    {
        $this->store = new JsonStore($directory ?? TMS_BASE_PATH . '/storage/data');
    }

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        $data = $this->store->get($this->name);
        $records = $data['records'] ?? null;

        return is_array($records) ? array_values($records) : [];
    }

    public function isEmpty(): bool
    {
        return $this->all() === [];
    }

    public function find(string $id): ?array
    {
        foreach ($this->all() as $record) {
            if (($record['id'] ?? null) === $id) {
                return $record;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    public function insert(array $record, string $prefix): array
    {
        $record['id'] = $record['id'] ?? $prefix . '_' . bin2hex(random_bytes(5));
        $record['created_at'] = $record['created_at'] ?? gmdate('c');

        $records = $this->all();
        $records[] = $record;
        $this->write($records);

        return $record;
    }

    public function update(string $id, array $patch): ?array
    {
        $records = $this->all();
        $updated = null;

        foreach ($records as $i => $record) {
            if (($record['id'] ?? null) === $id) {
                unset($patch['id'], $patch['created_at']);
                $updated = array_merge($record, $patch);
                $updated['updated_at'] = gmdate('c');
                $records[$i] = $updated;
                break;
            }
        }

        if ($updated === null) {
            return null;
        }

        $this->write($records);

        return $updated;
    }

    public function replaceAll(array $records): void
    {
        $this->write(array_values($records));
    }

    private function write(array $records): void
    {
        $this->store->put($this->name, ['records' => $records]);
    }
}
