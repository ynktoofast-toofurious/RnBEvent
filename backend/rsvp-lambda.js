'use strict';

/**
 * RNB Events — RSVP Lambda Handler
 * Route prefix: /rsvp  (configured in API Gateway)
 *
 * DynamoDB tables required:
 *   rnb-events       PK: eventId
 *   rnb-creators     PK: phone
 *   rnb-rsvps        PK: eventId   SK: guestPhone
 *   rnb-guest-songs  PK: pk (guestPhone#eventId)  SK: songIndex (Number)
 *   rnb-otp          PK: phone   SK: purpose   TTL: expiresAt
 *   rnb-sessions     PK: token   TTL: expiresAt
 *   rnb-guest-registry  PK: eventId  SK: guestPhone
 *
 * GSI required on rnb-events:
 *   "creatorId-index"  PK: creatorId
 *
 * Lambda env vars:
 *   URTHEDJ_API_URL   — e.g. https://urthedj.com/api
 *   AWS_REGION        — set automatically by Lambda runtime
 *
 * IAM permissions needed:
 *   dynamodb:GetItem, PutItem, DeleteItem, UpdateItem, Query, Scan
 *   sns:Publish
 *   ses:SendEmail
 *   s3:PutObject (on rnbevents716/rsvp-covers/*)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    DeleteCommand,
    QueryCommand,
    ScanCommand,
    UpdateCommand
} = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const REGION     = process.env.AWS_REGION || 'us-east-2';
const SES_REGION = 'us-east-1'; // SES must be us-east-1 unless you verify a region-specific identity

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const sns = new SNSClient({ region: REGION });
const ses = new SESClient({ region: SES_REGION });
const s3  = new S3Client({ region: REGION });

const BUCKET      = 'rnbevents716';
const FROM_EMAIL  = 'RNB Events <info@rnbevents716.com>';
const SITE_URL    = 'https://rnbevents716.com';
const URTHEDJ_API = process.env.URTHEDJ_API_URL || '';

const T = {
    EVENTS:       'rnb-events',
    CREATORS:     'rnb-creators',
    RSVPS:        'rnb-rsvps',
    SONGS:        'rnb-guest-songs',
    OTP:          'rnb-otp',
    SESSIONS:     'rnb-sessions',
    REGISTRY:     'rnb-guest-registry',
    MEMBER_RSVPS: 'rnb-member-rsvps'  // PK: phone  SK: eventId — guest RSVP index
};

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Guest-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Content-Type':                 'application/json'
};

/* ── Helpers ─────────────────────────────────────── */

function respond(code, data) {
    return { statusCode: code, headers: CORS, body: JSON.stringify(data) };
}

