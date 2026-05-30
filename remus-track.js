/**
 * remus-track.js  —  RNB Events analytics beacon (REMUS)
 * Include on every page that should be tracked.
 *
 * Usage (add near </body> on each page):
 *   <script src="/remus-track.js"></script>
 *   <script>remusTrack('public');</script>   <!-- or 'admin' | 'client' | 'prospect' -->
 *
 * For portal pages: remusTrack('client') fires automatically from portal-page.js.
 * No cookies are set. No PII is transmitted.
 */
(function () {
    var ENDPOINTS = [
        'https://api.rnbevents716.com/track-visit',
        'https://k0e4amkowi.execute-api.us-east-2.amazonaws.com/track-visit'
    ];
    var BOT_PATTERN = /bot|crawl|spider|slurp|mediapartners|adsbot|facebookexternalhit/i;

    function sendWithFallback(payload) {
        var body = JSON.stringify(payload);
        var idx = 0;
        function run() {
            if (idx >= ENDPOINTS.length) return;
            var endpoint = ENDPOINTS[idx++];
            if (navigator.sendBeacon && navigator.sendBeacon(endpoint, body)) return;
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                keepalive: true
            }).catch(function () { run(); });
        }
        run();
    }

    /* Assign a random session ID per browser session (cleared when tab closes) */
    function getSessionId() {
        var key = 'rnb_sid';
        try {
            var id = sessionStorage.getItem(key);
            if (!id) {
                id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                sessionStorage.setItem(key, id);
            }
            return id;
        } catch (e) { return 'nostorage'; }
    }

    /* Parse UTM params from the current URL */
    function getUtm() {
        try {
            var p = new URLSearchParams(location.search);
            return {
                utmSource:   p.get('utm_source')   || '',
                utmMedium:   p.get('utm_medium')   || '',
                utmCampaign: p.get('utm_campaign') || '',
                utmTerm:     p.get('utm_term')     || p.get('q') || ''
            };
        } catch (e) { return {}; }
    }

    window.remusTrack = function (section, codeHash) {
        /* Skip bots */
        if (BOT_PATTERN.test(navigator.userAgent || '')) return;

        var startTime = window.performance ? performance.now() : 0;
        var utm       = getUtm();

        /* Wait until the page is fully loaded to capture load time */
        function send() {
            var payload = {
                section:     section || 'public',
                page:        location.pathname + location.search,
                title:       document.title || '',
                referrer:    document.referrer || '',
                sessionId:   getSessionId(),
                codeHash:    codeHash || '',
                loadMs:      window.performance ? Math.round(performance.now() - startTime) : null,
                utmSource:   utm.utmSource,
                utmMedium:   utm.utmMedium,
                utmCampaign: utm.utmCampaign,
                utmTerm:     utm.utmTerm
            };

            /* Use sendBeacon when available (survives page unload, non-blocking) */
            sendWithFallback(payload);
        }

        if (document.readyState === 'complete') {
            send();
        } else {
            window.addEventListener('load', send, { once: true });
        }
    };

    /* Track a button/CTA click event */
    window.remusClick = function (action) {
        if (BOT_PATTERN.test(navigator.userAgent || '')) return;
        var utm = getUtm();
        var payload = {
            type:        'click',
            action:      action || '',
            section:     'public',
            page:        location.pathname + location.search,
            title:       document.title || '',
            referrer:    document.referrer || '',
            sessionId:   getSessionId(),
            codeHash:    '',
            loadMs:      null,
            utmSource:   utm.utmSource,
            utmMedium:   utm.utmMedium,
            utmCampaign: utm.utmCampaign,
            utmTerm:     utm.utmTerm
        };
        sendWithFallback(payload);
    };
})();
