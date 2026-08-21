<?php

declare(strict_types=1);

use Phillips\Tms\Support\Collection;

function fresh_collection(string $name): Collection
{
    $dir = sys_get_temp_dir() . '/tms_test_' . bin2hex(random_bytes(4));
    return new Collection($name, $dir);
}

test('a new collection is empty', function () {
    $c = fresh_collection('programmes');
    assertTrue($c->isEmpty(), 'starts empty');
    assertSame([], $c->all(), 'no records');
});

test('insert assigns a prefixed id and returns the record', function () {
    $c = fresh_collection('programmes');
    $saved = $c->insert(['title' => 'Negotiation Mastery'], 'prg');
    assertTrue(str_starts_with($saved['id'], 'prg_'), 'id is prefixed');
    assertSame('Negotiation Mastery', $saved['title'], 'field preserved');
    assertSame(1, count($c->all()), 'one record stored');
});

test('find returns a stored record and null for a miss', function () {
    $c = fresh_collection('programmes');
    $saved = $c->insert(['title' => 'A'], 'prg');
    assertSame('A', $c->find($saved['id'])['title'], 'found by id');
    assertNull($c->find('prg_nope'), 'unknown id returns null');
});

test('update merges a patch and leaves other fields alone', function () {
    $c = fresh_collection('programmes');
    $saved = $c->insert(['title' => 'A', 'seats' => 40], 'prg');
    $updated = $c->update($saved['id'], ['seats' => 50]);
    assertSame(50, $updated['seats'], 'patched field changed');
    assertSame('A', $updated['title'], 'untouched field preserved');
});

test('update returns null for an unknown id', function () {
    $c = fresh_collection('programmes');
    assertNull($c->update('prg_nope', ['seats' => 1]), 'unknown id');
});

test('records survive a new Collection over the same directory', function () {
    $dir = sys_get_temp_dir() . '/tms_test_' . bin2hex(random_bytes(4));
    $first = new Collection('programmes', $dir);
    $first->insert(['title' => 'Persisted'], 'prg');
    $second = new Collection('programmes', $dir);
    assertSame(1, count($second->all()), 'read back from disk');
});