function generateId(len = 12) {
    return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function generateOTP() {
    // crypto.randomInt is cryptographically secure (Node 14.10+)
    return String(crypto.randomInt(100000, 999999));
}

/* ── Input sanitizers ────────────────────────────── */

function sanitizePhone(raw) {
    const cleaned = String(raw || '').replace(/[\s\-\(\)\.]/g, '');
    // Accept digits only or with leading +
    if (!/^\+?\d{10,15}$/.test(cleaned)) return null;
    // Normalize to E.164 US format
    const digits = cleaned.replace(/^\+/, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    if (cleaned.startsWith('+')) return cleaned;
    return null;
}

function sanitizeText(val, max = 200) {
    return String(val || '').trim().replace(/[<>]/g, '').slice(0, max);
}

function sanitizeEmail(raw) {
    const e = String(raw || '').toLowerCase().trim().slice(0, 254);
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

function sanitizeUrl(raw) {
    const u = String(raw || '').slice(0, 2000);
    return /^https?:\/\//i.test(u) ? u : '';
}

/* Sanitize the visual-customization payload sent from event-create.html.
   Caps every string; rejects non-whitelisted theme/iconStyle values; keeps fieldIcons
   to a known shape; clamps customLayout positions to numeric coords. */
const ALLOWED_THEMES      = ['night','gold','velvet','neon','dawn','royal','candy','linen','ivory','sage','plum','copper'];
const ALLOWED_ICON_STYLES = ['emoji','svg'];
const ICON_FIELD_KEYS     = ['title','date','venue','host','desc'];
const ALLOWED_ADDON_TYPES = ['link','playlist','registry','dresscode','food','parking','accommodations','info'];
function sanitizeCustomization(body) {
    const out = {};
    const ee = String(body.eventEmoji || '').slice(0, 16);
    if (ee) out.eventEmoji = ee;
    if (ALLOWED_ICON_STYLES.includes(body.iconStyle)) out.iconStyle = body.iconStyle;
    if (ALLOWED_THEMES.includes(body.theme))          out.theme     = body.theme;
    const fontVal = String(body.font || '').slice(0, 24).toLowerCase();
    if (/^[a-z]+$/.test(fontVal) && fontVal.length <= 24)             out.font      = fontVal;
    const effectVal = String(body.effect || '').slice(0, 24).toLowerCase();
    if (/^[a-z]+$/.test(effectVal) && effectVal.length <= 24)         out.effect    = effectVal;

    if (body.fieldIcons && typeof body.fieldIcons === 'object') {
        const fi = {};
        for (const k of ICON_FIELD_KEYS) {
            const v = body.fieldIcons[k];
            if (!v || typeof v !== 'object') continue;
            const emoji = String(v.emoji || '').slice(0, 16);
            const style = ALLOWED_ICON_STYLES.includes(v.style) ? v.style : 'emoji';
            if (emoji) fi[k] = { emoji, style };
        }
        if (Object.keys(fi).length) out.fieldIcons = fi;
    }

    if (body.customLayout && typeof body.customLayout === 'object') {
        const cl = {};
        let count = 0;
        for (const [key, pos] of Object.entries(body.customLayout)) {
            if (count++ > 20) break;
            if (!pos || typeof pos !== 'object') continue;
            const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
            if (!safeKey) continue;
            cl[safeKey] = {
                left: Math.max(-2000, Math.min(2000, Number(pos.left) || 0)),
                top:  Math.max(-2000, Math.min(2000, Number(pos.top)  || 0)),
                width: pos.width != null ? Math.max(20, Math.min(2000, Number(pos.width) || 0)) : undefined
            };
        }
        if (Object.keys(cl).length) out.customLayout = cl;
    }

    // Custom add-on rows (dress code, parking, registry URLs, etc.)
    if (Array.isArray(body.addons)) {
        const addons = [];
        for (const a of body.addons) {
            if (!a || typeof a !== 'object') continue;
            if (addons.length >= 12) break;
            const type  = ALLOWED_ADDON_TYPES.includes(a.type) ? a.type : 'info';
            const label = String(a.label || '').slice(0, 60);
            const value = String(a.value || '').slice(0, 500);
            if (!value) continue;
            addons.push({ type, label, value });
        }
        if (addons.length) out.addons = addons;
    }

    if (typeof body.requireVerify   === 'boolean') out.requireVerify   = body.requireVerify;
    if (typeof body.showGuests      === 'boolean') out.showGuests      = body.showGuests;
    // Frontend sends `playlist`; normalize to playlistEnabled (DynamoDB-safe)
    if (typeof body.playlist        === 'boolean') out.playlistEnabled = body.playlist;
    if (typeof body.playlistEnabled === 'boolean') out.playlistEnabled = body.playlistEnabled;

    return out;
}

/* ── Auth helpers ────────────────────────────────── */

async function getCreatorFromToken(event) {
    const auth  = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'] || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token || token.length !== 64) return null;
    try {
        const res = await ddb.send(new GetCommand({ TableName: T.SESSIONS, Key: { token } }));
        if (!res.Item) return null;
        if (res.Item.expiresAt < Math.floor(Date.now() / 1000)) return null;
        if (res.Item.type !== 'creator') return null;
        return res.Item;
    } catch { return null; }
}

async function getGuestFromToken(event, eventId) {
    const token = ((event.headers || {})['x-guest-token'] || '').trim();
    if (!token || token.length !== 64) return null;
    try {
        const res = await ddb.send(new GetCommand({ TableName: T.SESSIONS, Key: { token } }));
        if (!res.Item) return null;
        if (res.Item.expiresAt < Math.floor(Date.now() / 1000)) return null;
        if (res.Item.type !== 'guest') return null;
        if (res.Item.eventId !== eventId) return null;
        return res.Item;
    } catch { return null; }
}

async function getMemberFromToken(event) {
    const auth  = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'] || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token || token.length !== 64) return null;
    try {
        const res = await ddb.send(new GetCommand({ TableName: T.SESSIONS, Key: { token } }));
        if (!res.Item) return null;
        if (res.Item.expiresAt < Math.floor(Date.now() / 1000)) return null;
        if (res.Item.type !== 'member' && res.Item.type !== 'creator') return null;
        return res.Item;
    } catch { return null; }
}

/* ── OTP rate-limit check ────────────────────────── */

async function checkOtpRateLimit(phone, purpose) {
    const res = await ddb.send(new GetCommand({ TableName: T.OTP, Key: { phone, purpose } })).catch(() => null);
    return res?.Item?.sendCount >= 3;
}

/* ─────────────────────────────────────────────────
   ROUTE HANDLERS
───────────────────────────────────────────────── */

/* POST /creator/signup ── register + send OTP */
async function creatorSignup(body) {
    const name     = sanitizeText(body.name, 100);
    const email    = sanitizeEmail(body.email);
    const phone    = sanitizePhone(body.phone);
    const password = String(body.password || '');

    if (!name || name.length < 2)   return respond(400, { error: 'Valid name required' });
    if (!email)                      return respond(400, { error: 'Valid email required' });
    if (!phone)                      return respond(400, { error: 'Valid US phone number required' });
    if (password.length < 8)         return respond(400, { error: 'Password must be at least 8 characters' });

    if (await checkOtpRateLimit(phone, 'creator_signup')) {
        return respond(429, { error: 'Too many requests. Wait 10 minutes and try again.' });
    }

    const prev  = await ddb.send(new GetCommand({ TableName: T.OTP, Key: { phone, purpose: 'creator_signup' } })).catch(() => null);
    const code  = generateOTP();
    const passwordHash = await bcrypt.hash(password, 10);

    await ddb.send(new PutCommand({
        TableName: T.OTP,
        Item: {
            phone,
            purpose: 'creator_signup',
            code,
            expiresAt:   Math.floor(Date.now() / 1000) + 600,
            pendingData: { name, email, passwordHash },
            sendCount:   (prev?.Item?.sendCount || 0) + 1
        }
    }));

    await sns.send(new PublishCommand({
        PhoneNumber: phone,
        Message: `RNB Events: Your verification code is ${code}. Valid for 10 minutes. Do not share this code.`,
        MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' }
        }
    }));

    return respond(200, { message: 'Verification code sent' });
}

/* POST /creator/verify ── confirm OTP → create account */
async function creatorVerify(body) {
    const phone = sanitizePhone(body.phone);
    const code  = String(body.code || '').replace(/\D/g, '').slice(0, 6);

    if (!phone || code.length !== 6) return respond(400, { error: 'Phone and 6-digit code required' });

    const otpRes = await ddb.send(new GetCommand({ TableName: T.OTP, Key: { phone, purpose: 'creator_signup' } })).catch(() => null);
    if (!otpRes?.Item)                                             return respond(400, { error: 'No pending verification for this number' });
    if (otpRes.Item.expiresAt < Math.floor(Date.now() / 1000))    return respond(400, { error: 'Code expired. Request a new one.' });
    if (otpRes.Item.code !== code)                                 return respond(400, { error: 'Invalid code' });

    const { name, email, passwordHash } = otpRes.Item.pendingData;
    const creatorId = generateId(16);

    await Promise.all([
        ddb.send(new PutCommand({
            TableName: T.CREATORS,
            Item: { phone, creatorId, name, email, passwordHash, verified: true, createdAt: new Date().toISOString() }
        })),
        ddb.send(new DeleteCommand({ TableName: T.OTP, Key: { phone, purpose: 'creator_signup' } }))
    ]);

    const token = crypto.randomBytes(32).toString('hex');
    await ddb.send(new PutCommand({
        TableName: T.SESSIONS,
        Item: { token, phone, creatorId, name, type: 'creator', expiresAt: Math.floor(Date.now() / 1000) + 604800 }
    }));

    return respond(200, { token, creator: { creatorId, name, email, phone } });
}

/* POST /creator/login ── phone + password → session */
async function creatorLogin(body) {
    const phone    = sanitizePhone(body.phone);
    const password = String(body.password || '');

    if (!phone || !password) return respond(400, { error: 'Phone and password required' });

    const res = await ddb.send(new GetCommand({ TableName: T.CREATORS, Key: { phone } })).catch(() => null);
    if (!res?.Item) return respond(401, { error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, res.Item.passwordHash);
    if (!match) return respond(401, { error: 'Invalid credentials' });

    const token = crypto.randomBytes(32).toString('hex');
    await ddb.send(new PutCommand({
        TableName: T.SESSIONS,
        Item: {
            token,
            phone,
            creatorId: res.Item.creatorId,
            name:      res.Item.name,
            type:      'creator',
            expiresAt: Math.floor(Date.now() / 1000) + 604800
        }
    }));

    return respond(200, { token, creator: { creatorId: res.Item.creatorId, name: res.Item.name, email: res.Item.email, phone } });
}

/* POST /creator/google-auth ── Google ID token → session */
async function creatorGoogleAuth(body) {
    const idToken = String(body.idToken || '').trim();
    if (!idToken || idToken.length > 4096) return respond(400, { error: 'Google ID token required' });

    // Verify with Google tokeninfo endpoint (server-side verification)
    let googleUser;
    try {
        const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
        if (!r.ok) return respond(401, { error: 'Invalid Google token' });
        googleUser = await r.json();
    } catch {
        return respond(401, { error: 'Could not verify Google token' });
    }

    // Validate token claims
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && googleUser.aud !== clientId) {
        return respond(401, { error: 'Token audience mismatch' });
    }
    if (googleUser.email_verified !== 'true') {
        return respond(401, { error: 'Google email not verified' });
    }
    const now = Math.floor(Date.now() / 1000);
    if (!googleUser.exp || parseInt(googleUser.exp) < now) {
        return respond(401, { error: 'Google token expired' });
    }

    const googleId  = String(googleUser.sub || '').slice(0, 64);
    const email     = String(googleUser.email || '').slice(0, 200).toLowerCase();
    const name      = String(googleUser.name || googleUser.given_name || 'Creator').slice(0, 100);
    if (!googleId || !email) return respond(401, { error: 'Incomplete Google profile' });

    // Use "google:{sub}" as the creator PK (avoids collisions with phone-based PKs)
    const creatorKey = 'google:' + googleId;

    let existing = await ddb.send(new GetCommand({ TableName: T.CREATORS, Key: { phone: creatorKey } })).catch(() => null);

    if (!existing?.Item) {
        // First-time Google sign-in — create creator account
        const creatorId = generateId(16);
        await ddb.send(new PutCommand({
            TableName: T.CREATORS,
            Item: {
                phone:        creatorKey,
                creatorId,
                name,
                email,
                googleId,
                authMethod:   'google',
                passwordHash: null,
                verified:     true,
                createdAt:    new Date().toISOString()
            }
        }));
        existing = { Item: { phone: creatorKey, creatorId, name, email } };
    }

    const token = crypto.randomBytes(32).toString('hex');
    await ddb.send(new PutCommand({
        TableName: T.SESSIONS,
        Item: {
            token,
            phone:     creatorKey,
            creatorId: existing.Item.creatorId,
            name:      existing.Item.name,
            type:      'creator',
            expiresAt: Math.floor(Date.now() / 1000) + 604800
        }
    }));

    return respond(200, {
        token,
        creator: {
            creatorId: existing.Item.creatorId,
            name:      existing.Item.name,
            email:     existing.Item.email
        }
    });
}

/* GET /creator/events ── list creator's events */
async function getCreatorEvents(event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const res = await ddb.send(new QueryCommand({
        TableName:                 T.EVENTS,
        IndexName:                 'creatorId-index',
        KeyConditionExpression:    'creatorId = :cid',
        ExpressionAttributeValues: { ':cid': creator.creatorId }
    })).catch(() => ({ Items: [] }));

    return respond(200, { events: (res.Items || []).sort((a, b) => b.createdAt > a.createdAt ? 1 : -1) });
}

/* POST /events ── create an event */
async function createEvent(body, event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const eventName   = sanitizeText(body.eventName, 150);
    const eventType   = sanitizeText(body.eventType, 60);
    const venue       = sanitizeText(body.venue, 200);
    const description = sanitizeText(body.description, 1500);
    const eventDate   = String(body.eventDate || '').slice(0, 10);
    const eventTime   = sanitizeText(body.eventTime, 10);
    const coverImageUrl = sanitizeUrl(body.coverImageUrl);
    const customization = sanitizeCustomization(body);

    if (!eventName || eventName.length < 2) return respond(400, { error: 'Event name required' });
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return respond(400, { error: 'Valid date required (YYYY-MM-DD)' });
    if (!venue)      return respond(400, { error: 'Venue required' });

    const status = body.status === 'draft' ? 'draft' : 'published';

    // Enforce 5-draft limit per creator
    if (status === 'draft') {
        const existing = await ddb.send(new QueryCommand({
            TableName:                 T.EVENTS,
            IndexName:                 'creatorId-index',
            KeyConditionExpression:    'creatorId = :cid',
            ExpressionAttributeValues: { ':cid': creator.creatorId }
        })).catch(() => ({ Items: [] }));
        const draftCount = (existing.Items || []).filter(e => e.status === 'draft').length;
        if (draftCount >= 5) {
            return respond(400, { error: 'You have reached the 5 draft limit. Delete a draft to save a new one.', code: 'DRAFT_LIMIT' });
        }
    }

    const creatorRec = await ddb.send(new GetCommand({ TableName: T.CREATORS, Key: { phone: creator.phone } })).catch(() => null);
    const creatorEmail = creatorRec?.Item?.email || '';

    // Create linked urTheDJ PartySession (non-fatal, skip for drafts)
    let urthedj_sessionId = null;
    if (URTHEDJ_API && status === 'published') {
        try {
            const pr = await fetch(`${URTHEDJ_API}/party/create`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ partyName: eventName, createdBy: creator.name })
            });
            if (pr.ok) {
                const pd = await pr.json();
                urthedj_sessionId = pd.sessionId || pd.session?.sessionId || null;
            }
        } catch { /* non-fatal */ }
    }

    const eventId = generateId(12);
    await ddb.send(new PutCommand({
        TableName: T.EVENTS,
        Item: {
            eventId,
            creatorId:    creator.creatorId,
            creatorName:  creator.name,
            creatorEmail,
            eventName,
            eventType,
            eventDate,
            eventTime,
            venue,
            description,
            coverImageUrl,
            status,
            urthedj_sessionId,
            ...customization,
            createdAt:         new Date().toISOString()
        }
    }));

    return respond(200, { eventId, status, shareUrl: `${SITE_URL}/event/${eventId}` });
}

