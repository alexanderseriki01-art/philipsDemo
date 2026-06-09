/* Admin dashboard: login transition, chart drawing, sidebar nav */

(function () {
    // Login flow → reveal app
    const loginForm = document.getElementById('admin-login-form');
    const loginScreen = document.getElementById('admin-login');
    const app = document.getElementById('admin-app');

    const AUTH_KEY = 'pcl.adminAuth';

    function revealApp() {
        if (!app) return;
        if (loginScreen) loginScreen.style.display = 'none';
        app.classList.add('active');
        window.scrollTo(0, 0);
        drawLineChart();
        animateDonut();
        animateProgressBars();
        animateCounters();
    }

    // Already signed in this session? Skip the login screen (fixes the
    // "Overview re-shows login" bug when navigating back to index.html).
    let authed = false;
    try { authed = sessionStorage.getItem(AUTH_KEY) === '1'; } catch (e) {}

    if (loginForm && app && loginScreen) {
        if (authed) {
            revealApp();
        } else {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (err) {}
                loginScreen.style.transition = 'opacity .35s ease, transform .35s ease';
                loginScreen.style.opacity = '0';
                loginScreen.style.transform = 'scale(0.98)';
                setTimeout(revealApp, 360);
            });
        }
    }

    // Signing out (any "Back to site" link) clears the session flag.
    document.querySelectorAll('a[href="../"], a[href="../index.html"], [data-signout]').forEach((a) => {
        a.addEventListener('click', () => {
            try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
        });
    });

    // Sidebar nav now uses real .html links; no click hijack.

    // Counter animation (admin stats)
    function animateCounters() {
        document.querySelectorAll('[data-count]').forEach((el) => {
            if (el.dataset.done === '1') return;
            el.dataset.done = '1';
            const target = parseFloat(el.dataset.count);
            const decimals = parseInt(el.dataset.decimals || '0', 10);
            const suffix = el.dataset.suffix || '';
            const prefix = el.dataset.prefix || '';
            const dur = 1400;
            const start = performance.now();
            function step(now) {
                const p = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                const v = target * eased;
                el.textContent = prefix + v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
                if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        });
    }

    // Donut animation via CSS variable
    function animateDonut() {
        const donut = document.querySelector('.donut');
        if (!donut) return;
        const target = parseFloat(donut.dataset.percent || '86');
        const dur = 1400;
        const start = performance.now();
        function step(now) {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            donut.style.setProperty('--p', (target * eased).toFixed(1));
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // Progress bars
    function animateProgressBars() {
        document.querySelectorAll('.progress > span[data-w]').forEach((el) => {
            requestAnimationFrame(() => { el.style.width = el.dataset.w + '%'; });
        });
    }

    // Line chart (revenue / enrolment)
    function drawLineChart() {
        const svg = document.getElementById('revenue-chart');
        if (!svg) return;

        const series = [12, 19, 15, 24, 28, 22, 31, 34, 30, 38, 42, 48];
        const compare = [8, 14, 13, 18, 22, 20, 24, 26, 28, 30, 33, 36];
        const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        const W = svg.clientWidth;
        const H = 220;
        const pad = { l: 36, r: 16, t: 16, b: 32 };
        const innerW = W - pad.l - pad.r;
        const innerH = H - pad.t - pad.b;

        const max = Math.max(...series, ...compare) * 1.1;
        const xs = (i) => pad.l + (i / (series.length - 1)) * innerW;
        const ys = (v) => pad.t + innerH - (v / max) * innerH;

        const pathFrom = (data) =>
            data.map((v, i) => (i === 0 ? 'M' : 'L') + xs(i) + ',' + ys(v)).join(' ');

        const areaFrom = (data) =>
            pathFrom(data) + ` L${xs(data.length - 1)},${pad.t + innerH} L${xs(0)},${pad.t + innerH} Z`;

        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.innerHTML = `
            <defs>
                <linearGradient id="grad-blue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#2f6bf2" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="#2f6bf2" stop-opacity="0" />
                </linearGradient>
            </defs>
            ${[0,0.25,0.5,0.75,1].map(p =>
                `<line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + innerH * p}" y2="${pad.t + innerH * p}" stroke="#e3eaf3" stroke-width="1"/>`
            ).join('')}
            <path d="${areaFrom(series)}" fill="url(#grad-blue)" />
            <path d="${pathFrom(compare)}" fill="none" stroke="#b8d0ff" stroke-width="1.5" stroke-dasharray="4 4" />
            <path d="${pathFrom(series)}" fill="none" stroke="#1f54d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="series-path" />
            ${series.map((v, i) =>
                `<circle cx="${xs(i)}" cy="${ys(v)}" r="3" fill="#fff" stroke="#1f54d4" stroke-width="1.5" />`
            ).join('')}
            ${labels.map((l, i) =>
                `<text x="${xs(i)}" y="${H - 10}" text-anchor="middle" font-size="10" font-family="Manrope, system-ui, sans-serif" fill="#8c9bb4">${l}</text>`
            ).join('')}
        `;

        const path = document.getElementById('series-path');
        if (path) {
            const len = path.getTotalLength();
            path.style.strokeDasharray = len;
            path.style.strokeDashoffset = len;
            path.getBoundingClientRect();
            path.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(0.22, 1, 0.36, 1)';
            path.style.strokeDashoffset = 0;
        }
    }
})();

/* ------------------------------------------------------------------ *
 * Reusable modal — window.openModal(title, bodyHTML, opts)
 *   opts.submitLabel : footer primary button text (omit for no submit)
 *   opts.onSubmit(form, close) : called on submit; call close() or return
 *                                truthy to dismiss
 *   opts.wide : wider modal
 * Closes on overlay click, Cancel, or Esc.
 * ------------------------------------------------------------------ */
(function () {
    let overlay;
    let resetTimer;

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) window.closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('open')) window.closeModal();
        });
        return overlay;
    }

    window.closeModal = function () {
        if (!overlay) return;
        overlay.classList.remove('open');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { if (overlay) overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>'; }, 200);
    };

    window.openModal = function (title, bodyHTML, opts) {
        opts = opts || {};
        const o = ensureOverlay();
        clearTimeout(resetTimer); // cancel any pending close-reset so we aren't wiped mid-open
        const footer = opts.submitLabel
            ? `<div class="modal-foot">
                   <button type="button" class="btn btn-ghost btn-sm" data-modal-cancel>Cancel</button>
                   <button type="submit" class="btn btn-primary btn-sm">${opts.submitLabel}</button>
               </div>`
            : `<div class="modal-foot">
                   <button type="button" class="btn btn-ghost btn-sm" data-modal-cancel>Close</button>
               </div>`;
        o.querySelector('.modal').className = 'modal' + (opts.wide ? ' modal--wide' : '');
        o.querySelector('.modal').innerHTML = `
            <div class="modal-head">
                <h3>${title}</h3>
                <button type="button" class="modal-x" data-modal-cancel aria-label="Close">&times;</button>
            </div>
            <form class="modal-form">
                <div class="modal-body">${bodyHTML}</div>
                ${footer}
            </form>`;
        const form = o.querySelector('.modal-form');
        o.querySelectorAll('[data-modal-cancel]').forEach((b) =>
            b.addEventListener('click', window.closeModal));
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (opts.onSubmit) {
                const keep = opts.onSubmit(form, window.closeModal);
                if (keep === false) return; // validation failed -> stay open
            }
            window.closeModal();
        });
        requestAnimationFrame(() => o.classList.add('open'));
        const first = form.querySelector('input, select, textarea');
        if (first) setTimeout(() => first.focus(), 60);
        return form;
    };
})();

/* CSV export — window.exportCSV(filename, rows[][]) */
window.exportCSV = function (filename, rows) {
    const esc = (v) => {
        const s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (window.toast) toast('Exported ' + filename);
};

/* Render a QR code into an element. Requires vendor/qrcode.min.js (window.qrcode). */
window.renderQR = function (el, text) {
    if (!window.qrcode) { el.textContent = 'QR library not loaded'; return; }
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    el.innerHTML = qr.createImgTag(5, 8);
    const img = el.querySelector('img');
    if (img) { img.style.width = '200px'; img.style.height = '200px'; img.alt = 'QR code'; }
};
