/* Generic, frontend-only row filtering for .filter-bar chips.
 *
 * Markup contract:
 *   - Chips live in a `.filter-bar`. Each chip may carry `data-filter="active"`
 *     (falls back to its lowercased text). The value `all` shows everything.
 *   - Filterable rows carry `data-status="active paid"` (space-separated tokens,
 *     case-insensitive). A row matches when its tokens include the chip value.
 *   - Rows are searched within the filter bar's enclosing `.page-content`
 *     (or document if none). Anything without `data-status` is left untouched.
 *
 * Auto-initialises on DOMContentLoaded; also exposed as window.initFilters().
 */
(function (global) {
    'use strict';

    function tokens(el) {
        return (el.getAttribute('data-status') || '')
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
    }

    function chipValue(chip) {
        var v = chip.getAttribute('data-filter');
        if (v) return v.toLowerCase();
        return chip.textContent.trim().toLowerCase();
    }

    function applyFilter(scope, value) {
        var rows = scope.querySelectorAll('[data-status]');
        rows.forEach(function (row) {
            var show = value === 'all' || tokens(row).indexOf(value) !== -1;
            row.style.display = show ? '' : 'none';
        });
    }

    function wireBar(bar) {
        var scope = bar.closest('.page-content') || document;
        var chips = bar.querySelectorAll('.filter-chip');
        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                chips.forEach(function (c) { c.classList.remove('active'); });
                chip.classList.add('active');
                applyFilter(scope, chipValue(chip));
            });
        });
    }

    function initFilters() {
        document.querySelectorAll('.filter-bar').forEach(wireBar);
    }

    global.initFilters = initFilters;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFilters);
    } else {
        initFilters();
    }
})(window);