/* POST /events/:id/update ── update event fields */
async function updateEvent(eventId, body, event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const existing = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!existing?.Item) return respond(404, { error: 'Event not found' });
    if (existing.Item.creatorId !== creator.creatorId) return respond(403, { error: 'Not authorized to edit this event' });

    const eventName   = sanitizeText(body.eventName, 150);
    const eventType   = sanitizeText(body.eventType, 60);
    const venue       = sanitizeText(body.venue, 200);
    const description = sanitizeText(body.description, 1500);
    const eventDate   = String(body.eventDate || '').slice(0, 10);
    const eventTime   = sanitizeText(body.eventTime, 10);
    const coverImageUrl = sanitizeUrl(body.coverImageUrl);
    const customization = sanitizeCustomization(body);
    const newStatus   = body.status === 'draft' ? 'draft' : 'published';

    if (!eventName || eventName.length < 2) return respond(400, { error: 'Event name required' });
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return respond(400, { error: 'Valid date required' });
    if (!venue) return respond(400, { error: 'Venue required' });

    await ddb.send(new UpdateCommand({
        TableName: T.EVENTS,
        Key: { eventId },
        UpdateExpression: 'SET eventName=:n, eventType=:t, eventDate=:d, eventTime=:tm, venue=:v, description=:desc, coverImageUrl=:img, #st=:s, updatedAt=:u, eventEmoji=:ee, iconStyle=:is, theme=:th, #fnt=:ft, effect=:ef, fieldIcons=:fi, customLayout=:cl, addons=:ad, requireVerify=:rv, showGuests=:sg, playlistEnabled=:pl',
        ExpressionAttributeNames:  { '#st': 'status', '#fnt': 'font' },
        ExpressionAttributeValues: {
            ':n': eventName, ':t': eventType, ':d': eventDate, ':tm': eventTime,
            ':v': venue, ':desc': description, ':img': coverImageUrl || null,
            ':s': newStatus, ':u': new Date().toISOString(),
            ':ee': customization.eventEmoji || null,
            ':is': customization.iconStyle  || null,
            ':th': customization.theme      || null,
            ':ft': customization.font       || null,
            ':ef': customization.effect     || null,
            ':fi': customization.fieldIcons || null,
            ':cl': customization.customLayout || null,
            ':ad': Array.isArray(customization.addons) ? customization.addons : [],
            ':rv': customization.requireVerify === false ? false : true,
            ':sg': customization.showGuests    === false ? false : true,
            ':pl': customization.playlistEnabled === false ? false : true
        }
    }));

    return respond(200, { eventId, status: newStatus, shareUrl: `${SITE_URL}/event/${eventId}` });
}

/* DELETE /events/:id ── delete an event (creator only) */
async function deleteEvent(eventId, event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const existing = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!existing?.Item) return respond(404, { error: 'Event not found' });
    if (existing.Item.creatorId !== creator.creatorId) return respond(403, { error: 'Not authorized to delete this event' });

    await ddb.send(new DeleteCommand({ TableName: T.EVENTS, Key: { eventId } }));
    return respond(200, { ok: true });
}

/* GET /events/:id ── public teaser */
async function getEvent(eventId) {
    if (!eventId || eventId.length > 30) return respond(400, { error: 'Invalid event ID' });

    const res = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!res?.Item) return respond(404, { error: 'Event not found' });

    // Return teaser fields + visual customization so event.html can render the same look the host previewed.
    // Full sensitive details (description, address, internal IDs) still require RSVP via /events/:id/full.
    const it = res.Item;
    return respond(200, {
        eventId:        it.eventId,
        eventName:      it.eventName,
        creatorName:    it.creatorName,
        eventDate:      it.eventDate,
        eventTime:      it.eventTime,
        venue:          it.venue,
        description:    it.description || '',
        coverImageUrl:  it.coverImageUrl,
        eventType:      it.eventType,
        eventEmoji:     it.eventEmoji  || null,
        iconStyle:      it.iconStyle   || null,
        theme:          it.theme       || null,
        font:           it.font        || null,
        effect:         it.effect      || null,
        fieldIcons:     it.fieldIcons  || null,
        customLayout:   it.customLayout|| null,
        addons:         Array.isArray(it.addons) ? it.addons : [],
        requireVerify:  it.requireVerify !== false,
        showGuests:     it.showGuests    !== false,
        playlistEnabled: it.playlistEnabled !== false
    });
}

