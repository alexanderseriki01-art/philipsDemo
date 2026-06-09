/* Phillips Consulting TMS — frontend-only demo data store.
 *
 * No backend. Admin pages write, portal pages read. Everything persists in
 * localStorage under the `pcl.` namespace, shared across pages in one browser.
 *
 *   Add mode (new records):
 *     Store.list(type)          -> array, newest first
 *     Store.add(type, record)   -> saves with id/createdAt/isNew, returns it
 *
 *   Override mode (status patches on existing static rows, keyed by data-id):
 *     Store.patch(entity, id, patch)
 *     Store.overrides(entity)   -> { id: {...patch} }
 *     Store.override(entity, id)-> {...patch} | null
 *
 *   Store.reset()               -> clears all pcl.* keys
 */
(function (global) {
    'use strict';

    var NS = 'pcl.';
    var ADD_TYPES = ['trainings', 'materials', 'certificates', 'announcements', 'participants'];

    // In-memory fallback when localStorage is unavailable (private mode, etc.)
    var mem = {};
    var hasLS = (function () {
        try {
            var k = NS + '__t';
            global.localStorage.setItem(k, '1');
            global.localStorage.removeItem(k);
            return true;
        } catch (e) {
            return false;
        }
    })();

    function read(key) {
        var raw = hasLS ? global.localStorage.getItem(key) : mem[key];
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function write(key, value) {
        var raw = JSON.stringify(value);
        if (hasLS) {
            try {
                global.localStorage.setItem(key, raw);
            } catch (e) {
                mem[key] = raw; // quota exceeded -> degrade to memory
            }
        } else {
            mem[key] = raw;
        }
    }

    function uid() {
        // Date.now is fine in the browser runtime.
        return 'id_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
    }

    var Store = {
        list: function (type) {
            var arr = read(NS + type);
            return Array.isArray(arr) ? arr : [];
        },

        add: function (type, record) {
            var arr = this.list(type);
            var saved = Object.assign({}, record, {
                id: record && record.id ? record.id : uid(),
                createdAt: Date.now(),
                isNew: true
            });
            arr.unshift(saved); // newest first
            write(NS + type, arr);
            return saved;
        },

        overrides: function (entity) {
            var map = read(NS + 'overrides.' + entity);
            return map && typeof map === 'object' ? map : {};
        },

        override: function (entity, id) {
            var map = this.overrides(entity);
            return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
        },

        patch: function (entity, id, patch) {
            var map = this.overrides(entity);
            map[id] = Object.assign({}, map[id], patch);
            write(NS + 'overrides.' + entity, map);
            return map[id];
        },

        reset: function () {
            if (hasLS) {
                var kill = [];
                for (var i = 0; i < global.localStorage.length; i++) {
                    var k = global.localStorage.key(i);
                    if (k && k.indexOf(NS) === 0) kill.push(k);
                }
                kill.forEach(function (k) { global.localStorage.removeItem(k); });
            }
            mem = {};
        },

        // expose for callers that want to iterate the known add-types
        TYPES: ADD_TYPES.slice()
    };

    global.Store = Store;
})(window);
