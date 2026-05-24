/* Shared interactions: nav burger, toast */

window.toast = function (msg) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3200);
};

(function () {
    const burger = document.querySelector('.nav-burger');
    const links = document.querySelector('.site-nav-links');
    if (burger && links) {
        burger.addEventListener('click', () => {
            links.classList.toggle('open');
        });
    }
})();