/* GET /events/:id/full ── full details (confirmed guests only) */
async function getEventFull(eventId, event) {
    const guest = await getGuestFromToken(event, eventId);
    if (!guest) return respond(401, { error: 'RSVP confirmation required to view full event details' });

    const res = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!res?.Item) return respond(404, { error: 'Event not found' });

    // Strip internal fields
    const { creatorEmail, urthedj_sessionId, ...safe } = res.Item;
    return respond(200, safe);
}

/* GET /events/:id/my-songs ── guest's saved songs */
async function getMySOungs(eventId, event) {
    const guest = await getGuestFromToken(event, eventId);
    if (!guest) return respond(401, { error: 'Guest session required' });

    const res = await ddb.send(new QueryCommand({
        TableName:                 T.SONGS,
        KeyConditionExpression:    'pk = :pk',
        ExpressionAttributeValues: { ':pk': `${guest.phone}#${eventId}` }
    })).catch(() => ({ Items: [] }));

    return respond(200, { songs: (res.Items || []).sort((a, b) => a.songIndex - b.songIndex) });
}

/* POST /events/:id/guests ── add guests to invite list */
async function addGuests(eventId, body, event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const evRes = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!evRes?.Item)                              return respond(404, { error: 'Event not found' });
    if (evRes.Item.creatorId !== creator.creatorId) return respond(403, { error: 'Access denied' });

    const guests = Array.isArray(body.guests) ? body.guests.slice(0, 500) : [];
    if (!guests.length) return respond(400, { error: 'At least one guest required' });

    const now    = new Date().toISOString();
    const method = body.method === 'bulk' ? 'bulk' : 'manual';
    let added = 0, skipped = 0;

    const ops = guests.map(async g => {
        const phone     = sanitizePhone(g.phone);
        const guestName = sanitizeText(g.name, 100) || 'Guest';
        const guestEmail = g.email ? sanitizeEmail(g.email) : null;

        if (!phone) { skipped++; return; }

        await ddb.send(new PutCommand({
            TableName: T.REGISTRY,
            Item: { eventId, guestPhone: phone, guestName, guestEmail, invitedAt: now, inviteMethod: method }
        }));
        added++;

        if (guestEmail) {
            await sendInviteEmail(guestEmail, guestName, evRes.Item).catch(() => {});
        }
    });

    await Promise.allSettled(ops);
    return respond(200, { added, skipped });
}

/* POST /otp/send ── send guest RSVP OTP */
async function sendGuestOtp(body) {
    const phone   = sanitizePhone(body.phone);
    const eventId = sanitizeText(body.eventId, 30);

    if (!phone)   return respond(400, { error: 'Valid US phone number required' });
    if (!eventId) return respond(400, { error: 'Event ID required' });

    const evRes = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!evRes?.Item) return respond(404, { error: 'Event not found' });

    if (await checkOtpRateLimit(phone, 'guest_rsvp')) {
        return respond(429, { error: 'Too many attempts. Please wait before trying again.' });
    }

    const prev = await ddb.send(new GetCommand({ TableName: T.OTP, Key: { phone, purpose: 'guest_rsvp' } })).catch(() => null);
    const code = generateOTP();

    await ddb.send(new PutCommand({
        TableName: T.OTP,
        Item: {
            phone,
            purpose:   'guest_rsvp',
            code,
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            eventId,
            sendCount: (prev?.Item?.sendCount || 0) + 1
        }
    }));

    await sns.send(new PublishCommand({
        PhoneNumber: phone,
        Message: `RNB Events: Your RSVP code is ${code}. Valid for 10 minutes.`,
        MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' }
        }
    }));

    return respond(200, { message: 'Code sent' });
}

/* POST /otp/verify ── verify guest OTP → confirm RSVP */
async function verifyGuestOtp(body) {
    const phone      = sanitizePhone(body.phone);
    const code       = String(body.code || '').replace(/\D/g, '').slice(0, 6);
    const eventId    = sanitizeText(body.eventId, 30);
    const guestName  = sanitizeText(body.name, 100) || 'Guest';
    const rsvpStatus = body.status === 'declined' ? 'declined' : 'confirmed';

    if (!phone || code.length !== 6 || !eventId) {
        return respond(400, { error: 'Phone, 6-digit code, and event ID required' });
    }

    const otpRes = await ddb.send(new GetCommand({ TableName: T.OTP, Key: { phone, purpose: 'guest_rsvp' } })).catch(() => null);
    if (!otpRes?.Item)                                          return respond(400, { error: 'No pending code for this number' });
    if (otpRes.Item.expiresAt < Math.floor(Date.now() / 1000)) return respond(400, { error: 'Code expired. Request a new one.' });
    if (otpRes.Item.code !== code)                              return respond(400, { error: 'Invalid code' });
    if (otpRes.Item.eventId !== eventId)                        return respond(400, { error: 'Code is not valid for this event' });

    const evRes = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!evRes?.Item) return respond(404, { error: 'Event not found' });

    await Promise.all([
        ddb.send(new PutCommand({
            TableName: T.RSVPS,
            Item: {
                eventId,
                guestPhone:  phone,
                guestName,
                status:      rsvpStatus,
                confirmedAt: new Date().toISOString(),
                songCount:   0
            }
        })),
        ddb.send(new DeleteCommand({ TableName: T.OTP, Key: { phone, purpose: 'guest_rsvp' } })),
        // Write to member-rsvps index so GET /member/dashboard can list this guest's events
        ddb.send(new PutCommand({
            TableName: T.MEMBER_RSVPS,
            Item: {
                phone,
                eventId,
                guestName,
                status:       rsvpStatus,
                rsvpAt:       new Date().toISOString(),
                eventName:    evRes.Item.eventName,
                eventDate:    evRes.Item.eventDate,
                eventTime:    evRes.Item.eventTime  || '',
                eventType:    evRes.Item.eventType  || '',
                venue:        evRes.Item.venue       || '',
                coverImageUrl: evRes.Item.coverImageUrl || '',
                creatorName:  evRes.Item.creatorName || ''
            }
        }))
    ]);

    // Issue guest session (24h)
    const guestToken = crypto.randomBytes(32).toString('hex');
    await ddb.send(new PutCommand({
        TableName: T.SESSIONS,
        Item: {
            token:     guestToken,
            phone,
            eventId,
            guestName,
            type:      'guest',
            expiresAt: Math.floor(Date.now() / 1000) + 86400
        }
    }));

    // Non-blocking notifications
    if (rsvpStatus === 'confirmed') {
        const regRes = await ddb.send(new GetCommand({ TableName: T.REGISTRY, Key: { eventId, guestPhone: phone } })).catch(() => null);
        const guestEmail = regRes?.Item?.guestEmail || null;
        if (guestEmail) {
            sendConfirmationEmail(guestEmail, guestName, evRes.Item).catch(() => {});
        }
        notifyCreatorOfRsvp(evRes.Item, guestName, rsvpStatus).catch(() => {});
    }

    const { creatorEmail, urthedj_sessionId, ...safeEvent } = evRes.Item;
    return respond(200, { guestToken, status: rsvpStatus, event: safeEvent });
}

