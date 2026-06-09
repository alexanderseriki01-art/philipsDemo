/* Landing-page interactions (vanilla).
 * Cursor glow, hero tilt, magnetic CTAs, sticky capability sync,
 * draggable programmes rail, timeline progress. All motion gated by
 * prefers-reduced-motion.
 */
(function () {
    'use strict';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── Hero cursor-follow glow ─────────────────────────────── */
    const hero = document.getElementById('hero');
    if (hero && !reduce) {
        let frame = null;
        hero.addEventListener('pointermove', (e) => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                const r = hero.getBoundingClientRect();
                hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
                hero.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
                frame = null;
            });
        });
    }

    /* ── Hero product-shot tilt ──────────────────────────────── */
    const tilt = document.querySelector('[data-tilt]');
    if (tilt && !reduce && window.matchMedia('(pointer:fine)').matches) {
        const wrap = tilt.parentElement;
        const base = 'rotateY(-9deg) rotateX(4deg)';
        wrap.addEventListener('pointermove', (e) => {
            const r = wrap.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            tilt.style.transform = `rotateY(${-9 + px * 12}deg) rotateX(${4 - py * 12}deg)`;
        });
        wrap.addEventListener('pointerleave', () => { tilt.style.transform = base; });
    }

    /* ── Magnetic buttons ────────────────────────────────────── */
    if (!reduce && window.matchMedia('(pointer:fine)').matches) {
        document.querySelectorAll('[data-magnetic]').forEach((el) => {
            el.style.transition = 'transform 0.25s cubic-bezier(0.22,1,0.36,1)';
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const x = e.clientX - r.left - r.width / 2;
                const y = e.clientY - r.top - r.height / 2;
                el.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
            });
            el.addEventListener('pointerleave', () => { el.style.transform = ''; });
        });
    }

    /* ── Capabilities: sticky list <-> panel sync ────────────── */
    const items = Array.from(document.querySelectorAll('.cap-item'));
    const panels = Array.from(document.querySelectorAll('[data-cap-panel]'));
    if (items.length && panels.length) {
        items.forEach((it) => it.addEventListener('click', () => {
            const i = it.dataset.cap;
            const panel = document.getElementById('cap-' + i);
            if (panel) panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        }));
        const setActive = (i) => items.forEach((it) => it.classList.toggle('active', it.dataset.cap === String(i)));
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.dataset.capPanel); });
        }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
        panels.forEach((p) => io.observe(p));
    }

    /* ── Timeline progress fill (no scroll listener) ─────────── */
    const flowLine = document.getElementById('flowLine');
    const steps = Array.from(document.querySelectorAll('.flow-step'));
    if (flowLine && steps.length) {
        const fill = flowLine.querySelector('.fill');
        let reached = 0;
        const setProg = () => { fill.style.height = (reached / steps.length) * 100 + '%'; };
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    const idx = steps.indexOf(e.target) + 1;
                    if (idx > reached) { reached = idx; setProg(); }
                }
            });
        }, { rootMargin: '0px 0px -40% 0px', threshold: 0 });
        steps.forEach((s) => io.observe(s));
    }

    /* ── Programmes: drag-scroll + arrows + progress ─────────── */
    const rail = document.getElementById('progRail');
    if (rail) {
        const bar = document.getElementById('progBar');
        const card = rail.querySelector('.pcard');
        const step = card ? card.offsetWidth + 22 : 360;

        const updateBar = () => {
            if (!bar) return;
            const max = rail.scrollWidth - rail.clientWidth;
            const pct = max > 0 ? rail.scrollLeft / max : 0;
            bar.style.width = Math.max(12, 12 + pct * 88) + '%';
        };
        rail.addEventListener('scroll', updateBar, { passive: true });
        updateBar();

        const prev = document.getElementById('progPrev');
        const next = document.getElementById('progNext');
        if (prev) prev.addEventListener('click', () => rail.scrollBy({ left: -step, behavior: 'smooth' }));
        if (next) next.addEventListener('click', () => rail.scrollBy({ left: step, behavior: 'smooth' }));

        // Pointer drag (mouse). Touch uses native momentum scroll.
        let down = false, startX = 0, startLeft = 0, moved = 0;
        rail.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return;
            down = true; moved = 0;
            startX = e.clientX; startLeft = rail.scrollLeft;
            rail.setPointerCapture(e.pointerId);
        });
        rail.addEventListener('pointermove', (e) => {
            if (!down) return;
            const dx = e.clientX - startX;
            moved = Math.abs(dx);
            if (moved > 5) rail.classList.add('dragging');
            rail.scrollLeft = startLeft - dx;
        });
        const end = () => { down = false; setTimeout(() => rail.classList.remove('dragging'), 0); };
        rail.addEventListener('pointerup', end);
        rail.addEventListener('pointercancel', end);
    }
})();
