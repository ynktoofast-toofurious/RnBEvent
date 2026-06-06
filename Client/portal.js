(function () {
    'use strict';

    var SESSION_KEY   = 'rnb_portal_access';
    var ROLE_KEY      = 'rnb_portal_role';
    var ROLE_NAME_KEY = 'rnb_portal_role_name';
    var AUTH_HASH_KEY = 'rnb_portal_auth_hash';  // the exact hash entered (may differ from primary)
    var REMEMBER_KEY  = 'rnb_portal_remember'; // localStorage key for cached login
    var ADMIN_PORTAL_BRIDGE_KEY = 'rnb_admin_portal_bridge';
    var REMEMBER_DAYS = 30;

    var gate    = document.getElementById('access-gate');
    var portal  = document.getElementById('portal-content');
    var input   = document.getElementById('access-input');
    var errorEl = document.getElementById('gate-error');
    var cloudReady = false;
    var cloudInitInFlight = false;

    function sha256(str) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
            return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        });
    }

    /* ── Build roles map: any hash → { primaryHash, role } ─── */
    function buildRolesMap() {
        window.RNB_CLIENTS_ROLES = window.RNB_CLIENTS_ROLES || {};
        var raw = window.RNB_CLIENTS_RAW || {};
        Object.keys(raw).forEach(function (primaryHash) {
            var c = raw[primaryHash];
            if (!c) return;
            // Use primaryHash (the object key) as the main access code hash
            window.RNB_CLIENTS_ROLES[primaryHash] = { primaryHash: primaryHash, role: 'couple' };
            if (c.plannerCodeHash) window.RNB_CLIENTS_ROLES[c.plannerCodeHash] = { primaryHash: primaryHash, role: 'planner' };
            if (c.teamCodeHash)    window.RNB_CLIENTS_ROLES[c.teamCodeHash]    = { primaryHash: primaryHash, role: 'rnbTeam' };
        });
    }

    /* ── Fetch clients from S3, merge into RNB_CLIENTS_RAW ─── */
    function fetchCloudClients() {
        var url = window.RNB_CLOUD_URL;
        if (!url) {
            return Promise.reject(new Error('Cloud URL missing.'));
        }
        return fetch(url + '?_t=' + Date.now(), { redirect: 'follow' })
            .then(function (r) {
                if (!r.ok) throw new Error('Cloud request failed: ' + r.status);
                return r.json();
            })
            .then(function (arr) {
                if (Array.isArray(arr)) {
                    if (!window.RNB_CLIENTS_RAW) window.RNB_CLIENTS_RAW = {};
                    arr.forEach(function (c) {
                        if (c && c.codeHash) {
                            window.RNB_CLIENTS_RAW[c.codeHash] = c;
                        }
                    });
                    buildRolesMap();
                } else {
                    throw new Error('Cloud response was not a valid clients list.');
                }
                cloudReady = true;
            });
    }

    function setLoadingMessage(msg) {
        var status = document.getElementById('portal-loading-status');
        if (status) status.textContent = msg || '';
    }

    function setLoadingActions(visible) {
        var actions = document.getElementById('portal-loading-actions');
        if (!actions) return;
        actions.style.display = visible ? 'flex' : 'none';
    }

    /* ── Find client + role by any hash ─────────────────────── */
    function findClientAndRole(hash) {
        buildRolesMap(); // ensure map is current
        var roles = window.RNB_CLIENTS_ROLES || {};
        var roleInfo = roles[hash];
        if (!roleInfo) return null;
        var client = window.RNB_CLIENTS_RAW && window.RNB_CLIENTS_RAW[roleInfo.primaryHash];
        if (!client || client.active === false) return null;
        return { client: client, primaryHash: roleInfo.primaryHash, role: roleInfo.role };
    }

    /* ── Remember-me helpers ─────────────────────────────────── */
    function saveRemembered(primaryHash, role, roleName, authHash) {
        try {
            localStorage.setItem(REMEMBER_KEY, JSON.stringify({
                hash:     primaryHash,
                authHash: authHash || primaryHash,
                role:     role,
                roleName: roleName,
                expiry:   Date.now() + REMEMBER_DAYS * 24 * 3600 * 1000
            }));
        } catch (e) { /* storage may be unavailable */ }
    }

    function loadRemembered() {
        try {
            var raw = localStorage.getItem(REMEMBER_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || !data.hash || !data.expiry) return null;
            if (Date.now() > data.expiry) { localStorage.removeItem(REMEMBER_KEY); return null; }
            return data;
        } catch (e) { return null; }
    }

    function clearRemembered() {
        try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
    }

    /* ── Init ────────────────────────────────────────────────── */
    function init() {
        if (cloudInitInFlight) return;
        cloudInitInFlight = true;
        showLoading(true);
        setLoadingActions(false);
        setLoadingMessage('Connecting to secure cloud data...');
        fetchCloudClients().then(function () {
            return consumeAdminBridgeLogin().then(function (bridgeLoggedIn) {
                if (bridgeLoggedIn) {
                    showLoading(false);
                    cloudInitInFlight = false;
                    return;
                }

                // 1. Check sessionStorage — use AUTH_HASH_KEY (the actual entered hash)
                //    to correctly restore planners / RNB Team whose primaryHash differs
                var savedHash     = sessionStorage.getItem(SESSION_KEY);
                var savedAuthHash = sessionStorage.getItem(AUTH_HASH_KEY) || savedHash;
                var savedRole     = sessionStorage.getItem(ROLE_KEY);

                if (savedHash) {
                    // Use the entered hash for role lookup so planner/team roles survive reload
                    var result = findClientAndRole(savedAuthHash);
                    if (!result && savedAuthHash !== savedHash) {
                        // fallback: try primary hash
                        result = findClientAndRole(savedHash);
                    }
                    // backward compat: savedHash might be the primary hash with no roles entry
                    if (!result) {
                        var client = window.RNB_CLIENTS_RAW && window.RNB_CLIENTS_RAW[savedHash];
                        if (client && client.active !== false) {
                            result = { client: client, primaryHash: savedHash, role: savedRole || 'couple' };
                        }
                    }
                    if (result) {
                        showLoading(false);
                        showPortal(result.primaryHash, result.role, getRoleName(result));
                        return;
                    }
                    sessionStorage.removeItem(SESSION_KEY);
                    sessionStorage.removeItem(ROLE_KEY);
                    sessionStorage.removeItem(ROLE_NAME_KEY);
                    sessionStorage.removeItem(AUTH_HASH_KEY);
                }

                // 2. Check localStorage remember-me
                var remembered = loadRemembered();
                if (remembered) {
                    var client2 = window.RNB_CLIENTS_RAW && window.RNB_CLIENTS_RAW[remembered.hash];
                    if (client2 && client2.active !== false) {
                        storeSession(remembered.hash, remembered.role, remembered.roleName, remembered.authHash);
                        showLoading(false);
                        showPortal(remembered.hash, remembered.role, remembered.roleName);
                        return;
                    } else {
                        clearRemembered();
                    }
                }

                // No valid session — show gate
                showLoading(false);
                cloudInitInFlight = false;
            });
        }).catch(function (e) {
            console.warn('Client cloud connectivity failed:', e);
            setLoadingMessage('Unable to reach cloud data. Check connection and retry.');
            setLoadingActions(true);
            cloudInitInFlight = false;
        });
    }

    function getRoleName(result) {
        if (result.role === 'planner') return result.client.planner || 'Event Planner';
        if (result.role === 'rnbTeam') return 'RNB Team';
        return result.client.firstName || 'Client';
    }

    function storeSession(primaryHash, role, roleName, authHash) {
        sessionStorage.setItem(SESSION_KEY,   primaryHash);
        sessionStorage.setItem(ROLE_KEY,      role);
        sessionStorage.setItem(ROLE_NAME_KEY, roleName);
        sessionStorage.setItem(AUTH_HASH_KEY, authHash || primaryHash);
    }

    function clearAdminBridgeUrlParams() {
        try {
            var clean = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, clean);
        } catch (e) {}
    }

    function consumeAdminBridgeLogin() {
        var params = new URLSearchParams(window.location.search || '');
        var bridgeToken = params.get('adminBridge');
        var teamCode = (params.get('teamCode') || '').trim();
        if (!bridgeToken || !teamCode) return Promise.resolve(false);

        var bridgeRaw = null;
        try { bridgeRaw = localStorage.getItem(ADMIN_PORTAL_BRIDGE_KEY); } catch (e) {}
        if (!bridgeRaw) {
            clearAdminBridgeUrlParams();
            return Promise.resolve(false);
        }

        var bridge = null;
        try { bridge = JSON.parse(bridgeRaw); } catch (e) { bridge = null; }
        if (!bridge || bridge.token !== bridgeToken || !bridge.expiry || Date.now() > bridge.expiry) {
            try { localStorage.removeItem(ADMIN_PORTAL_BRIDGE_KEY); } catch (e) {}
            clearAdminBridgeUrlParams();
            return Promise.resolve(false);
        }

        return sha256(teamCode.toUpperCase()).then(function (teamHash) {
            var result = findClientAndRole(teamHash);
            if (!result || result.role !== 'rnbTeam') {
                try { localStorage.removeItem(ADMIN_PORTAL_BRIDGE_KEY); } catch (e) {}
                clearAdminBridgeUrlParams();
                return false;
            }

            storeSession(result.primaryHash, 'rnbTeam', 'RNB Team', teamHash);
            try { localStorage.removeItem(ADMIN_PORTAL_BRIDGE_KEY); } catch (e) {}
            clearAdminBridgeUrlParams();
            showPortal(result.primaryHash, 'rnbTeam', 'RNB Team');
            return true;
        }).catch(function () {
            try { localStorage.removeItem(ADMIN_PORTAL_BRIDGE_KEY); } catch (e) {}
            clearAdminBridgeUrlParams();
            return false;
        });
    }

    /* ── Access check ────────────────────────────────────────── */
    function checkAccess() {
        var entered = (input.value || '').trim().toUpperCase();
        if (!entered) { showError('Please enter your access code.'); return; }

        sha256(entered).then(function (hash) {
            var result = findClientAndRole(hash);
            if (result) {
                handleSuccessfulLogin(result, hash);
            } else if (!cloudReady) {
                fetchCloudClients().then(function () {
                    var r2 = findClientAndRole(hash);
                    if (r2) {
                        handleSuccessfulLogin(r2, hash);
                    } else {
                        showError('Invalid access code. Please check your code and try again.');
                        input.value = '';
                        input.focus();
                    }
                });
            } else {
                showError('Invalid access code. Please check your code and try again.');
                input.value = '';
                input.focus();
            }
        });
    }

    function handleSuccessfulLogin(result, enteredHash) {
        var roleName = getRoleName(result);
        // Store primaryHash for client data lookup AND enteredHash for role restoration
        storeSession(result.primaryHash, result.role, roleName, enteredHash);
        errorEl.textContent = '';
        input.value = '';

        var rememberBox = document.getElementById('remember-me-check');
        if (rememberBox && rememberBox.checked) {
            saveRemembered(result.primaryHash, result.role, roleName, enteredHash);
        }

        /* Track login event */
        try {
            var LAMBDA_URL = 'https://api.rnbevents716.com';
            fetch(LAMBDA_URL + '/track-visit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'login',
                    section: 'client',
                    action: 'portal_login',
                    page: window.location.href,
                    codeHash: result.primaryHash,
                    loginRole: result.role,  // 'couple', 'planner', or 'rnbTeam'
                    sessionId: sessionStorage.getItem('rnb_session_id') || result.primaryHash.slice(0, 8)
                })
            }).catch(function () {});
        } catch (e) {}

        // 2FA disabled - show portal directly
        showPortal(result.primaryHash, result.role, roleName);
    }

    /* ── Log out ─────────────────────────────────────────────── */
    function logOut() {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        sessionStorage.removeItem(ROLE_NAME_KEY);
        sessionStorage.removeItem(AUTH_HASH_KEY);
        clearRemembered();
        portal.classList.add('hidden');
        gate.style.display = 'flex';
        input.value = '';
        errorEl.textContent = '';
        input.focus();
    }

    function formatEventDate(dateStr) {
        if (!dateStr || dateStr === 'TBD' || dateStr === '\u2013') return dateStr;
        
        // Try parsing DD/MM/YYYY format
        var m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
            var day = parseInt(m[1], 10);
            var month = parseInt(m[2], 10) - 1;
            var year = m[3];
            
            var months = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];
            
            var suffix = [11, 12, 13].indexOf(day % 100) >= 0 ? 'th' :
                        (['th', 'st', 'nd', 'rd'][day % 10] || 'th');
            
            return months[month] + ' ' + day + suffix + ', ' + year;
        }
        
        // Return as-is if already in text format
        return dateStr;
    }

    function personalizePortal(client) {
        var nameEl  = document.getElementById('portal-client-name');
        var typeEl  = document.getElementById('portal-event-type');
        var dateEl  = document.getElementById('portal-event-date');
        var venueEl = document.getElementById('portal-event-venue');
        /* Use the full client name (minus trailing year) so the hero reads
           "Joelle & Laurent Belito's Event Journey".
           Fall back to firstName if fullName is blank. */
        var displayName = ((client.fullName || '').replace(/\s*\d{4}\s*$/, '').trim()) ||
            (client.firstName || '').trim();
        if (nameEl && displayName) nameEl.textContent = displayName + '\'s';
        if (typeEl)  typeEl.textContent  = client.eventType  || '\u2013';
        if (dateEl)  dateEl.textContent  = formatEventDate(client.eventDate)  || '\u2013';
        if (venueEl) venueEl.textContent = client.eventVenue || '\u2013';
        
        // Initialize countdown timer
        initCountdown(client.eventDate);
    }

    /* ── Countdown Timer ─────────────────────────────────────── */
    var countdownInterval = null;
    
    function initCountdown(dateStr) {
        // Clear any existing interval
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        var countdownEl = document.getElementById('event-countdown');
        if (!countdownEl) return;
        
        // Hide countdown if no valid date
        if (!dateStr || dateStr === 'TBD' || dateStr === '\u2013') {
            countdownEl.style.display = 'none';
            return;
        }
        
        // Parse DD/MM/YYYY format
        var m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) {
            countdownEl.style.display = 'none';
            return;
        }
        
        var day = parseInt(m[1], 10);
        var month = parseInt(m[2], 10) - 1; // JS months are 0-indexed
        var year = parseInt(m[3], 10);
        var eventDate = new Date(year, month, day, 0, 0, 0); // Midnight on event day
        
        // Show countdown
        countdownEl.style.display = 'block';
        
        // Update countdown every second
        function updateCountdown() {
            var now = new Date();
            var diff = eventDate - now;
            
            // If event has passed, show zeros
            if (diff <= 0) {
                document.getElementById('days-value').textContent = '0';
                document.getElementById('hours-value').textContent = '0';
                document.getElementById('minutes-value').textContent = '0';
                document.getElementById('seconds-value').textContent = '0';
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }
                return;
            }
            
            // Calculate time units
            var days = Math.floor(diff / (1000 * 60 * 60 * 24));
            var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            // Update display
            document.getElementById('days-value').textContent = days;
            document.getElementById('hours-value').textContent = hours;
            document.getElementById('minutes-value').textContent = minutes;
            document.getElementById('seconds-value').textContent = seconds;
        }
        
        // Initial update
        updateCountdown();
        
        // Update every second
        countdownInterval = setInterval(updateCountdown, 1000);
    }

    function showPortal(primaryHash, role, roleName) {
        gate.style.display = 'none';
        portal.classList.remove('hidden');
        var client = window.RNB_CLIENTS_RAW && window.RNB_CLIENTS_RAW[primaryHash];
        if (client) personalizePortal(client);

        // Inject role badge into header
        var badge = document.getElementById('portal-role-badge');
        if (badge) {
            badge.className = 'role-badge role-' + role;
            var roleLabels = { couple: 'Client', planner: 'Planner', rnbTeam: 'RNB Team' };
            badge.textContent = roleLabels[role] || role;
        }
    }

    function showError(msg) { errorEl.textContent = msg; }

    function showLoading(visible) {
        var el = document.getElementById('portal-loading');
        if (!el) return;
        if (visible) {
            el.style.display = 'flex';
            el.classList.remove('fade-out');
        } else {
            el.classList.add('fade-out');
            // hide gate until loading is done; the overlay covers both
            setTimeout(function () { el.style.display = 'none'; }, 320);
        }
    }

    if (input) {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') checkAccess();
        });
    }

    function retryPortalCloud() {
        init();
    }
    window.retryPortalCloud = retryPortalCloud;

    /* ══════════════════════════════════════════════════════════════
       2-FACTOR AUTHENTICATION SYSTEM
       ══════════════════════════════════════════════════════════════ */

    var currentClient = null;
    var verificationCodeSent = '';
    var reauthCodeSent = '';
    var pendingDocumentAccess = false;

    // EmailJS configuration
    var EMAILJS_SERVICE_ID = 'service_t0gqn4j';
    var EMAILJS_TEMPLATE_ID = 'template_ov3vejp';

    /* ── Email Verification Gate ────────────────────────────── */
    function maskEmail(email) {
        if (!email || !email.includes('@')) return email;
        var parts = email.split('@');
        var username = parts[0];
        var domain = parts[1];
        
        // Mask username: show first char, last char, mask middle
        var maskedUsername = username.length > 2 
            ? username[0] + '***' + username[username.length - 1]
            : username[0] + '***';
        
        return maskedUsername + '@' + domain;
    }

    function showEmailVerificationGate(result) {
        currentClient = result;
        gate.style.display = 'none';
        document.getElementById('email-verification-gate').style.display = 'flex';
        
        // Pre-fill email if available in client config
        var client = window.RNB_CLIENTS_RAW && window.RNB_CLIENTS_RAW[result.primaryHash];
        if (client && client.email) {
            document.getElementById('email-input').value = client.email;
            
            // Show masked email hint
            var hintEl = document.getElementById('email-hint');
            var hintValueEl = document.getElementById('email-hint-value');
            if (hintEl && hintValueEl) {
                hintValueEl.textContent = maskEmail(client.email);
                hintEl.style.display = 'block';
            }
        }
    }

    function generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function sendVerificationCode() {
        var emailInput = document.getElementById('email-input');
        var email = emailInput.value.trim();
        var errorEl = document.getElementById('email-error');

        if (!email || !email.includes('@')) {
            errorEl.textContent = 'Please enter a valid email address.';
            return;
        }

        // Generate 6-digit code
        verificationCodeSent = generateVerificationCode();

        // Calculate expiry time (15 minutes from now)
        var expiryDate = new Date();
        expiryDate.setMinutes(expiryDate.getMinutes() + 15);
        var expiryTime = expiryDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        // Send email via EmailJS
        var templateParams = {
            to_email: email,
            client_name: currentClient.client.firstName || 'Valued Client',
            passcode: verificationCodeSent,
            time: expiryTime,
            reply_to: 'hello@rnbevents716.com'
        };

        errorEl.textContent = 'Sending verification code...';
        errorEl.style.color = '#527141';

        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
            .then(function() {
                // Show verification code form
                document.getElementById('email-form').style.display = 'none';
                document.getElementById('verification-form').style.display = 'block';
                document.getElementById('email-display').textContent = email;
                errorEl.textContent = '';
                errorEl.style.color = '#c0392b';
                
                // Store email in session
                sessionStorage.setItem('rnb_portal_email', email);
            }, function(error) {
                errorEl.textContent = 'Failed to send code. Please try again.';
                errorEl.style.color = '#c0392b';
                console.error('EmailJS error:', error);
            });
    }

    function verifyEmailCode() {
        var codeInput = document.getElementById('verification-code-input');
        var code = codeInput.value.trim();
        var errorEl = document.getElementById('verification-error');

        if (code !== verificationCodeSent) {
            errorEl.textContent = 'Invalid code. Please try again.';
            codeInput.value = '';
            codeInput.focus();
            return;
        }

        // Mark as email verified
        sessionStorage.setItem('rnb_portal_email_verified', 'true');
        
        // Show portal
        document.getElementById('email-verification-gate').style.display = 'none';
        showPortal(currentClient.primaryHash, currentClient.role, getRoleName(currentClient));
    }

    function resendVerificationCode() {
        var email = sessionStorage.getItem('rnb_portal_email');
        if (email) {
            document.getElementById('email-input').value = email;
        }
        document.getElementById('verification-form').style.display = 'none';
        document.getElementById('email-form').style.display = 'block';
    }

    function toggleAdminAuth() {
        var form = document.getElementById('admin-auth-form');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    function verifyAdminAuth() {
        var codeInput = document.getElementById('admin-auth-input');
        var code = codeInput.value.trim();
        var errorEl = document.getElementById('admin-auth-error');

        // Get admin auth code from client config
        var adminCode = window.RNB_ADMIN_AUTH_CODE || '';
        
        if (!adminCode) {
            errorEl.textContent = 'Admin authentication not configured.';
            return;
        }

        // Verify Google Authenticator code (simplified - in production use proper TOTP verification)
        if (code === adminCode) {
            sessionStorage.setItem('rnb_portal_email_verified', 'true');
            sessionStorage.setItem('rnb_portal_admin_verified', 'true');
            document.getElementById('email-verification-gate').style.display = 'none';
            showPortal(currentClient.primaryHash, currentClient.role, getRoleName(currentClient));
        } else {
            errorEl.textContent = 'Invalid authentication code.';
            codeInput.value = '';
            codeInput.focus();
        }
    }

    /* ── Re-authentication for Documents ────────────────────── */
    function requireReauthentication(callback) {
        // 2FA disabled - skip re-authentication and execute callback directly
        callback();
        return;
    }

    function sendReauthCode(callback) {
        var email = sessionStorage.getItem('rnb_portal_email');
        if (!email) {
            document.getElementById('reauth-error').textContent = 'Email not found. Please log in again.';
            return;
        }

        // Generate new code
        reauthCodeSent = generateVerificationCode();

        // Calculate expiry time (15 minutes from now)
        var expiryDate = new Date();
        expiryDate.setMinutes(expiryDate.getMinutes() + 15);
        var expiryTime = expiryDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        var primaryHash = sessionStorage.getItem(SESSION_KEY);
        var client = window.RNB_CLIENTS_RAW && window.RNB_CLIENTS_RAW[primaryHash];

        var templateParams = {
            to_email: email,
            client_name: client && client.firstName || 'Valued Client',
            passcode: reauthCodeSent,
            time: expiryTime,
            reply_to: 'hello@rnbevents716.com'
        };

        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
            .then(function() {
                var errorEl = document.getElementById('reauth-error');
                errorEl.textContent = 'Verification code sent to ' + email;
                errorEl.style.color = '#527141';
                setTimeout(function() {
                    errorEl.textContent = '';
                    errorEl.style.color = '#c0392b';
                }, 3000);
            }, function(error) {
                document.getElementById('reauth-error').textContent = 'Failed to send code. Please try again.';
                console.error('EmailJS error:', error);
            });
    }

    function verifyReauth() {
        var codeInput = document.getElementById('reauth-code-input');
        var code = codeInput.value.trim();
        var errorEl = document.getElementById('reauth-error');

        if (code !== reauthCodeSent) {
            errorEl.textContent = 'Invalid code. Please try again.';
            codeInput.value = '';
            codeInput.focus();
            return;
        }

        // Mark as re-authenticated
        sessionStorage.setItem('rnb_portal_reauth_verified', 'true');
        closeReauthModal();
        
        // Navigate to documents page
        window.location.href = '/Client/documents';
    }

    function verifyReauthAdmin() {
        var codeInput = document.getElementById('reauth-admin-input');
        var code = codeInput.value.trim();
        var errorEl = document.getElementById('reauth-admin-error');

        var adminCode = window.RNB_ADMIN_AUTH_CODE || '';
        
        if (!adminCode) {
            errorEl.textContent = 'Admin authentication not configured.';
            return;
        }

        if (code === adminCode) {
            sessionStorage.setItem('rnb_portal_reauth_verified', 'true');
            sessionStorage.setItem('rnb_portal_admin_verified', 'true');
            closeReauthModal();
            window.location.href = '/Client/documents';
        } else {
            errorEl.textContent = 'Invalid authentication code.';
            codeInput.value = '';
            codeInput.focus();
        }
    }

    function resendReauthCode() {
        sendReauthCode();
    }

    function toggleReauthAdmin() {
        var form = document.getElementById('reauth-admin-form');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    function closeReauthModal() {
        document.getElementById('reauth-modal').style.display = 'none';
        document.getElementById('reauth-code-input').value = '';
        document.getElementById('reauth-admin-input').value = '';
        document.getElementById('reauth-error').textContent = '';
        document.getElementById('reauth-admin-error').textContent = '';
        pendingDocumentAccess = false;
    }

    /* ── Intercept Documents Link ────────────────────────────── */
    function interceptDocumentsLink() {
        // Find all document links
        var docLinks = document.querySelectorAll('a[href*="/documents"]');
        docLinks.forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                requireReauthentication(function() {
                    window.location.href = link.href;
                });
            });
        });
    }

    // Setup document interception after portal is shown
    var originalShowPortal = showPortal;
    showPortal = function(primaryHash, role, roleName) {
        originalShowPortal(primaryHash, role, roleName);
        setTimeout(interceptDocumentsLink, 100);
    };

    /* ── Global function exports ────────────────────────────── */
    window.sendVerificationCode = sendVerificationCode;
    window.verifyEmailCode = verifyEmailCode;
    window.resendVerificationCode = resendVerificationCode;
    window.toggleAdminAuth = toggleAdminAuth;
    window.verifyAdminAuth = verifyAdminAuth;
    window.verifyReauth = verifyReauth;
    window.verifyReauthAdmin = verifyReauthAdmin;
    window.resendReauthCode = resendReauthCode;
    window.toggleReauthAdmin = toggleReauthAdmin;
    window.closeReauthModal = closeReauthModal;
    window.togglePw = togglePw;

    function togglePw(id, btn) {
        var inp = document.getElementById(id);
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.innerHTML = show ? '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }

    /* ── Keyboard event listeners for better UX ─────────────── */
    document.addEventListener('DOMContentLoaded', function() {
        // Email input - Enter key
        var emailInput = document.getElementById('email-input');
        if (emailInput) {
            emailInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') sendVerificationCode();
            });
        }

        // Verification code - Enter key
        var verificationInput = document.getElementById('verification-code-input');
        if (verificationInput) {
            verificationInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') verifyEmailCode();
            });
        }

        // Admin auth - Enter key
        var adminAuthInput = document.getElementById('admin-auth-input');
        if (adminAuthInput) {
            adminAuthInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') verifyAdminAuth();
            });
        }

        // Re-auth code - Enter key
        var reauthInput = document.getElementById('reauth-code-input');
        if (reauthInput) {
            reauthInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') verifyReauth();
            });
        }

        // Re-auth admin - Enter key
        var reauthAdminInput = document.getElementById('reauth-admin-input');
        if (reauthAdminInput) {
            reauthAdminInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') verifyReauthAdmin();
            });
        }
    });

    window.checkAccess = checkAccess;
    window.logOut      = logOut;

    init();
})();