/* Verify a Google ID token and return the parsed payload, or null on failure. */
async function verifyGoogleIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) return null;
    try {
        const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
        if (!r.ok) return null;
        const u = await r.json();
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (clientId && u.aud !== clientId) return null;
        if (u.email_verified !== 'true') return null;
        const now = Math.floor(Date.now() / 1000);
        if (!u.exp || parseInt(u.exp) < now) return null;
        return u;
    } catch { return null; }
}

/* Generic paginated Scan helper for member-rsvps. DO NOT use Scan Limit—DynamoDB applies
   Limit BEFORE the FilterExpression, so Limit:1 returns 0 items as soon as the first table
   row doesn't match. We scan all pages (capped at 10) until a match is found. */
async function scanMemberRsvps(filterExpr, values) {
    let lastKey;
    let pages = 0;
    try {
        do {
            const r = await ddb.send(new ScanCommand({
                TableName: T.MEMBER_RSVPS,
                FilterExpression: filterExpr,
                ExpressionAttributeValues: values,
                ExclusiveStartKey: lastKey
            }));
            if (r.Items && r.Items.length) return r.Items[0];
            lastKey = r.LastEvaluatedKey;
            pages++;
        } while (lastKey && pages < 10);
    } catch { /* fall through */ }
    return null;
}

/* Look up an existing guest profile by Google subject ID, falling back to email
   (handles users who previously RSVP'd via phone using the same Google email). */
async function findGuestByGoogle(googleId, email) {
    if (googleId) {
        const byId = await scanMemberRsvps('googleId = :g', { ':g': googleId });
        if (byId) return byId;
    }
    if (email) {
        const byEmail = await scanMemberRsvps('guestEmail = :e', { ':e': email });
        if (byEmail) return byEmail;
    }
    return null;
}
// Legacy single-arg alias kept for any internal callers.
async function findGuestByGoogleId(googleId) { return findGuestByGoogle(googleId, null); }

/* Look up an existing guest profile by phone number (Query on member-rsvps PK). */
async function findGuestByPhone(phone) {
    if (!phone) return null;
    try {
        const r = await ddb.send(new QueryCommand({
            TableName: T.MEMBER_RSVPS,
            KeyConditionExpression: 'phone = :p',
            ExpressionAttributeValues: { ':p': phone },
            Limit: 1
        }));
        return (r.Items && r.Items[0]) || null;
    } catch { return null; }
}

/* POST /guest/phone-lookup — prefill the OTP form when a returning guest types their phone.
   Returns 200 always (never blocks the flow) so the frontend can decide whether to show name. */
async function guestPhoneLookup(body) {
    const phone = sanitizePhone(body.phone);
    if (!phone) return respond(200, { found: false });
    const existing = await findGuestByPhone(phone);
    if (!existing) return respond(200, { found: false });
    return respond(200, {
        found: true,
        name:  existing.guestName  || null,
        email: existing.guestEmail || null
    });
}

/* POST /guest/google-lookup — verify Google token, return cached profile (no RSVP write).
   Returns { found: false } (200) if no prior RSVP — frontend then collects phone only. */
async function guestGoogleLookup(body) {
    const googleUser = await verifyGoogleIdToken(body.idToken);
    if (!googleUser) return respond(401, { error: 'Invalid Google token' });
    const googleId = String(googleUser.sub || '').slice(0, 64);
    const email    = sanitizeEmail(googleUser.email);
    if (!googleId) return respond(401, { error: 'Incomplete Google profile' });

    const existing = await findGuestByGoogle(googleId, email);
    if (!existing) return respond(200, { found: false });

    return respond(200, {
        found: true,
        phone: existing.phone     || null,
        name:  existing.guestName || null,
        email: existing.guestEmail|| null
    });
}

/* POST /guest/google-auth — Google ID token + phone → guest RSVP.
   Postal/country no longer required — they were friction with no privacy benefit.
   Phone is still required (it's the PK for member-rsvps), but we auto-fill it from cache. */
async function guestGoogleAuth(body) {
    const idToken    = String(body.idToken || '').trim();
    if (!idToken || idToken.length > 4096) return respond(400, { error: 'Google ID token required' });

    let phone        = sanitizePhone(body.phone);
    const eventId    = sanitizeText(body.eventId, 30);
    const rsvpStatus = body.status === 'declined' ? 'declined' : 'confirmed';

    if (!eventId) return respond(400, { error: 'Event ID required' });

    // Verify Google token server-side
    const googleUser = await verifyGoogleIdToken(idToken);
    if (!googleUser) return respond(401, { error: 'Invalid Google token' });

    const googleId = String(googleUser.sub || '').slice(0, 64);
    const email    = sanitizeEmail(googleUser.email);
    const guestName = sanitizeText(body.name || googleUser.name || googleUser.given_name || 'Guest', 100);
    if (!googleId || !email) return respond(401, { error: 'Incomplete Google profile' });

    // Silent re-auth: pull phone from any prior member-rsvp row (by googleId OR email).
    let cached = null;
    if (!phone) {
        cached = await findGuestByGoogle(googleId, email);
        if (cached && cached.phone) phone = cached.phone;
    }

    if (!phone) return respond(400, { error: 'Phone number required', code: 'NEED_PHONE' });

    // Load event
    const evRes = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!evRes?.Item) return respond(404, { error: 'Event not found' });

    // Cross-event duplicate check: if this phone is already linked to a different googleId
    // in any prior member-rsvps row, refuse — they need to sign in with that original Google account.
    try {
        const prior = await ddb.send(new QueryCommand({
            TableName: T.MEMBER_RSVPS,
            KeyConditionExpression: 'phone = :p',
            ExpressionAttributeValues: { ':p': phone },
            Limit: 25
        }));
        if (prior?.Items && prior.Items.length) {
            const conflict = prior.Items.find(it => it.googleId && it.googleId !== googleId);
            if (conflict) {
                return respond(409, { error: 'This phone is already linked to another Google account. Sign in with that account or use a different number.' });
            }
        }
    } catch { /* non-fatal */ }

    // Write RSVP, member-rsvps (denormalized with profile fields), session
    await Promise.all([
        ddb.send(new PutCommand({
            TableName: T.RSVPS,
            Item: {
                eventId,
                guestPhone:  phone,
                guestName,
                guestEmail:  email,
                status:      rsvpStatus,
                confirmedAt: new Date().toISOString(),
                authMethod:  'google',
                songCount:   0
            }
        })),
        ddb.send(new PutCommand({
            TableName: T.MEMBER_RSVPS,
            Item: {
                phone,
                eventId,
                guestName,
                guestEmail:    email,
                googleId,
                accountType:   'google',
                recoveryEmail: email,  // Google email doubles as recovery
                status:        rsvpStatus,
                rsvpAt:        new Date().toISOString(),
                eventName:     evRes.Item.eventName,
                eventDate:     evRes.Item.eventDate,
                eventTime:     evRes.Item.eventTime  || '',
                eventType:     evRes.Item.eventType  || '',
                venue:         evRes.Item.venue       || '',
                coverImageUrl: evRes.Item.coverImageUrl || '',
                creatorName:   evRes.Item.creatorName || ''
            }
        })),
        ddb.send(new PutCommand({
            TableName: T.REGISTRY,
            Item: {
                eventId,
                guestPhone:  phone,
                guestName,
                guestEmail:  email,
                googleId,
                addedAt:     new Date().toISOString()
            }
        })).catch(() => {})
    ]);

    const guestToken = crypto.randomBytes(32).toString('hex');
    await ddb.send(new PutCommand({
        TableName: T.SESSIONS,
        Item: {
            token:     guestToken,
            phone,
            eventId,
            guestName,
            type:      'guest',
            authMethod: 'google',
            googleId,
            email,
            expiresAt: Math.floor(Date.now() / 1000) + 86400
        }
    }));

    if (rsvpStatus === 'confirmed') {
        notifyCreatorOfRsvp(evRes.Item, guestName, rsvpStatus).catch(() => {});
    }

    const { creatorEmail, urthedj_sessionId, ...safeEvent } = evRes.Item;
    return respond(200, { guestToken, status: rsvpStatus, event: safeEvent, accountType: 'google' });
}

