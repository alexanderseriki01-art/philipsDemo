/* Custom scroll-driven animations
   1) .reveal elements fade-up via IntersectionObserver
   2) Counter animation for stats with data-count attribute
   3) Auto-cycling sticky showcase (4 stages, 5s each)
   4) Nav becomes 'scrolled' when window scrolled
*/

(function () {
    // ── 1. Reveal on scroll ─────────────────────────────────────────────
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add('in');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
        reveals.forEach((el) => io.observe(el));
    }

    // ── 2. Counter animation ────────────────────────────────────────────
    function animateCount(el) {
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const prefix = el.dataset.prefix || '';
        const decimals = parseInt(el.dataset.decimals || '0', 10);
        const duration = parseInt(el.dataset.duration || '1600', 10);
        const start = performance.now();
        function step(now) {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = target * eased;
            el.textContent = prefix + val.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    const counters = document.querySelectorAll('[data-count]');
    if (counters.length) {
        const cio = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    animateCount(e.target);
                    cio.unobserve(e.target);
                }
            });
        }, { threshold: 0.5 });
        counters.forEach((c) => cio.observe(c));
    }

    // ── 3. Deck-of-cards carousel ──────────────────────────────────────
    const deck = document.querySelector('.deck');
    if (deck) {
        const cards = Array.from(deck.querySelectorAll('.deck-card'));
        const total = cards.length;
        const curEl = document.querySelector('.deck-counter .cur');
        const totalEl = document.querySelector('.deck-counter .total');
        const dotsWrap = document.querySelector('.deck-dots');
        let active = 0;
        let deckTimer = null;
        const DECK_CYCLE = 5800;

        // Build dots
        if (dotsWrap) {
            for (let i = 0; i < total; i++) {
                const d = document.createElement('button');
                d.className = 'deck-dot' + (i === 0 ? ' active' : '');
                d.setAttribute('aria-label', `Programme ${i + 1}`);
                d.addEventListener('click', () => { go(i); resetTimer(); });
                dotsWrap.appendChild(d);
            }
        }
        if (totalEl) totalEl.textContent = String(total).padStart(2, '0');

        function render() {
            cards.forEach((card, i) => {
                const offset = (i - active + total) % total;
                if (offset < 5) {
                    card.dataset.pos = offset;
                } else {
                    card.dataset.pos = 'hidden';
                }
            });
            if (curEl) curEl.textContent = String(active + 1).padStart(2, '0');
            if (dotsWrap) {
                dotsWrap.querySelectorAll('.deck-dot').forEach((d, i) => {
                    d.classList.toggle('active', i === active);
                });
            }
        }

        function go(i) { active = ((i % total) + total) % total; render(); }
        function next() { go(active + 1); }
        function prev() { go(active - 1); }

        function startTimer() {
            stopTimer();
            deckTimer = setInterval(next, DECK_CYCLE);
        }
        function stopTimer() {
            if (deckTimer) { clearInterval(deckTimer); deckTimer = null; }
        }
        function resetTimer() { startTimer(); }

        // Wire up arrow controls
        document.querySelectorAll('[data-deck-prev]').forEach((b) =>
            b.addEventListener('click', () => { prev(); resetTimer(); }));
        document.querySelectorAll('[data-deck-next]').forEach((b) =>
            b.addEventListener('click', () => { next(); resetTimer(); }));

        // Click the top card to advance
        cards.forEach((card) => {
            card.addEventListener('click', (e) => {
                // Don't intercept clicks on links/buttons inside the card
                if (e.target.closest('a, button')) return;
                if (card.dataset.pos === '0') { next(); resetTimer(); }
                else {
                    const idx = cards.indexOf(card);
                    go(idx); resetTimer();
                }
            });
        });

        const shell = document.querySelector('.deck-shell');
        if (shell) {
            shell.addEventListener('mouseenter', stopTimer);
            shell.addEventListener('mouseleave', startTimer);
        }

        // Keyboard navigation
        deck.tabIndex = 0;
        deck.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') { next(); resetTimer(); }
            else if (e.key === 'ArrowLeft') { prev(); resetTimer(); }
        });

        // Activate when visible
        if ('IntersectionObserver' in window) {
            const dio = new IntersectionObserver((entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        render();
                        startTimer();
                    } else {
                        stopTimer();
                    }
                });
            }, { threshold: 0.25 });
            dio.observe(deck);
        } else {
            render();
            startTimer();
        }

        render();
    }

    // ── 4. Nav scrolled class ──────────────────────────────────────────
    const nav = document.querySelector('.site-nav');
    if (nav) {
        const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }
})();
