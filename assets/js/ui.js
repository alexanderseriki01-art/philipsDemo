/* Shared UI helpers used by both the admin console and the participant portal.
 *
 *   window.openModal(title, bodyHTML, opts)  — reusable dialog
 *   window.closeModal()
 *   window.exportCSV(filename, rows[][])      — download a .csv (Blob)
 *   window.downloadText(filename, text, mime) — download arbitrary text
 *   window.renderQR(el, text)                 — render a QR (needs window.qrcode)
 *
 * opts for openModal:
 *   submitLabel : footer primary button text (omit for a Close-only footer)
 *   onSubmit(form, close) : called on submit; return false to stay open
 *   wide : wider modal
 * Closes on overlay click, Cancel, or Esc.
 */
(function () {
    'use strict';
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

    /* Generic text/blob download. */
    window.downloadText = function (filename, text, mime) {
        const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (window.toast) toast('Downloaded ' + filename);
    };

    /* CSV export. */
    window.exportCSV = function (filename, rows) {
        const esc = (v) => {
            const s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
        window.downloadText(filename, csv, 'text/csv');
    };

    /* Render a QR code into an element. Requires vendor/qrcode.min.js. */
    window.renderQR = function (el, text) {
        if (!window.qrcode) { el.textContent = 'QR library not loaded'; return; }
        const qr = window.qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        el.innerHTML = qr.createImgTag(5, 8);
        const img = el.querySelector('img');
        if (img) { img.style.width = '200px'; img.style.height = '200px'; img.alt = 'QR code'; }
    };
})();