/* POST /guest/recovery-email ── add recovery email to phone-only guest account */
async function guestRecoveryEmail(body) {
    const guestToken = String(body.guestToken || '').trim();
    const email      = sanitizeEmail(body.email);

    if (!guestToken || guestToken.length > 128) return respond(400, { error: 'Guest session required' });
    if (!email)                                  return respond(400, { error: 'Valid email required' });

    // Resolve session → phone
    const sessRes = await ddb.send(new GetCommand({ TableName: T.SESSIONS, Key: { token: guestToken } })).catch(() => null);
    if (!sessRes?.Item || sessRes.Item.type !== 'guest') return respond(401, { error: 'Invalid guest session' });
    if (sessRes.Item.expiresAt && sessRes.Item.expiresAt < Math.floor(Date.now() / 1000)) {
        return respond(401, { error: 'Session expired' });
    }

    const phone = sessRes.Item.phone;

    // Update every member-rsvps row for this phone with the recovery email
    let updated = 0;
    try {
        const rows = await ddb.send(new QueryCommand({
            TableName: T.MEMBER_RSVPS,
            KeyConditionExpression: 'phone = :p',
            ExpressionAttributeValues: { ':p': phone }
        }));
        const items = (rows?.Items) || [];
        await Promise.all(items.map(it => ddb.send(new UpdateCommand({
            TableName: T.MEMBER_RSVPS,
            Key: { phone: it.phone, eventId: it.eventId },
            UpdateExpression: 'SET recoveryEmail = :e, recoveryEmailSavedAt = :t',
            ExpressionAttributeValues: { ':e': email, ':t': new Date().toISOString() }
        })).then(() => { updated++; }).catch(() => {})));
    } catch { /* non-fatal */ }

    return respond(200, { ok: true, updated });
}


async function addSong(eventId, body, event) {
    const guest = await getGuestFromToken(event, eventId);
    if (!guest) return respond(401, { error: 'Guest session required' });

    const rsvpRes = await ddb.send(new GetCommand({ TableName: T.RSVPS, Key: { eventId, guestPhone: guest.phone } })).catch(() => null);
    if (!rsvpRes?.Item || rsvpRes.Item.status !== 'confirmed') return respond(403, { error: 'Confirmed RSVP required to add songs' });
    if ((rsvpRes.Item.songCount || 0) >= 5) return respond(400, { error: 'Maximum 5 songs per guest already reached' });

    const songTitle    = sanitizeText(body.songTitle, 200);
    const artistName   = sanitizeText(body.artistName, 200);
    const albumName    = sanitizeText(body.albumName, 200);
    const artworkUrl   = sanitizeUrl(body.artworkUrl);
    const appleMusicId = sanitizeText(body.appleMusicId, 50);
    const sourceProvider = body.sourceProvider === 'apple-music' ? 'apple-music' : 'catalog';

    if (!songTitle || !artistName) return respond(400, { error: 'Song title and artist are required' });

    const songIndex = (rsvpRes.Item.songCount || 0) + 1;

    await Promise.all([
        ddb.send(new PutCommand({
            TableName: T.SONGS,
            Item: {
                pk:            `${guest.phone}#${eventId}`,
                songIndex,
                eventId,
                guestPhone:    guest.phone,
                guestName:     rsvpRes.Item.guestName,
                songTitle,
                artistName,
                albumName,
                artworkUrl,
                appleMusicId,
                sourceProvider,
                addedAt:       new Date().toISOString()
            }
        })),
        ddb.send(new UpdateCommand({
            TableName:                 T.RSVPS,
            Key:                       { eventId, guestPhone: guest.phone },
            UpdateExpression:          'SET songCount = songCount + :one',
            ExpressionAttributeValues: { ':one': 1 }
        }))
    ]);

    // Forward to urTheDJ PartySession (non-blocking)
    const evRes = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (evRes?.Item?.urthedj_sessionId && URTHEDJ_API) {
        fetch(`${URTHEDJ_API}/song-request`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                sessionId:   evRes.Item.urthedj_sessionId,
                requestedBy: rsvpRes.Item.guestName,
                song:        { songTitle, artistName, albumName, artworkUrl, appleMusicId, sourceProvider }
            })
        }).catch(() => {});
    }

    return respond(200, { songIndex, remaining: 5 - songIndex });
}

/* DELETE /events/:id/songs/:index ── remove a song */
async function removeSong(eventId, songIndexStr, event) {
    const guest = await getGuestFromToken(event, eventId);
    if (!guest) return respond(401, { error: 'Guest session required' });

    const songIndex = parseInt(songIndexStr, 10);
    if (!songIndex || songIndex < 1 || songIndex > 5) return respond(400, { error: 'Invalid song index' });

    const rsvpRes = await ddb.send(new GetCommand({ TableName: T.RSVPS, Key: { eventId, guestPhone: guest.phone } })).catch(() => null);
    if (!rsvpRes?.Item) return respond(403, { error: 'RSVP not found' });

    await Promise.all([
        ddb.send(new DeleteCommand({ TableName: T.SONGS, Key: { pk: `${guest.phone}#${eventId}`, songIndex } })),
        ddb.send(new UpdateCommand({
            TableName:                 T.RSVPS,
            Key:                       { eventId, guestPhone: guest.phone },
            UpdateExpression:          'SET songCount = :newCount',
            ExpressionAttributeValues: { ':newCount': Math.max(0, (rsvpRes.Item.songCount || 1) - 1) }
        }))
    ]);

    return respond(200, { message: 'Song removed' });
}

/* GET /events/:id/admin ── full admin view */
async function getEventAdmin(eventId, event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const [evRes, rsvpsRes] = await Promise.all([
        ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })),
        ddb.send(new QueryCommand({ TableName: T.RSVPS, KeyConditionExpression: 'eventId = :e', ExpressionAttributeValues: { ':e': eventId } }))
    ]);

    if (!evRes?.Item)                              return respond(404, { error: 'Event not found' });
    if (evRes.Item.creatorId !== creator.creatorId) return respond(403, { error: 'Access denied' });

    const guests    = rsvpsRes.Items || [];
    const confirmed = guests.filter(g => g.status === 'confirmed');

    // Fetch all songs for confirmed guests
    const songResults = await Promise.allSettled(
        confirmed.map(g =>
            ddb.send(new QueryCommand({
                TableName:                 T.SONGS,
                KeyConditionExpression:    'pk = :pk',
                ExpressionAttributeValues: { ':pk': `${g.guestPhone}#${eventId}` }
            }))
        )
    );

    const songs = songResults.flatMap(r => r.status === 'fulfilled' ? (r.value.Items || []) : []);

    return respond(200, {
        event:   evRes.Item,
        guests,
        songs:   songs.sort((a, b) => a.guestName.localeCompare(b.guestName)),
        summary: {
            total:     guests.length,
            confirmed: confirmed.length,
            declined:  guests.filter(g => g.status === 'declined').length,
            pending:   guests.filter(g => g.status === 'pending').length,
            songs:     songs.length
        }
    });
}

