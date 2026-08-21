/* Phillips Consulting TMS — runtime configuration.
 *
 * The one file to edit when the API moves. Loaded before api.js on every page
 * that talks to the backend.
 */
(function (global) {
    'use strict';

    /* The API runs on the colat server. It is NOT part of this repo and does not
     * run alongside these files, so serving the pages from localhost (Live
     * Server, python -m http.server, and so on) must still point at the
     * deployed API. An earlier version assumed localhost meant "the backend is
     * local too" and every sign-in from a dev machine failed with
     * "Could not reach the server".
     *
     * Calling an https API from an http page is fine; mixed content only blocks
     * the reverse.
     */
    var DEFAULT_API = 'https://api.colat.ng/tms';
    var LOCAL_API = 'http://localhost:8090';
    var OVERRIDE_KEY = 'pcl.apiBase';

    /* Opt in to a container you are actually running locally:
     *   ?api=local                     use http://localhost:8090
     *   ?api=https://host/path         use any other base
     *   ?api=default                   clear the override
     * The choice sticks in localStorage so it survives navigation.
     */
    function resolveOverride() {
        var requested = null;

        try {
            var match = /[?&]api=([^&]+)/.exec(global.location.search || '');
            if (match) {
                requested = decodeURIComponent(match[1]);
            }
        } catch (e) {
            requested = null;
        }

        try {
            if (requested === 'default') {
                global.localStorage.removeItem(OVERRIDE_KEY);
                return null;
            }

            if (requested) {
                var base = requested === 'local' ? LOCAL_API : requested;
                global.localStorage.setItem(OVERRIDE_KEY, base);
                return base;
            }

            return global.localStorage.getItem(OVERRIDE_KEY) || null;
        } catch (e) {
            // Storage unavailable: honour the query string for this load only.
            if (requested && requested !== 'default') {
                return requested === 'local' ? LOCAL_API : requested;
            }
            return null;
        }
    }

    global.PCL_CONFIG = {
        apiBaseUrl: resolveOverride() || DEFAULT_API,

        // Where an unauthenticated admin page sends the browser.
        adminLoginUrl: 'index.html'
    };
})(window);
