/**
 * RNB Events — Portal Sub-page Auth + Init
 * Included by all Client sub-pages (timeline, moodboard, etc.)
 * Fetches live data from cloud, falls back to static clients-config.js
 */

(function () {
    'use strict';

    var SESSION_KEY   = 'rnb_portal_access';
    var ROLE_KEY      = 'rnb_portal_role';
    var ROLE_NAME_KEY = 'rnb_portal_role_name';

    var code     = sessionStorage.getItem(SESSION_KEY);
    var roleVal  = sessionStorage.getItem(ROLE_KEY)      || 'couple';
    var roleName = sessionStorage.getItem(ROLE_NAME_KEY) || 'Client';
    var cloudGate = null;

    if (!code) {
        window.location.replace('/Client');
        throw new Error('Redirecting to gate.');
    }

    function ensureCloudGate() {
        if (cloudGate) return cloudGate;
        cloudGate = document.createElement('div');
        cloudGate.id = 'portal-cloud-gate';
        cloudGate.style.cssText = [
            'position:fixed', 'inset:0', 'background:#f5f2ec',
            'z-index:10002', 'display:flex', 'flex-direction:column',
            'align-items:center', 'justify-content:center', 'gap:16px'
        ].join(';');
        cloudGate.innerHTML =
            '<img src="/RNB Logo Olive.png" alt="RNB Events" style="height:52px;width:auto">' +
            '<div id="portal-cloud-spinner" style="width:24px;height:24px;border:2px solid #d6cfbf;border-top-color:#527141;border-radius:50%;animation:pl-cloud-spin 0.8s linear infinite"></div>' +
            '<p style="margin:0;font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:3px;color:#527141;text-transform:uppercase">Loading...</p>' +
            '<p id="portal-cloud-status" style="margin:0;max-width:340px;text-align:center;font-family:Montserrat,sans-serif;font-size:11px;line-height:1.5;color:#527141">Checking secure cloud connectivity...</p>' +
            '<div id="portal-cloud-actions" style="display:none;gap:8px">' +
                '<button id="portal-cloud-retry" style="border:1px solid #527141;background:#527141;color:#fff;padding:9px 14px;font-family:Montserrat,sans-serif;letter-spacing:1.4px;font-size:10px;text-transform:uppercase;cursor:pointer">Retry Connection</button>' +
                '<button id="portal-cloud-exit" style="border:1px solid #527141;background:transparent;color:#527141;padding:9px 14px;font-family:Montserrat,sans-serif;letter-spacing:1.4px;font-size:10px;text-transform:uppercase;cursor:pointer">Back To Portal</button>' +
            '</div>';

        if (!document.getElementById('pl-cloud-spin-kf')) {
            var style = document.createElement('style');
            style.id = 'pl-cloud-spin-kf';
            style.textContent = '@keyframes pl-cloud-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }

        document.body.appendChild(cloudGate);
        return cloudGate;
    }

    function setCloudGateStatus(message, isError) {
        var status = document.getElementById('portal-cloud-status');
        var actions = document.getElementById('portal-cloud-actions');
        var spinner = document.getElementById('portal-cloud-spinner');
        if (status) status.textContent = message;
        if (actions) actions.style.display = isError ? 'flex' : 'none';
        if (spinner) spinner.style.display = isError ? 'none' : 'block';
    }

    function hideCloudGate() {
        if (!cloudGate || !cloudGate.parentNode) return;
        cloudGate.parentNode.removeChild(cloudGate);
        cloudGate = null;
    }

    /* ── Build roles map: any hash → { primaryHash, role } ─── */
    function buildRolesMap() {
        window.RNB_CLIENTS_ROLES = window.RNB_CLIENTS_ROLES || {};
        var raw = window.RNB_CLIENTS_RAW || {};
        Object.keys(raw).forEach(function (primaryHash) {
            var c = raw[primaryHash];
            if (!c || !c.codeHash) return;
            window.RNB_CLIENTS_ROLES[c.codeHash] = { primaryHash: c.codeHash, role: 'couple' };
            if (c.plannerCodeHash) window.RNB_CLIENTS_ROLES[c.plannerCodeHash] = { primaryHash: c.codeHash, role: 'planner' };
            if (c.teamCodeHash)    window.RNB_CLIENTS_ROLES[c.teamCodeHash]    = { primaryHash: c.codeHash, role: 'rnbTeam' };
        });
    }

    function bootPortal() {
        // code is the PRIMARY codeHash stored at login
        var client = window.RNB_CLIENTS_RAW && window.RNB_CLIENTS_RAW[code];
        if (!client || client.active === false) {
            sessionStorage.removeItem(SESSION_KEY);
            window.location.replace('/Client');
            return;
        }

        window.currentClient   = client;
        window.currentCode     = code;
        window.currentRole     = roleVal;
        window.currentRoleName = roleName;

        /* Analytics beacon — fire once per portal page load */
        if (typeof window.remusTrack === 'function') {
            window.remusTrack('client', code);
        }

        window.portalSignOut = function () {
            sessionStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(ROLE_KEY);
            sessionStorage.removeItem(ROLE_NAME_KEY);
            sessionStorage.removeItem('rnb_portal_auth_hash');
            try { localStorage.removeItem('rnb_portal_remember'); } catch (e) {}
            window.location.replace('/Client');
        };

        /* ── In-page nav loading overlay ─────────────────────────
           Shows a branded loading screen when navigating between
           portal pages so the user never sees a blank screen.     */
        (function () {
            var overlay = document.createElement('div');
            overlay.id = 'portal-nav-loading';
            overlay.style.cssText = [
                'position:fixed', 'inset:0', 'background:#f5f2ec',
                'z-index:10001', 'display:none',
                'flex-direction:column', 'align-items:center',
                'justify-content:center', 'gap:18px',
                'opacity:0', 'transition:opacity 0.2s ease'
            ].join(';');
            overlay.innerHTML =
                '<img src="/RNB Logo Olive.png" alt="RNB Events" style="height:52px;width:auto">' +
                '<div style="width:24px;height:24px;border:2px solid #d6cfbf;border-top-color:#527141;border-radius:50%;animation:pl-spin 0.8s linear infinite"></div>' +
                '<p style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:3px;color:#527141;text-transform:uppercase;margin:0">Loading&hellip;</p>';
            /* Ensure keyframes exist on this page */
            if (!document.getElementById('pl-spin-kf')) {
                var kf = document.createElement('style');
                kf.id = 'pl-spin-kf';
                kf.textContent = '@keyframes pl-spin{to{transform:rotate(360deg)}}';
                document.head.appendChild(kf);
            }
            document.body.appendChild(overlay);

            function showNavOverlay() {
                overlay.style.display = 'flex';
                /* Trigger reflow so transition fires */
                overlay.offsetHeight; // eslint-disable-line no-unused-expressions
                overlay.style.opacity = '1';
            }

            /* Intercept all in-portal anchor clicks */
            document.addEventListener('click', function (e) {
                var a = e.target.closest('a[href]');
                if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
                var href = a.getAttribute('href');
                /* Only intercept same-origin internal portal links */
                if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|https?:|\/\/)/.test(href)) return;
                if (!sessionStorage.getItem('rnb_portal_access')) return;
                showNavOverlay();
                /* Allow default navigation — browser will unload this page */
            });

            /* Also show overlay when browser navigates away via back/forward */
            window.addEventListener('pagehide', function () {
                showNavOverlay();
            });
        }());

        /* Fill planner-email and first-name placeholders */
        function fillPlaceholders() {
            document.querySelectorAll('.planner-email-link').forEach(function (el) {
                if (window.currentClient && window.currentClient.plannerEmail) {
                    el.href = 'mailto:' + window.currentClient.plannerEmail;
                }
            });
            document.querySelectorAll('.client-first-name').forEach(function (el) {
                if (window.currentClient && window.currentClient.firstName) {
                    el.textContent = window.currentClient.firstName;
                }
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fillPlaceholders);
        } else {
            fillPlaceholders();
        }

        /* Notify sub-page scripts that portal data is ready */
        window._portalReady = true;
        if (typeof window.onPortalReady === 'function') {
            window.onPortalReady();
        }
    }

    function bootFromCloud() {
        ensureCloudGate();
        setCloudGateStatus('Checking secure cloud connectivity...', false);

        var retry = document.getElementById('portal-cloud-retry');
        var exit = document.getElementById('portal-cloud-exit');
        if (retry) retry.onclick = function () { bootFromCloud(); };
        if (exit) exit.onclick = function () { window.location.replace('/Client'); };

        var url = window.RNB_CLOUD_URL;
        if (!url) {
            setCloudGateStatus('Cloud URL not configured. Please contact support.', true);
            return;
        }

        fetch(url + '?_t=' + Date.now(), { redirect: 'follow' })
            .then(function (r) {
                if (!r.ok) throw new Error('Cloud request failed: ' + r.status);
                return r.json();
            })
            .then(function (arr) {
                if (!Array.isArray(arr)) throw new Error('Cloud response was invalid.');
                if (!window.RNB_CLIENTS_RAW) window.RNB_CLIENTS_RAW = {};
                arr.forEach(function (c) {
                    if (c && c.codeHash) {
                        window.RNB_CLIENTS_RAW[c.codeHash] = c;
                    }
                });
                buildRolesMap();
                hideCloudGate();
                bootPortal();
            })
            .catch(function (e) {
                console.warn('Sub-page cloud connectivity failed:', e);
                setCloudGateStatus('Unable to reach cloud data. Check your connection and retry.', true);
            });
    }

    bootFromCloud();

    window.capitalize = function (s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    };

    window.renderComingSoon = function (containerId, msg) {
        var el = document.getElementById(containerId);
        if (el) {
            el.innerHTML = '<p class="section-coming">' + (msg || 'This section is being prepared by your planning team. Check back soon.') + '</p>';
        }
    };

    window.escHtml = function (s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    };

    window.toDDMMYYYY = function (iso) {
        if (!iso) return '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
        var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[3] + '/' + m[2] + '/' + m[1];
        return String(iso);
    };

    window.toIso = function (ddmmyyyy) {
        if (!ddmmyyyy) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(ddmmyyyy)) return ddmmyyyy;
        var m = String(ddmmyyyy).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        return '';
    };

    window.formatNoteTs = function (isoTs) {
        if (!isoTs) return '';
        try {
            var d = new Date(isoTs);
            var mn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            var day = d.getDate();
            var suf = [11,12,13].indexOf(day%100)>=0 ? 'th' : (['th','st','nd','rd'][day%10]||'th');
            var time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
            return mn[d.getMonth()]+' '+day+suf+' '+d.getFullYear()+', '+time;
        } catch (e) { return isoTs; }
    };

    /**
     * Compress an image file via Canvas and return a data URL.
     * Images are stored directly in the client record — no server call needed.
     * @param {File} file  - Browser File object (must be image/*)
     * @param {Function} [onStatus] - optional callback(string) for progress messages
     */
    window.uploadPortalFile = function (file, onStatus) {
        function status(msg) { if (typeof onStatus === 'function') onStatus(msg); }
        return new Promise(function (resolve, reject) {
            if (!file || !file.type.startsWith('image/')) {
                return reject(new Error('Only image files are supported.'));
            }

            status('Compressing…');
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('Could not read file.')); };
            reader.onload = function (e) {
                var img = new Image();
                img.onerror = function () { reject(new Error('Could not load image.')); };
                img.onload = function () {
                    /* Resize to max 900 px on longest side, JPEG 75 % quality */
                    var MAX = 900;
                    var w = img.width, h = img.height;
                    if (w > MAX || h > MAX) {
                        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                        else        { w = Math.round(w * MAX / h); h = MAX; }
                    }
                    var canvas = document.createElement('canvas');
                    canvas.width  = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    var dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                    status('');
                    resolve(dataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

    window.RNB_SECTION_API = 'https://api.rnbevents716.com/update-client-section';

    window.savePortalSection = function (section, data, statusEl, btnEl, editAction) {
        btnEl.disabled = true;
        btnEl.textContent = 'SAVING...';
        statusEl.textContent = '';
        var payload = {
            codeHash: window.currentCode,
            section: section,
            data: data
        };
        if (editAction) {
            payload.editLogEntry = {
                ts:       new Date().toISOString(),
                role:     window.currentRole     || 'couple',
                roleName: window.currentRoleName || 'Client',
                action:   editAction
            };
        }
        return fetch(window.RNB_SECTION_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res && res.ok) {
                statusEl.textContent = 'Saved!';
                statusEl.className = 'tracking-save-status save-ok';
                /* Keep in-memory client in sync so current session reflects the save */
                if (window.currentClient) window.currentClient[section] = data;
            } else {
                statusEl.textContent = 'Save failed: ' + (res.error || 'Unknown error — check your connection and try again.');
                statusEl.className = 'tracking-save-status save-err';
            }
        })
        .catch(function (e) {
            statusEl.textContent = 'Save failed — check your internet connection and try again.';
            statusEl.className = 'tracking-save-status save-err';
        })
        .then(function () {
            btnEl.disabled = false;
            btnEl.textContent = 'SAVE CHANGES';
        });
    };
})();
