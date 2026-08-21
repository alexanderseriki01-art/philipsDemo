/* Phillips Consulting TMS — API client and admin session.
 *
 *   Api.get(path)  /  Api.post(path, body)      -> Promise<data>, throws ApiError
 *   Auth.login(email, password, remember)       -> Promise<admin>
 *   Auth.logout()                               -> Promise (always resolves)
 *   Auth.me()                                   -> Promise<admin>
 *   Auth.admin()   / Auth.token() / Auth.check()
 *   Auth.guard()   -> redirects to the sign-in page when not authenticated
 *
 * The token lives in localStorage when "keep me signed in" was ticked and in
 * sessionStorage otherwise, so an unticked session dies with the tab.
 */
(function (global) {
    'use strict';

    var CONFIG = global.PCL_CONFIG || {};
    var BASE = (CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
    var KEY = 'pcl.admin.session';

    /* ── errors ─────────────────────────────────────────────────────────── */

    function ApiError(message, status, errors) {
        this.name = 'ApiError';
        this.message = message || 'Something went wrong.';
        this.status = status || 0;
        this.errors = errors || null;
    }
    ApiError.prototype = Object.create(Error.prototype);
    ApiError.prototype.constructor = ApiError;

    // The first message from a Laravel-style { field: [msg] } errors object.
    ApiError.prototype.firstError = function () {
        if (!this.errors) return this.message;
        for (var field in this.errors) {
            if (Object.prototype.hasOwnProperty.call(this.errors, field)) {
                var val = this.errors[field];
                if (Array.isArray(val) && val.length) return val[0];
                if (typeof val === 'string') return val;
            }
        }
        return this.message;
    };

    /* ── session storage ────────────────────────────────────────────────── */

    var memorySession = null;

    function stores() {
        var out = [];
        try { if (global.localStorage) out.push(global.localStorage); } catch (e) {}
        try { if (global.sessionStorage) out.push(global.sessionStorage); } catch (e) {}
        return out;
    }

    function readSession() {
        var all = stores();
        for (var i = 0; i < all.length; i++) {
            try {
                var raw = all[i].getItem(KEY);
                if (raw) {
                    var parsed = JSON.parse(raw);
                    if (parsed && parsed.token) return parsed;
                }
            } catch (e) {}
        }
        return null;
    }

    function clearSession() {
        stores().forEach(function (store) {
            try { store.removeItem(KEY); } catch (e) {}
        });
        memorySession = null;
    }

    function writeSession(session, remember) {
        clearSession();
        try {
            var store = remember ? global.localStorage : global.sessionStorage;
            store.setItem(KEY, JSON.stringify(session));
        } catch (e) {
            // Private mode with storage disabled: the session just lives in
            // memory for this page's lifetime.
        }
        memorySession = session;
    }

    function currentSession() {
        return readSession() || memorySession;
    }

    function isRemembered() {
        try {
            return !!(global.localStorage && global.localStorage.getItem(KEY));
        } catch (e) {
            return false;
        }
    }

    /* ── transport ──────────────────────────────────────────────────────── */

    function request(method, path, body, opts) {
        opts = opts || {};

        var url = BASE + (path.charAt(0) === '/' ? path : '/' + path);
        var headers = { 'Accept': 'application/json' };

        if (body !== undefined && body !== null) {
            headers['Content-Type'] = 'application/json';
        }

        if (opts.auth !== false) {
            var session = currentSession();
            if (session && session.token) {
                headers['Authorization'] = 'Bearer ' + session.token;
            }
        }

        return fetch(url, {
            method: method,
            headers: headers,
            body: body === undefined || body === null ? undefined : JSON.stringify(body),
            mode: 'cors',
            credentials: 'omit'
        }).then(function (response) {
            return response.text().then(function (text) {
                var payload = null;
                if (text) {
                    try { payload = JSON.parse(text); } catch (e) { payload = null; }
                }

                // A non-JSON body means something upstream answered instead of
                // the API — a proxy error page, usually.
                if (payload === null) {
                    throw new ApiError(
                        response.ok
                            ? 'The server sent an unreadable response.'
                            : 'The server returned an error (' + response.status + ').',
                        response.status
                    );
                }

                if (!response.ok || payload.success === false) {
                    throw new ApiError(
                        payload.message || 'The request failed.',
                        response.status,
                        payload.errors || null
                    );
                }

                return payload.data === undefined ? {} : payload.data;
            });
        }, function () {
            // fetch itself rejected: offline, DNS, CORS, or mixed content.
            throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
        });
    }

    var Api = {
        get: function (path, opts) { return request('GET', path, null, opts); },
        post: function (path, body, opts) { return request('POST', path, body, opts); },
        baseUrl: function () { return BASE; },
        health: function () { return request('GET', '/api/health', null, { auth: false }); }
    };

    /* ── admin auth ─────────────────────────────────────────────────────── */

    var Auth = {
        token: function () {
            var session = currentSession();
            return session ? session.token : null;
        },

        admin: function () {
            var session = currentSession();
            return session ? session.admin : null;
        },

        isAuthenticated: function () {
            return !!Auth.token();
        },

        login: function (email, password, remember) {
            return Api.post('/api/v1/admin/auth/login', {
                email: email,
                password: password
            }, { auth: false }).then(function (data) {
                writeSession({
                    token: data.token,
                    expiresAt: data.expires_at,
                    admin: data.admin
                }, !!remember);
                return data.admin;
            });
        },

        me: function () {
            return Api.get('/api/v1/admin/auth/me').then(function (data) {
                var session = currentSession();
                if (session) {
                    session.admin = data.admin;
                    writeSession(session, isRemembered());
                }
                return data.admin;
            });
        },

        refresh: function () {
            return Api.post('/api/v1/admin/auth/refresh').then(function (data) {
                writeSession({
                    token: data.token,
                    expiresAt: data.expires_at,
                    admin: data.admin
                }, isRemembered());
                return data.admin;
            });
        },

        logout: function () {
            var token = Auth.token();
            clearSession();

            if (!token) return Promise.resolve();

            // Revoke server-side with the token we just dropped locally. The
            // local session is gone either way, so failures are swallowed.
            return fetch(BASE + '/api/v1/admin/auth/logout', {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
                mode: 'cors',
                credentials: 'omit'
            }).then(function () {}, function () {});
        },

        // Verify the stored token is still good. Resolves with the admin, or
        // rejects — clearing the session first if the server rejected it.
        check: function () {
            if (!Auth.isAuthenticated()) {
                return Promise.reject(new ApiError('Not signed in.', 401));
            }
            return Auth.me().catch(function (err) {
                if (err.status === 401) clearSession();
                throw err;
            });
        },

        clear: clearSession,

        /**
         * Page guard for admin screens other than the sign-in page. Sends the
         * browser to the sign-in page when there is no session, and revalidates
         * in the background so a token revoked server-side does not linger.
         * A network blip does not throw an admin out of the console.
         */
        guard: function (loginUrl) {
            var target = loginUrl || CONFIG.adminLoginUrl || 'index.html';

            if (!Auth.isAuthenticated()) {
                global.location.replace(target);
                return Promise.reject(new ApiError('Not signed in.', 401));
            }

            return Auth.check().catch(function (err) {
                if (err.status === 401) {
                    global.location.replace(target);
                }
                throw err;
            });
        }
    };

    global.ApiError = ApiError;
    global.Api = Api;
    global.Auth = Auth;
})(window);