/* PUT /events/:id/seating ── assign table + seat per guest */
async function updateSeating(eventId, body, event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const evRes = await ddb.send(new GetCommand({ TableName: T.EVENTS, Key: { eventId } })).catch(() => null);
    if (!evRes?.Item)                              return respond(404, { error: 'Event not found' });
    if (evRes.Item.creatorId !== creator.creatorId) return respond(403, { error: 'Access denied' });

    const assignments = Array.isArray(body.assignments) ? body.assignments.slice(0, 500) : [];
    if (!assignments.length) return respond(400, { error: 'No assignments provided' });

    await Promise.allSettled(
        assignments.map(({ guestPhone, tableName, seatNumber }) => {
            const phone = sanitizePhone(guestPhone);
            const table = sanitizeText(tableName, 50);
            const seat  = parseInt(seatNumber, 10) || 0;
            if (!phone) return Promise.resolve();
            return ddb.send(new UpdateCommand({
                TableName:                 T.RSVPS,
                Key:                       { eventId, guestPhone: phone },
                UpdateExpression:          'SET tableAssignment = :t, seatNumber = :s',
                ExpressionAttributeValues: { ':t': table, ':s': seat }
            }));
        })
    );

    return respond(200, { updated: assignments.length });
}

/* POST /events/:id/upload-url ── S3 presigned URL for cover photo */
async function getCoverUploadUrl(eventId, body, event) {
    const creator = await getCreatorFromToken(event);
    if (!creator) return respond(401, { error: 'Authentication required' });

    const ext     = sanitizeText(body.ext, 5).toLowerCase().replace(/^\./, '');
    const allowed = ['jpg', 'jpeg', 'png', 'webp'];
    if (!allowed.includes(ext)) return respond(400, { error: 'Only jpg, png, webp allowed' });

    const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    const key         = `rsvp-covers/${eventId}.${ext === 'jpg' ? 'jpeg' : ext}`;
    const cmd         = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
    const uploadUrl   = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    const publicUrl   = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

    return respond(200, { uploadUrl, publicUrl });
}

/* ── Member auth: send OTP ───────────────────────── */
async function memberAuthSend(body) {
    const phone = sanitizePhone(body.phone);
    if (!phone) return respond(400, { error: 'Valid US phone number required' });

    if (await checkOtpRateLimit(phone, 'member_login')) {
        return respond(429, { error: 'Too many attempts. Please wait before trying again.' });
    }

    const prev = await ddb.send(new GetCommand({ TableName: T.OTP, Key: { phone, purpose: 'member_login' } })).catch(() => null);
    const code = generateOTP();

    await ddb.send(new PutCommand({
        TableName: T.OTP,
        Item: {
            phone,
            purpose:   'member_login',
            code,
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            sendCount: (prev?.Item?.sendCount || 0) + 1
        }
    }));

    await sns.send(new PublishCommand({
        PhoneNumber: phone,
        Message: `RNB Events: Your login code is ${code}. Valid for 10 minutes.`,
        MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' }
        }
    }));

    return respond(200, { message: 'Code sent' });
}

/* ── Member auth: verify OTP → session ──────────── */
async function memberAuthVerify(body) {
    const phone = sanitizePhone(body.phone);
    const code  = String(body.code || '').replace(/\D/g, '').slice(0, 6);

    if (!phone || code.length !== 6) return respond(400, { error: 'Phone and 6-digit code required' });

    const otpRes = await ddb.send(new GetCommand({ TableName: T.OTP, Key: { phone, purpose: 'member_login' } })).catch(() => null);
    if (!otpRes?.Item)                                          return respond(400, { error: 'No pending code for this number' });
    if (otpRes.Item.expiresAt < Math.floor(Date.now() / 1000)) return respond(400, { error: 'Code expired. Request a new one.' });
    if (otpRes.Item.code !== code)                              return respond(400, { error: 'Invalid code' });

    const creatorRes = await ddb.send(new GetCommand({ TableName: T.CREATORS, Key: { phone } })).catch(() => null);
    const name = creatorRes?.Item?.name || null;

    await ddb.send(new DeleteCommand({ TableName: T.OTP, Key: { phone, purpose: 'member_login' } }));

    const token = crypto.randomBytes(32).toString('hex');
    await ddb.send(new PutCommand({
        TableName: T.SESSIONS,
        Item: {
            token,
            phone,
            name,
            type:      'member',
            expiresAt: Math.floor(Date.now() / 1000) + 2592000  // 30 days
        }
    }));

    return respond(200, { token, member: { phone, name } });
}

/* ── Member dashboard ────────────────────────────── */
async function getMemberDashboard(event) {
    const session = await getMemberFromToken(event);
    if (!session) return respond(401, { error: 'Authentication required' });

    const phone = session.phone;
    let creatorId = session.creatorId || null;

    if (!creatorId) {
        const cr = await ddb.send(new GetCommand({ TableName: T.CREATORS, Key: { phone } })).catch(() => null);
        creatorId = cr?.Item?.creatorId || null;
    }

    let hosting = [];
    if (creatorId) {
        const res = await ddb.send(new QueryCommand({
            TableName:                 T.EVENTS,
            IndexName:                 'creatorId-index',
            KeyConditionExpression:    'creatorId = :cid',
            ExpressionAttributeValues: { ':cid': creatorId }
        })).catch(() => ({ Items: [] }));

        hosting = (res.Items || []).map(ev => {
            const { creatorEmail, urthedj_sessionId, ...safe } = ev;
            return { ...safe, role: 'hosting' };
        }).sort((a, b) => b.eventDate > a.eventDate ? 1 : -1);
    }

    const rsvpRes = await ddb.send(new QueryCommand({
        TableName:                 T.MEMBER_RSVPS,
        KeyConditionExpression:    'phone = :p',
        ExpressionAttributeValues: { ':p': phone }
    })).catch(() => ({ Items: [] }));

    const attending = (rsvpRes.Items || []).map(r => ({ ...r, role: 'guest' }));

    const name = session.name
        || (hosting.length > 0 ? hosting[0].creatorName : null)
        || (attending.length > 0 ? attending[attending.length - 1].guestName : null);

    return respond(200, { name, phone, hosting, attending });
}

