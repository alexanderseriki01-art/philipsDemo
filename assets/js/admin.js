/* Admin console: authentication against the TMS API, chart drawing, session chrome.
 *
 * Requires config.js and api.js to be loaded first.
 */

(function () {
    const loginForm = document.getElementById('admin-login-form');
    const loginScreen = document.getElementById('admin-login');
    const app = document.getElementById('admin-app');

    // Only the console's index page carries a sign-in screen; every other admin
    // page is a guarded sub-page.
    const isSignInPage = !!(loginForm && loginScreen && app);

    /* ── session chrome ─────────────────────────────────────────────────── */

    // Show whoever is actually signed in, rather than the seeded placeholder.
    function paintAdmin(admin) {
        if (!admin) return;

        document.querySelectorAll('.sidebar-user .name').forEach((el) => { el.textContent = admin.name; });
        document.querySelectorAll('.sidebar-user .role').forEach((el) => { el.textContent = admin.role; });
        document.querySelectorAll('.sidebar-user .avatar, .topbar-right .avatar').forEach((el) => {
            el.textContent = admin.initials || '';
            el.title = admin.name;
        });
    }

    function runDashboardAnimations() {
        drawLineChart();
        animateDonut();
        animateProgressBars();
        animateCounters();
    }

    /* ── sign-in page ───────────────────────────────────────────────────── */

    function revealApp() {
        if (!app) return;
        if (loginScreen) loginScreen.style.display = 'none';
        app.classList.add('active');
        window.scrollTo(0, 0);
        runDashboardAnimations();
    }

    function showLogin() {
        if (!loginScreen || !app) return;
        app.classList.remove('active');
        loginScreen.style.display = '';
        loginScreen.style.opacity = '';
        loginScreen.style.transform = '';
    }

    function setFormError(message) {
        if (!loginForm) return;

        let box = loginForm.querySelector('.form-error');
        if (!box) {
            box = document.createElement('p');
            box.className = 'form-error';
            box.setAttribute('role', 'alert');
            loginForm.insertBefore(box, loginForm.firstChild);
        }

        box.textContent = message || '';
        box.classList.toggle('show', !!message);
    }

    function setSubmitting(submitting) {
        if (!loginForm) return;

        const button = loginForm.querySelector('button[type="submit"]');
        if (!button) return;

        if (submitting) {
            button.dataset.label = button.dataset.label || button.textContent;
            button.textContent = 'Signing in…';
        } else if (button.dataset.label) {
            button.textContent = button.dataset.label;
        }

        button.disabled = submitting;
        loginForm.classList.toggle('is-submitting', submitting);
    }

    if (isSignInPage) {
        // A live session skips the sign-in screen. The app is revealed straight
        // away and the token revalidated behind it, so a returning admin never
        // waits on a round trip — and is dropped back to sign-in if it has been
        // revoked.
        if (window.Auth && Auth.isAuthenticated()) {
            revealApp();
            paintAdmin(Auth.admin());

            Auth.check().then(paintAdmin).catch((err) => {
                if (err && err.status === 401) {
                    setFormError('Your session expired. Please sign in again.');
                    showLogin();
                }
            });
        } else {
            showLogin();
        }

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            setFormError('');

            const email = (loginForm.querySelector('input[type="email"]').value || '').trim();
            const password = loginForm.querySelector('input[type="password"]').value || '';
            const rememberBox = loginForm.querySelector('input[type="checkbox"]');
            const remember = !!(rememberBox && rememberBox.checked);

            if (!email || !password) {
                setFormError('Enter your work email and password.');
                return;
            }

            setSubmitting(true);

            Auth.login(email, password, remember)
                .then((admin) => {
                    paintAdmin(admin);
                    loginScreen.style.transition = 'opacity .35s ease, transform .35s ease';
                    loginScreen.style.opacity = '0';
                    loginScreen.style.transform = 'scale(0.98)';
                    setTimeout(revealApp, 360);
                })
                .catch((err) => {
                    setSubmitting(false);
                    setFormError(err && err.firstError ? err.firstError() : 'Sign-in failed. Try again.');
                });
        });
    } else if (document.querySelector('.app')) {
        // Guarded sub-page. The <head> already redirected anyone without a
        // stored token; this revalidates it against the server.
        paintAdmin(window.Auth ? Auth.admin() : null);

        if (window.Auth) {
            Auth.guard().then(paintAdmin).catch(() => {});
        }

        runDashboardAnimations();
    }

    /* ── signing out ────────────────────────────────────────────────────── */

    document.querySelectorAll('[data-signout]').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.preventDefault();

            const done = () => window.location.replace('index.html');
            if (!window.Auth) return done();

            // Navigate whether or not the revoke call succeeds.
            Auth.logout().then(done, done);
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

/* Modal, exportCSV, downloadText and renderQR now live in ui.js (shared with
 * the participant portal). Ensure ui.js is loaded before admin.js. */