/* ── Email templates ─────────────────────────────── */
function emailBase(content) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#f3f5f1; font-family:'Helvetica Neue',Arial,sans-serif; color:#2c3e2c; }
  .wrap { max-width:600px; margin:32px auto; background:#fff; border-radius:2px; overflow:hidden; }
  .top  { background:#2c3e2c; padding:28px 40px; text-align:center; }
  .top h1 { color:#d0dfc8; font-size:13px; font-weight:400; letter-spacing:5px; }
  .body { padding:40px; line-height:1.7; font-size:14px; }
  h2 { font-size:28px; font-weight:300; letter-spacing:2px; margin-bottom:12px; }
  .detail { background:#f9faf8; border-left:3px solid #77a361; padding:16px 20px; margin:20px 0; }
  .detail p { margin:3px 0; font-size:13px; color:#527141; }
  .detail strong { color:#2c3e2c; }
  .cta { display:inline-block; background:#2c3e2c; color:#d0dfc8 !important; padding:14px 36px;
         text-decoration:none; font-size:11px; letter-spacing:3px; margin:24px 0; }
  .note { font-size:12px; color:#a4c195; margin-top:8px; }
  .foot { background:#2c3e2c; padding:20px 40px; text-align:center; }
  .foot p { color:#527141; font-size:11px; letter-spacing:1px; }
</style></head><body>
<div class="wrap">
  <div class="top"><h1>RNB EVENTS</h1></div>
  <div class="body">${content}</div>
  <div class="foot"><p>&copy; ${new Date().getFullYear()} RNB Events &nbsp;&middot;&nbsp; rnbevents716.com</p></div>
</div>
</body></html>`;
}

async function sendConfirmationEmail(toEmail, guestName, ev) {
    const dateStr = ev.eventTime ? `${ev.eventDate} at ${ev.eventTime}` : ev.eventDate;
    const html = emailBase(`
      <h2>You're on the list!</h2>
      <p>Hi ${guestName},</p>
      <p style="margin-top:12px">Your RSVP has been confirmed for <strong>${ev.eventName}</strong>. We can't wait to celebrate with you.</p>
      <div class="detail">
        <p><strong>EVENT</strong> &nbsp;—&nbsp; ${ev.eventName}</p>
        <p><strong>DATE</strong> &nbsp;—&nbsp; ${dateStr}</p>
        <p><strong>VENUE</strong> &nbsp;—&nbsp; ${ev.venue}</p>
        <p><strong>HOST</strong> &nbsp;—&nbsp; ${ev.creatorName}</p>
      </div>
      <a href="${SITE_URL}/event/${ev.eventId}" class="cta">VIEW EVENT</a>
      <p class="note">You can add up to 5 songs to the event playlist from your RSVP page.</p>
    `);

    await ses.send(new SendEmailCommand({
        Source:      FROM_EMAIL,
        Destination: { ToAddresses: [toEmail] },
        Message: {
            Subject: { Data: `Confirmed — ${ev.eventName}` },
            Body:    { Html: { Data: html } }
        }
    }));
}

async function sendInviteEmail(toEmail, guestName, ev) {
    const dateStr  = ev.eventTime ? `${ev.eventDate} at ${ev.eventTime}` : ev.eventDate;
    const eventUrl = `${SITE_URL}/event/${ev.eventId}`;
    const html     = emailBase(`
      <h2>You're invited</h2>
      <p>Hi ${guestName},</p>
      <p style="margin-top:12px"><strong>${ev.creatorName}</strong> has invited you to <strong>${ev.eventName}</strong>.</p>
      <div class="detail">
        <p><strong>DATE</strong> &nbsp;—&nbsp; ${dateStr}</p>
        <p><strong>VENUE</strong> &nbsp;—&nbsp; ${ev.venue}</p>
      </div>
      <a href="${eventUrl}" class="cta">VIEW INVITATION &amp; RSVP</a>
      <p class="note">Or paste this link: ${eventUrl}</p>
    `);

    await ses.send(new SendEmailCommand({
        Source:      FROM_EMAIL,
        Destination: { ToAddresses: [toEmail] },
        Message: {
            Subject: { Data: `You're invited — ${ev.eventName}` },
            Body:    { Html: { Data: html } }
        }
    }));
}

async function notifyCreatorOfRsvp(ev, guestName, status) {
    if (!ev.creatorEmail) return;
    const html = emailBase(`
        if (method === 'POST' && parts[0] === 'events' && parts[2] === 'update')     return await updateEvent(parts[1], body, event);
        if (method === 'DELETE' && parts[0] === 'events' && parts.length === 2)      return await deleteEvent(parts[1], event);
      <h2>New RSVP</h2>
      <p><strong>${guestName}</strong> just ${status === 'confirmed' ? 'confirmed their attendance' : 'declined'} for <strong>${ev.eventName}</strong>.</p>
      <div class="detail">
        <p><strong>STATUS</strong> &nbsp;—&nbsp; ${status.charAt(0).toUpperCase() + status.slice(1)}</p>
        <p><strong>EVENT</strong> &nbsp;—&nbsp; ${ev.eventName} &nbsp;(${ev.eventDate})</p>
      </div>
      <a href="${SITE_URL}/Admin/" class="cta">VIEW DASHBOARD</a>
    `);

    await ses.send(new SendEmailCommand({
        Source:      FROM_EMAIL,
        Destination: { ToAddresses: [ev.creatorEmail] },
        Message: {
            Subject: { Data: `${guestName} ${status === 'confirmed' ? 'is coming' : 'declined'} — ${ev.eventName}` },
            Body:    { Html: { Data: html } }
        }
    }));
}

/* ── Router ──────────────────────────────────────── */

exports.handler = async (event) => {
    // Support both API Gateway v1 (REST) and v2 (HTTP API) event formats
    const isV2   = event.version === '2.0' || !!event.requestContext?.http;
    const method = isV2
        ? event.requestContext.http.method
        : (event.httpMethod || 'GET');

    if (method === 'OPTIONS') return respond(200, {});

    const rawPath = event.rawPath || event.path || '/';
    const path    = rawPath.replace(/^\/rsvp/, '') || '/';
    const parts   = path.split('/').filter(Boolean);

    let body = {};
    try { if (event.body) body = JSON.parse(event.body); } catch { /* ignore */ }

    try {
        // Creator auth
        if (method === 'POST' && path === '/creator/signup')    return await creatorSignup(body);
        if (method === 'POST' && path === '/creator/verify')    return await creatorVerify(body);
        if (method === 'POST' && path === '/creator/login')     return await creatorLogin(body);
        if (method === 'POST' && path === '/creator/google-auth') return await creatorGoogleAuth(body);
        if (method === 'GET'  && path === '/creator/events')    return await getCreatorEvents(event);

        // Events
        if (method === 'POST' && path === '/events')            return await createEvent(body, event);
        if (method === 'GET'  && parts[0] === 'events' && parts.length === 2)        return await getEvent(parts[1]);
        if (method === 'POST' && parts[0] === 'events' && parts[2] === 'update')     return await updateEvent(parts[1], body, event);
        if (method === 'DELETE' && parts[0] === 'events' && parts.length === 2)      return await deleteEvent(parts[1], event);
        if (method === 'GET'  && parts[0] === 'events' && parts[2] === 'full')       return await getEventFull(parts[1], event);
        if (method === 'GET'  && parts[0] === 'events' && parts[2] === 'my-songs')   return await getMySOungs(parts[1], event);
        if (method === 'POST' && parts[0] === 'events' && parts[2] === 'guests')     return await addGuests(parts[1], body, event);
        if (method === 'POST' && parts[0] === 'events' && parts[2] === 'songs')      return await addSong(parts[1], body, event);
        if (method === 'DELETE' && parts[0] === 'events' && parts[2] === 'songs' && parts[3]) return await removeSong(parts[1], parts[3], event);
        if (method === 'GET'  && parts[0] === 'events' && parts[2] === 'admin')      return await getEventAdmin(parts[1], event);
        if (method === 'PUT'  && parts[0] === 'events' && parts[2] === 'seating')    return await updateSeating(parts[1], body, event);
        if (method === 'POST' && parts[0] === 'events' && parts[2] === 'upload-url') return await getCoverUploadUrl(parts[1], body, event);

        // Guest OTP
        if (method === 'POST' && path === '/otp/send')   return await sendGuestOtp(body);
        if (method === 'POST' && path === '/otp/verify') return await verifyGuestOtp(body);

        // Guest Google sign-in + recovery email
        if (method === 'POST' && path === '/guest/google-auth')    return await guestGoogleAuth(body);
        if (method === 'POST' && path === '/guest/google-lookup')  return await guestGoogleLookup(body);
        if (method === 'POST' && path === '/guest/phone-lookup')   return await guestPhoneLookup(body);
        if (method === 'POST' && path === '/guest/recovery-email') return await guestRecoveryEmail(body);

        // Member auth + dashboard
        if (method === 'POST' && path === '/member/auth')      return await memberAuthSend(body);
        if (method === 'POST' && path === '/member/verify')    return await memberAuthVerify(body);
        if (method === 'GET'  && path === '/member/dashboard') return await getMemberDashboard(event);

        return respond(404, { error: 'Route not found' });
    } catch (err) {
        console.error('[rsvp-lambda] Unhandled error:', err);
        return respond(500, { error: 'Internal server error' });
    }
};
