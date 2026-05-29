# Multi-Root Workspace — Master Context

**Generated:** May 28, 2026
**Workspace Roots:**
1. `RNB EVENTS MASTER` — Public website, admin dashboard, client portal, event/RSVP system, AWS Lambda backend
2. `urTheDJ` — Next.js DJ song-request app integrated with the RSVP system

This document is a complete, drop-in reference for both roots: every significant file, its purpose, exports, dependencies, external services, configuration, and how it connects to the rest of the system.

---

# PART 1 — `RNB EVENTS MASTER`

**Domain:** rnb716events.com / rnbevents716.com
**Hosting:** Netlify (primary) + Vercel + GitHub Pages (backup)
**Backend:** AWS Lambda + S3 + DynamoDB + SES + SNS
**Analytics:** REMUS (SQL Server) + Google Analytics (`G-DK2C6GZWJZ`)

## 1.1 Root-Level Files

### Public HTML Pages

| File | Purpose |
|------|---------|
| `index.html` | Main homepage — hero video (`Home.mp4`), welcome statement, hidden chatbot, portfolio categories (Weddings, Corporate, Social), contact grid, social links, footer. |
| `about.html` | About page — team bio, mission, gallery. |
| `service.html` | Services & packages overview. |
| `lovebook.html` | Wedding portfolio/gallery. |
| `crafting-moments.html` | Event-planning process/stories. |
| `gs.html` | Guest seat finder (hashed access). Netlify rewrite `/gs/*` → `/gs.html`. |
| `demo.html` | 2FA-protected staging environment for testing chatbot, FAQ flows, quote triggers. `noindex`. |
| `privacy.html` | Privacy policy. |
| `404.html` | Custom 404. |
| `rsvp.html` | Legacy RSVP placeholder (hidden from nav). |
| `my-events.html` | Client dashboard for managing their events. Rewrite `/my-events` → `/my-events.html`. |
| `event-create.html` | Create-event invitation builder. Rewrite `/create-event` → `/event-create.html`. Includes guest invite queue + email/phone send chooser. |
| `event.html` | Guest RSVP page. Rewrite `/event/:id` → `/event.html?id=:id`. |
| `events.html` | Public events listing. |
| `collage.html` | Collage/montage feature page. |
| `montage.html` | Event montage builder. |
| `host-party-live.html` | Live party/event host dashboard (integrates urTheDJ). |

### Root JavaScript

#### `script.js` (~300 lines)
Public-site interactivity. Hamburger menu, navbar scroll effects, testimonial slider (5s auto-rotate), image carousel (4s), about-section background carousel (5s), intersection-observer scroll animations, smooth-scroll anchors, contact form + newsletter handlers. Selectors: `.hamburger`, `.testimonial-item`, `.carousel-slide`, `.portfolio-item`, `.section`.

#### `chatbot.js` (~600 lines)
Pattern-matching (no LLM) FAQ chatbot. Class `RNBChatbot`. 60+ Q&A across 10 categories (general, design, pricing, booking, designProcess, logistics, rentals, policies, portal, trust, readyToBook, contact). Typing animation, quote-trigger on pricing intents. Contact: `rnbevents716@gmail.com`, `(716) 330-9013`, DFW Metroplex.

#### `cookie-consent.js` (~150 lines)
GDPR consent banner. 365-day persistent cookie. Toggles `gtag` `analytics_storage` consent. Two buttons (Accept All / Essential Only).

#### `remus-track.js` (~150 lines)
No-PII analytics beacon. Functions `remusTrack(section, codeHash?)` and `remusClick(action)`. Posts to `https://api.rnbevents716.com/track-visit` via `sendBeacon` (fallback `fetch`). Captures session id (sessionStorage), UTM params, page-load ms, bot filtering. Sections: `public | admin | client | prospect`.

#### `dev-server.js` (~70 lines)
Local dev HTTP server on port 5500. MIME routing, clean URLs (no-extension → `.html`), RSVP rewrite `/event/:id` → `/event.html?id=:id`. Run: `node dev-server.js`.

### Root CSS

#### `styles.css` (~3000+ lines)
Main public stylesheet. Variables:
```css
--primary-color: #2c3e2c   /* deep sage */
--secondary-color: #d0dfc8 /* very light sage */
--accent-color: #77a361    /* medium sage */
--text-color: #2c3e2c
--text-light: #527141
--sage-medium: #527141
--sage-light: #a4c195
--white: #ffffff
--cream: #f9faf8
--transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1)
```
Sections: global reset, navbar (fixed), hero (full-height video), typography (Cormorant serif + Montserrat sans), portfolio/gallery, buttons, responsive breakpoints (1200/968/600/400 px), mobile nav, parallax (disabled mobile), fade-in observers. Major classes: `.navbar`, `.hamburger`, `.hero`, `.portfolio-item`, `.btn-primary`, `.btn-secondary`, `.section`, `.container`.

#### `event.css`
Styling for `event.html` + `event-create.html` (invitation card, playlist, comments, guest invite queue table, channel-chooser modal).

### Configuration

| File | Notes |
|------|-------|
| `package.json` | `main: lambda-index.js`, `type: commonjs`. Deps: `msnodesqlv8@5.1.8`, `mssql@12.2.1` (SQL Server for Remus). Script: `test` (placeholder). |
| `netlify.toml` | Publishes root. Node 18. Redirects: `/Client/SeatingandLayout` & `/Client/Seating-Layout` → `/Client/seating-layout` (301); `/Prospect/*` & `/Stat/*` → `/Stats/:splat` (301); `/gs/*` → `/gs.html` (200); `/event/:id` → `/event.html?id=:id` (200); `/create-event` → `/event-create.html` (200); `/my-events` → `/my-events.html` (200). |
| `vercel.json` | `cleanUrls: false`, `trailingSlash: false`. |
| `CNAME` | `rnbevents716.com`. |

### Data / JSON

| File | Notes |
|------|-------|
| `lambda-response.json` | Lambda test response sample (BOM-corrupted). |
| `response.json` | Sample API response reference. |
| `test-payload.json` | Lambda test payload template. |

### Documentation

| File | Highlights |
|------|------------|
| `README.md` | Responsive design notes, breakpoints, mobile testing, browser support, performance tips, file-structure overview. |
| `DEPLOYMENT.md` | Netlify primary; GitHub Pages + Vercel backup. DNS A records + CNAME for `www`. DNS propagation 24-48h. |
| `COST-ANALYSIS.md` | ~$0–$0.51/month total. GitHub Pages free; Lambda free tier (1M req/mo); S3 ~$0.01; SES free (62K emails/mo); Route 53 $0.50. Recommends staying on GH Pages + Lambda. |
| `DEMO-STAGING.md` | `/demo` URL is 2FA-gated (admin password + 6-digit TOTP). To go live: remove `display:none` from `.chatbot-section` in `styles.css`. |

### Sensitive Files (⚠️ tracked in repo — security risk)

- `client_secret_1055774009737-…apps.googleusercontent.com.json` — Google OAuth client credentials.
- `rnbeventsadmin_credentials.csv` — Admin credentials reference.
- `AWS/AWS acces.txt` — AWS access keys reference.

## 1.2 `Admin/` Folder — Admin Dashboard

### Pages

#### `Admin/index.html`
Main admin dashboard (2FA-gated). **Auth flow:** Step 1 admin password (SHA-256). Step 2 TOTP 6-digit code (Google Authenticator). Remember-me 30-day. Password reset via TOTP or recovery email. Sections: prospect-lead pipeline/kanban, client dashboard (active clients, portal codes), website-tasks tracker, drag-drop content editor, quote generator, settings/access. Restrictive CSP. `noindex, nofollow`.

#### `Admin/quote-generator.html`
Custom quote builder. Inventory from S3, item selection, custom items, tax (8.75%), quote number format `YYMMNNNN`, save/share.

#### `Admin/test-events.html`
RSVP testing UI (untracked at points).

#### `Admin/upload-clients-to-s3.html`
Manual S3 upload utility for client data.

#### `Admin/clean-archived.html`
Archive/cleanup utility for old client data.

### Scripts

#### `Admin/admin.js` (~1000+ lines)
Dashboard logic, state management, 2FA, content editor.
- State: `state.prospects | tasks | clients | activeFilter`, `contentDrafts`, `contentDraftHistory`, `kanbanPendingMap`.
- Key fns: `decodeTotpKey()`, `deriveAccessCode(name)`, `generateClientCodes(coupleCode)`, `fillGeneratedCodes()`, `adminStep1()`, `adminStep2()`.
- Lockout: 5 failed attempts → 5-min lockout.
- API: `window.RNB_UPLOAD_API = 'https://k0e4amkowi.execute-api.us-east-2.amazonaws.com/upload-clients'`.
- Content schema: 5 editable pages (home, service, lovebook, about, crafting).
- Storage keys: `rnb_admin_access`, `rnb_admin_prospects`, `rnb_admin_tasks`, `rnb_admin_clients`, `rnb_content_drafts`, `rnb_content_drafts_history`, IndexedDB `rnb_admin_content_db`.

#### `Admin/admin-data.js`
Runtime config. `codeHash` (SHA-256 of admin password), `totpKey` (character-array TOTP secret e.g. `RNBEV7SECR3TADM2`), `cloudApiUrl` (Lambda API Gateway), sample `prospects`, `websiteTasks`.

#### `Admin/aws-s3-service.js` (~200 lines)
S3 wrapper class. Bucket `rnbevents716`, region `us-east-2`, base URL `https://rnbevents716.s3.us-east-2.amazonaws.com`, API Gateway `https://api.rnbevents716.com`. Methods `fetchFromS3(path, useCache)`, `saveToS3(path, data)`. 5-min cache. Paths: `admin-data/{prospects|clients|tasks|inventory|quotes|stats}.json`.

#### `Admin/quote-generator.js`
Interactivity for quote UI. `loadInventory()` (via S3Service), `updatePreview()`, `addItemToQuote(itemId)`, `newQuote()`. Tax rate 8.75%.

#### `Admin/google-apps-script.gs`
Google Apps Script for Sheets automation.

### Styles
`Admin/admin.css`, `Admin/admin-dashboard.css`, `Admin/quote-generator.css`.

## 1.3 `Client/` Folder — Client Portal

### Pages

| File | Purpose |
|------|---------|
| `Client/index.html` | Portal gate (access code SHA-256 + optional email verification). 30-day remember-me. Branded loading overlay. Session keys: `rnb_portal_access`, `rnb_portal_role` (sessionStorage), `rnb_portal_remember` (localStorage). |
| `Client/timeline.html` | Event timeline/milestones with notes + status. |
| `Client/moodboard.html` | Color palette + inspiration images. |
| `Client/vendors.html` | Vendor contact list + status. |
| `Client/gallery.html` | Inspiration + client photo uploads. |
| `Client/documents.html` | Contracts & reference docs. |
| `Client/seating-layout.html` | Interactive seating chart builder. |
| `Client/tracking.html` | Event progress dashboard. |
| `Client/emailjs-template.html` | EmailJS template. |

### Scripts

#### `Client/portal.js` (~500+ lines)
Main portal auth + client fetching. `sha256(str)`, `fetchCloudClients()` → `https://rnbevents716.s3.us-east-2.amazonaws.com/clients.json`, `findClientAndRole(hash)`, `saveRemembered()`, `loadRemembered()`. Roles: `couple | planner | rnbTeam`.

#### `Client/portal-page.js` (~150 lines)
Sub-page init + auth guard. Verifies session, builds roles map, fetches live client data, fires `remusTrack('client', codeHash)`, in-page nav overlay. Session storage: `rnb_portal_access`, `rnb_portal_role`, `rnb_portal_role_name`.

#### `Client/clients-config.js` (~200 lines)
Static fallback client data. `RNB_CLIENTS_RAW = { codeHash: { clientData } }`. Sample entries: Demo2024, Joelle & Laurent 2026. Fields: `firstName`, `fullName`, `email`, `eventType`, `eventDate`, `eventVenue`, `planner`, `plannerEmail`, sections `timeline | vendors | moodboard | documents | gallery`, `agreement`, `editLog`, `trackingNotes`.

### Styles + Docs
`Client/portal.css`, `Client/2FA-SETUP.md`, `Client/EMAIL-TEMPLATE-GUIDE.md`.

## 1.4 `backend/` Folder — Lambda + DB + Sync

### `backend/lambda-index.js` (~400+ lines)
Main Lambda handler for S3 CRUD on admin/client data. Region `us-east-2`. Bucket `rnbevents716`.
- **Routes:** `POST /upload-clients`, `POST /update-client-notes`, `POST /update-client-section`, `POST /upload-file`, `OPTIONS` (CORS preflight).
- **CORS:** `Allow-Origin: *`, `Allow-Methods: POST,OPTIONS`, `Allow-Headers: Content-Type`.
- **Sanitizers:** `sanitizeUrl()`, `sanitizeImageSrc()` (https or `data:image` b64), `sanitizeTimeline()` (≤50), `sanitizeVendors()` (≤30, phone/email), `sanitizeDocuments()` (≤50), `sanitizeGallery()` (≤100), `sanitizeMoodboard()` (palette + images).
- **Behavior:** Preserves portal sections on bulk publish; deletes clients not in upload set.
- **Runtime:** Timeout 30s, memory 256 MB.

### `backend/rsvp-lambda.js` (~800+ lines)
Event RSVP handler. Region `us-east-2`. DynamoDB tables:

| Table | PK / SK |
|-------|---------|
| `rnb-events` | PK `eventId` (GSI `creatorId-index`) |
| `rnb-creators` | PK `phone` |
| `rnb-rsvps` | PK `eventId`, SK `guestPhone` |
| `rnb-guest-songs` | PK `guestPhone#eventId`, SK `songIndex` |
| `rnb-otp` | PK `phone`, SK `purpose`, TTL `expiresAt` |
| `rnb-sessions` | PK `token`, TTL `expiresAt` |
| `rnb-guest-registry` | PK `eventId`, SK `guestPhone` |
| `rnb-member-rsvps` | PK `phone`, SK `eventId` |

Environment: `URTHEDJ_API_URL`, `AWS_REGION`, `COVER_CDN_URL`.
Capabilities: event creation/management, guest RSVPs, song requests (5 max), fallback song catalog (Titanium, Levitating, One More Time, etc.), OTP gen/verify, session tokens, SES email + SNS SMS, guest-invite send modes (`mass | individual`) and channels (`email | phone`) with per-channel metrics + failure logging.
Sanitizers: `sanitizePhone()` (E.164, 10-15 digits), `sanitizeText()` (≤200 chars, no HTML), `sanitizeEmail()`.

### `backend/remus-schema.sql` (~200 lines)
**Database:** REMUS (SQL Server). **Tables:**
- `PageViews` — `Id PK, LoggedAt, Section, Page, PageTitle, Referrer, UtmSource, UtmMedium, UtmCampaign, UtmTerm, SessionId, CodeHash, LoadMs`. Indexes on Section, LoggedAt, UtmSource, Page.
- `SyncState` — `LogFile PK, SyncedAt, Rows`.

**Views:** `v_DailyVisits`, `v_TopReferrers`, `v_TopSearchTerms`.

### `backend/sync-to-remus.js` (~300 lines)
Daily S3 visit logs → SQL Server import. S3 bucket `rnbevents716` / region `us-east-2`. DB server `localhost` DB `Remus`. Log format NDJSON `logs/visits-YYYY-MM-DD.ndjson`. Checks last 7 days + today, skips already-imported (SyncState), bulk inserts into `PageViews`. Run nightly via Task Scheduler.

### `backend/sync-to-romulus.js`
Mirror sync to "Romulus" reference DB.

### `backend/upload-clients.js` (~40 lines)
One-time util to upload `clients.json` to S3 bucket `rnbevents716` (us-east-2). Reads `backend/RNB EVENTS/Client/clients.json`. Run: `node upload-clients.js`.

## 1.5 `AWS/` Folder

| File | Purpose |
|------|---------|
| `AWS/LAMBDA-DEPLOYMENT-GUIDE.md` | Step-by-step Lambda + API Gateway setup. IAM: S3 (Get/Put/Delete/ListBucket on `arn:aws:s3:::rnbevents716/*`), CloudWatch Logs. Lambda Node.js 14.x+, 30s timeout, 256 MB. HTTP API (not REST). |
| `AWS/cors-config.json` | S3 CORS template. |
| `AWS/gsi-creatorId.json` | DynamoDB GSI definition `creatorId-index` on `rnb-events`. |
| `AWS/AWS acces.txt` | ⚠️ AWS access key reference (should not be in repo). |

## 1.6 `Content/` Folder
Draft content & assets per public page:
```
Content/
├── About Us/
├── Contact Us/
├── Crafting Moments/
├── Home/
├── Service/
└── The Love Book/
```

## 1.7 Lambda Deploy Artifacts

### `lambda-deploy/`
`function.zip`, `index.js`, `package.json`, `ses-policy.json`, `node_modules/`.

### `rnb-lambda-deploy/`
`index.js` (mirror of `backend/rsvp-lambda.js`), `package.json`, `s3-policy.json`, `trust-policy.json`, `lambda-function.zip`, `node_modules/`. Deployed to AWS Lambda function `rnb-admin-sync` via `aws lambda update-function-code`.

## 1.8 Archive / Reference Folders

| Folder | Purpose |
|--------|---------|
| `Prospect/` | Single `index.html` legacy prospect tracker (redirects to `/Stats`). |
| `Stat/` | Single `index.html` meta-redirect to `/Stats/`. |
| `Stats/` | Admin analytics dashboard (`index.html`, `prospect.css`, `prospect.js`). Same 2FA. Restrictive CSP. `noindex, nofollow`. |
| `RNB EVENTS Client/` | Empty. |
| `RNB Social/` | IG/TikTok post templates + graphics. `4.3 IG Post/`. |
| `RNB EVENTS.worktrees/` | Git worktrees (e.g. `copilot-worktree-2026-04-03T02-29-25`). |

## 1.9 3D Assets
`3D Assets/` + `3d-assets/` — `.glb` (glTF 2.0 binary) models for seating/venue preview: `Hampton.glb`, `Serpentine Section.glb`, `Serpentine Table.glb`. WebGL compatible.

## 1.10 Event System (Public RSVP)

### `event.html` (~500+ lines)
Public guest RSVP page. URL pattern `/event/:id`. Features: invitation card, RSVP Yes/No/Maybe, song-playlist requests (up to 5), comments to host, optional party chat, guest-list viewer, urTheDJ integration. API `https://k0e4amkowi.execute-api.us-east-2.amazonaws.com/rsvp`. Branded spinner overlay, 404 fallback.

### `event.js` (~150+ lines)
Event-page interactivity. `window.RNB_RSVP_API`, `window.RNB_URTHEDJ_URL`. Fetch event by id, submit RSVP, search/add songs, save comments, guest list mgmt.

### `event-create.html`
Host-side invitation builder. **Recent enhancements:**
- `escHtml()` helper (added 2026-05-28 to fix add-guest crash).
- `_gpQueue` array + `gpRenderSingleQueue()` table.
- `gpAddToQueue()`, `gpRemoveQueuedGuest(idx)`, `gpSaveSingle()`, `gpPromptInviteMethod()`.
- Channel chooser modal (`email` vs `phone`).
- Conditional Send button (hidden while queue empty).
- Sends payload to `POST /events/:id/guests` with `inviteMode`, `inviteChannel`.

## 1.11 AWS Services Summary

| Service | Resource | Purpose |
|---------|----------|---------|
| Lambda | `rnb-admin-s3-handler` | S3 CRUD for admin/client data |
| Lambda | `rnb-admin-sync` | RSVP / event handler (rsvp-lambda.js) |
| API Gateway | HTTP API | Routes to Lambda (`/upload-clients`, `/rsvp`, `/track-visit`, etc.) |
| S3 | `rnbevents716` | Clients, quotes, inventory, photos, analytics logs |
| DynamoDB | 8 tables (see §1.4) | Event + RSVP data |
| SES | `info@rnbevents716.com` | Email (62K/mo free) |
| SNS | Regional topic | SMS invitations |
| CloudFront | optional | CDN for `COVER_CDN_URL` |
| SQL Server | `Remus` DB | Analytics + visit logging |

## 1.12 External Integrations

| Service | Identifier | Purpose |
|---------|------------|---------|
| Google Analytics | `G-DK2C6GZWJZ` | Traffic |
| Google OAuth | Client ID in Apps Script | Guest auth |
| EmailJS | `uzfFh7D6LdIbNqpdK` | Portal email templates |
| urTheDJ | `https://urthedj.com/api` | Song catalog / playlist sync |
| Google Apps Script | `google-apps-script.gs` | Sheets automation |

## 1.13 Authentication & Security

**Admin:** SHA-256 password + TOTP. 5-attempt lockout (5 min). 30-day remember-me. Reset via TOTP or recovery email.
**Client portal:** SHA-256 access code + optional email verification. Roles `couple | planner | rnbTeam`. Auto-generated planner + team codes.
**Guest RSVP:** Hashed event id in URL. Optional OTP for contact verification.
**Data protection:** S3 private; access codes hashed; no PII in analytics (random sessionId); HTTPS enforced; restrictive CSP on admin/portal pages.

⚠️ **Known security issues:** AWS credentials, OAuth secret, admin credentials CSV all tracked in repo. No `.env` usage — config hardcoded in JS.

## 1.14 Notable Configuration Values

| Key | Value |
|-----|-------|
| Primary domain | rnb716events.com |
| Alt domain | rnbevents716.com |
| Contact email | rnbevents716@gmail.com |
| Contact phone | (716) 330-9013 |
| Location | DFW Metroplex, TX |
| AWS region | us-east-2 |
| S3 bucket | rnbevents716 |
| Lambda API root | https://k0e4amkowi.execute-api.us-east-2.amazonaws.com |
| GA ID | G-DK2C6GZWJZ |
| Remus DB | localhost / Remus (SQL Server) |
| urTheDJ API | https://urthedj.com/api |
| EmailJS key | uzfFh7D6LdIbNqpdK |
| Tax rate | 8.75% |
| TOTP key (encoded) | RNBEV7SECR3TADM2 |
| Remember-me TTL | 30 days |
| Auth lockout | 5 attempts → 5 min |
| Chatbot FAQs | 60+ across 10 categories |
| Song-request max | 5 per guest |
| Vendor max | 30 per client |
| Timeline max | 50 milestones |
| Gallery max | 100 photos |

## 1.15 npm Scripts & Commands

```bash
# Dev
node dev-server.js               # localhost:5500

# Deploy (Netlify auto-deploys on push)
git push

# Lambda deploy (S3 handler)
cd backend
zip -r lambda-s3-handler.zip lambda-index.js
aws lambda update-function-code --function-name rnb-admin-s3-handler --zip-file fileb://lambda-s3-handler.zip

# Lambda deploy (RSVP handler)
cd rnb-lambda-deploy
Compress-Archive -Path index.js,package.json,node_modules -DestinationPath lambda-function.zip -Force
aws lambda update-function-code --function-name rnb-admin-sync --zip-file fileb://lambda-function.zip
aws lambda wait function-updated --function-name rnb-admin-sync

# Analytics sync (Windows Task Scheduler nightly)
node backend/sync-to-remus.js
```

---

# PART 2 — `urTheDJ`

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.8 · Prisma 7 + Postgres · AWS DynamoDB · Apple Music / iTunes Search

MVP party/DJ song-request app. Guests search Apple Music + submit requests; DJ dashboard manages live queue with smart sorting (BPM, style, energy, request age) + virtual dual-deck mixer; real-time sync via SSE.

## 2.1 Root Configuration

### `package.json`
**Scripts:**
- `dev` — `next dev --turbopack`
- `build` — `next build`
- `start` — `next start`
- `lint` — `eslint . --max-warnings=0`

**Dependencies:** `@aws-sdk/client-dynamodb ^3.840.0`, `@aws-sdk/lib-dynamodb ^3.840.0`, `@prisma/adapter-pg ^7.8.0`, `@prisma/client ^7.8.0`, `@types/pg ^8.20.0`, `dotenv ^17.4.2`, `next ^16.2.6`, `pg ^8.21.0`, `prisma ^7.8.0`, `qrcode.react ^4.2.0`, `react ^19.0.0`, `react-dom ^19.0.0`.

**DevDeps:** `@types/node ^22.15`, `@types/react ^19`, `@types/react-dom ^19`, `eslint ^9.35`, `typescript ^5.8`, `typescript-eslint ^8.42`.

### `tsconfig.json`
`target: ES2017`, `lib: ["dom","dom.iterable","esnext"]`, `strict: true`, `noEmit: true`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`, alias `@/* → ./src/*`, plugin `next`.

### `next.config.mjs`
`output: 'standalone'` (Lambda/Docker-ready self-contained server).

### `eslint.config.mjs`
Ignores `.next/**`, `node_modules/**`, `src/generated/**`. `typescript-eslint` parser, JSX support, default rules.

### `prisma.config.ts`
Loads `.env.local` then `.env`. Schema `prisma/schema.prisma`. Datasource URL from `DATABASE_URL`.

### `README.md`
Quick start: `npm install && npm run dev` (localhost:3000). Required prod env: `AWS_REGION`, `PARTY_SESSIONS_TABLE`, `SONG_REQUESTS_TABLE`, `APPLE_MUSIC_DEVELOPER_TOKEN`, `APPLE_MUSIC_STOREFRONT`. Without AWS env, uses in-memory data.

## 2.2 Prisma Schema (`prisma/schema.prisma`)

Generator → `../src/generated/prisma/client`. Datasource: PostgreSQL.

### Model `PartySession` (table `party_sessions`)
| Field | Type | Notes |
|---|---|---|
| `sessionId` | String PK | UUID |
| `partyName` | String | |
| `createdBy` | String | default `"DJ"` |
| `status` | String | `draft | active | paused | ended`, default `draft` |
| `currentSongId` | String? | request id of current song (no FK to avoid circular) |
| `partyStyle` | String? | e.g. "Hip-hop to open, EDM peak hour" |
| `requestsLocked` | Boolean | default `false` |
| `createdAt` | DateTime | default `now()` |
| `startedAt` | DateTime? | |
| `endedAt` | DateTime? | |
| `requests` | SongRequest[] | relation |

### Model `SongRequest` (table `song_requests`)
| Field | Type | Notes |
|---|---|---|
| `requestId` | String PK | UUID |
| `sessionId` | String FK | cascade delete |
| `session` | PartySession | |
| `songTitle` / `artistName` | String | |
| `albumName` / `appleMusicId` / `artworkUrl` | String? | |
| `durationMs` / `bpm` | Int? | |
| `genre` / `style` / `energyLevel` | String? | |
| `priorityScore` | Int | default 0 |
| `requestedBy` | String | default `"Guest"` |
| `status` | String | `pending | approved | queued | playing | played | skipped | rejected`, default `pending` |
| `createdAt` | DateTime | |
| `playedAt` | DateTime? | |
| `sourceProvider` | String | `apple-music | catalog` |
| `manualPriority` | Int | default 0 |
| `duplicateOfRequestId` | String? | |

## 2.3 Middleware — `src/proxy.ts`
Protects `/admin/:path*`. Allows `/admin/login` open. Otherwise checks `dj_auth=1` httpOnly cookie; redirects to `/admin/login?from=/admin/...` if missing. Cookie: httpOnly, Secure in prod, `SameSite=lax`, max-age 43,200 s (12 h).

## 2.4 App Routes

### Root
- `src/app/layout.tsx` — `RootLayout` server component. Metadata title "urTheDJ". Inter font (400/600/700/800/900). Renders `TopNav` + `.page-shell`.
- `src/app/page.tsx` — Landing hero ("Party requests built for live energy"), Login/Sign-Up CTAs, feature grid (smart queue, live Apple Music, instant sync).
- `src/app/globals.css` — Dark theme. CSS vars `--bg, --bg-soft, --panel, --text, --accent, --danger, --success, --radius (24px), --radius-sm (16px)`. Max width 1280 px. Components: `.top-nav`, `.page-shell`, `.panel`, `.card`, `.pill`, `.hero`, `.btn` variants, `.queue-list`, `.queue-row`.

### Admin
- `src/app/admin/page.tsx` — `AdminHomePage` server component. `listPartySessions()` + "Create New Party" button. `export const dynamic = 'force-dynamic'`.
- `src/app/admin/login/page.tsx` — `AdminLoginPage` wraps client `LoginForm`. 4 numeric inputs, auto-focus on fill, auto-submit on full PIN, posts to `/api/auth/login`. Backspace moves focus left.
- `src/app/admin/create-party/page.tsx` — Renders `CreatePartyForm`.
- `src/app/admin/party/[sessionId]/page.tsx` — `AdminPartyPage` renders `PartyAdminClient` with sessionId.

### Guest
- `src/app/party/[sessionId]/page.tsx` — `GuestPartyPage` renders `GuestPartyClient`.
- `src/app/signup/page.tsx` — `redirect('/admin/create-party')`.

### API — Auth
| Endpoint | Behavior |
|---|---|
| `POST /api/auth/login` | Body `{pin}`. Compares against `ADMIN_PIN` env (default `"0000"`). Sets `dj_auth=1` cookie 12 h. Returns `{ok:true}` or 401 `{error:"Invalid PIN"}`. |
| `POST /api/auth/logout` | Deletes `dj_auth` cookie. Returns `{ok:true}`. |

### API — Party
| Endpoint | Behavior |
|---|---|
| `POST /api/party/create` | `{partyName, createdBy?, partyStyle?}` → `createPartySession()`. Returns `{sessionId, dashboard}`. |
| `GET  /api/party/:sessionId` | `getPartySession()` → `AdminDashboardModel`. |
| `POST /api/party/start` | `{sessionId}` → status `active`, sets `startedAt`. SSE emit. |
| `POST /api/party/pause` | status `paused`. |
| `POST /api/party/end` | status `ended`, `endedAt`. |
| `POST /api/party/lock-requests` | `requestsLocked = true`. |
| `POST /api/party/reopen-requests` | `requestsLocked = false`. |
| `POST /api/party/guest-list` | `{sessionId, guestList:string[]}` — trim+filter, persist. |
| `GET  /api/party/:sessionId/events` | SSE stream. Sends `event: connected` ping, subscribes via event-bus, emits `event: queue-update`, heartbeat every 20 s. Cleans up on `request.signal.abort`. Headers `text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`. Runtime `nodejs`, `force-dynamic`. |
| `GET  /api/party/:sessionId/public-view` | `getGuestView()` → `GuestViewModel` (session, currentSong, lastPlayed, nextSongs). |

### API — Queue
| Endpoint | Behavior |
|---|---|
| `POST /api/queue/approve` | `{requestId}` → status `approved`. |
| `POST /api/queue/reject` | status `rejected`. |
| `POST /api/queue/skip` | status `skipped`. Clears `currentSongId` if matched. |
| `POST /api/queue/mark-playing` | status `playing`. Auto-starts session if `draft`. Sets `currentSongId`. |
| `POST /api/queue/mark-played` | status `played`, `playedAt`. Clears `currentSongId` if matched. |
| `POST /api/queue/reorder` | `{sessionId, requestId, direction:"up"|"down"}`. Adjusts `manualPriority ±12` and `priorityScore ±1`. |
| `POST /api/queue/force-sync` | `{sessionId, requestId}` — set as `currentSongId`, status `playing`, auto-start if draft. |

### API — Songs
| Endpoint | Behavior |
|---|---|
| `GET  /api/search-song?query=…` | `searchAppleMusic(query)` → iTunes Search API → fallback `catalog`. Returns `SearchSongResult[]`. |
| `POST /api/song-request` | `{sessionId, requestedBy, song:{…}}`. Validates session/lock. Detects duplicates (by appleMusicId or normalized title+artist). Computes `priorityScore` (BPM 0-30, style 8-28, energy 4-20, age 0-20, manual override, duplicate -60). Stores `pending` or `rejected` if duplicate. SSE emit. Returns `{request, duplicate?}`. |

## 2.5 Components

- `src/components/top-nav.tsx` — Sticky nav. Logo "urTheDJ" (gradient). CTA: `/` → Sign Up; non-party pages → "Start a Party"; `/party/:sessionId` → hidden. Uses `usePathname()`.
- `src/components/create-party-form.tsx` — Fields `partyName*`, `createdBy?`, `partyStyle?`. Calls `createParty()`, redirects to `/admin/party/:sessionId`.
- `src/components/guest-party-client.tsx` — Debounced search (250 ms, min 2 chars), result list (artwork, BPM, energy, style, Apple vs catalog tag), name selector (from guest list or custom), "Add Song" submit with duplicate notice. SSE listener with 10 s fallback poll. Display: current song, last 3 played, next 3 in queue, guest list.
- `src/components/party-admin-client.tsx` — DJ dashboard. Tabs: **Now Playing** (current song + preview player, up-next, QR code via `qrcode.react`, guest list, last played), **Virtual DJ Mixer** (dual decks — A: Apple Music / B: Local, source selector, MusicKit account connect for full playback), **Playlist** (full queue with reorder/approve/reject/play/skip), **Pending**. DJ song search + add. Real-time SSE + 10 s poll fallback. Audio element controls (play/pause/seek/volume, auto-advance).

## 2.6 Library Files

### `src/lib/types.ts`
```ts
type SessionStatus = 'draft' | 'active' | 'paused' | 'ended';
type RequestStatus = 'pending' | 'approved' | 'queued' | 'playing' | 'played' | 'skipped' | 'rejected';
type EnergyLevel  = 'low' | 'medium' | 'high' | 'peak';
type MusicProvider = 'apple-music' | 'catalog';

interface PartySession { sessionId; partyName; createdBy; status; currentSongId?; partyStyle?; requestsLocked; guestList?; createdAt; startedAt?; endedAt? }
interface SongRequest { requestId; sessionId; songTitle; artistName; albumName?; appleMusicId?; artworkUrl?; previewUrl?; durationMs?; bpm?; genre?; style?; energyLevel?; priorityScore; requestedBy; status; createdAt; playedAt?; sourceProvider; manualPriority; duplicateOfRequestId? }
interface SearchSongResult { songTitle; artistName; albumName?; appleMusicId?; artworkUrl?; previewUrl?; durationMs?; bpm?; genre?; style?; energyLevel?; sourceProvider }
interface AdminDashboardModel { session; currentSong?; lastPlayed[]; nextSongs[]; queue[]; pendingRequests[]; approvedSongs[] }
interface GuestViewModel { session; currentSong?; lastPlayed[]; nextSongs[] }
```

### `src/lib/api.ts`
Client wrappers: `createParty(input)`, `fetchAdminDashboard(sessionId)`, `fetchGuestView(sessionId)`, `searchSongs(query)`, `submitSongRequest(input)`. Throws with server error message or fallback.

### `src/lib/prisma.ts`
Singleton `PrismaClient` with `PrismaPg` adapter. Reads `DATABASE_URL`. Global reuse pattern in dev (prevents connection-pool exhaustion).

### `src/lib/dynamo.ts`
Exports `dynamo` (`DynamoDBDocumentClient`), `SESSIONS_TABLE` (env `DYNAMODB_SESSIONS_TABLE` default `urTheDJ_Sessions`), `REQUESTS_TABLE` (env `DYNAMODB_REQUESTS_TABLE` default `urTheDJ_Requests`). Region `AWS_REGION` default `us-east-1`. Optional `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`. Marshalling removes undefined.

### `src/lib/event-bus.ts`
- `emitPartyUpdate(sessionId)`
- `subscribeToParty(sessionId, callback) → unsubscribe`

Node.js `EventEmitter`, topic `party:{sessionId}`, global singleton.

### `src/lib/catalog.ts`
Fallback `SearchSongResult[]` library used when Apple Music search empty/fails. Sample tracks: Titanium (126 BPM EDM high), Levitating (103 Pop high), One More Time (123 House peak), Crazy in Love (99 R&B high), Yeah! (105 Hip-Hop peak), Can't Stop the Feeling! (113 Pop high), Turn Down for What (100 EDM peak), Blinding Lights, etc. `sourceProvider: 'catalog'`.

### `src/lib/party-service.ts`
Core business logic. Functions:

**Session:** `createPartySession`, `listPartySessions`, `startPartySession`, `pausePartySession`, `endPartySession`, `lockPartyRequests(sessionId, locked)`, `updateGuestList(sessionId, names[])`, `getPartySession`, `getGuestView`.

**Queue/Request:** `requestSong(input)` (validates, detects duplicates, computes priority, stores pending or rejected, SSE emit), `approveRequest`, `rejectRequest`, `markRequestPlaying` (auto-starts draft, sets `currentSongId`), `markRequestPlayed`, `skipRequest`, `forceSyncCurrentSong`, `reorderRequest`, `listRequests`, `searchSongs(query)`, `searchAppleMusic(query)`.

**Scoring (pure):** `normalize(value)`, `getEnergyLevel(bpm?, fallback?)` (≥140 peak, ≥118 high, ≥95 medium, else low), `getStyleScore(sessionStyle, songStyle, genre)` 0-28, `getBpmScore(currentSong, song)` 0-30, `getEnergyScore(currentSong, song)` 0-20, `computePriorityScore(...)`, `duplicateMatch(existing, song)`, `sortQueue(a, b)`.

**DB helpers:** `fetchSessionOrThrow`, `fetchRequestOrThrow`, `fetchRequestsBySession`, `refreshQueueState(sessionId)`.

## 2.7 Generated
`src/generated/prisma/client/` — auto-generated Prisma client (browser, client, commonInputTypes, enums, models, …). Do not edit manually. Regenerated via `prisma generate`.

## 2.8 Architecture

### Auth
1. `/admin/login` → 4-digit PIN form.
2. Validated against `ADMIN_PIN` env (default `"0000"`).
3. Cookie `dj_auth=1` set (httpOnly, 12 h).
4. Middleware `src/proxy.ts` guards `/admin/*`.
5. Logout deletes cookie.

Single-tenant MVP — no user management.

### Data Layer (Hybrid)
- **Prisma + Postgres** — schema defined, adapter `@prisma/adapter-pg`, currently unused at runtime; reserved for scaling.
- **DynamoDB** — primary storage. Tables `urTheDJ_Sessions` (PK `sessionId`), `urTheDJ_Requests` (PK `requestId`, GSI `sessionId-index`). AWS SDK v3 doc client.
- **In-memory fallback** — when AWS env missing (local dev), not persisted across restarts.

### Real-Time
- **SSE** on `GET /api/party/:sessionId/events`. Heartbeat 20 s. Connection cleanup on abort.
- **Event bus** in-memory `EventEmitter` (`party:{sessionId}` topic). Any mutation calls `emitPartyUpdate(sessionId)`. Sub-100 ms LAN.
- **Poll fallback** — 10 s if SSE drops.

### External APIs
- **iTunes Search:** `https://itunes.apple.com/search?term={q}&media=music&entity=song&limit=10`. Returns title, artist, album, artwork, 30 s preview, duration (BPM simulated).
- **MusicKit JS:** `https://js-cdn.music.apple.com/musickit/v3/musickit.js`. Requires `NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN`. Enables full playback for DJ (user signs into Apple Music).

### Deployment
- Standalone Next.js build. Suitable for Docker, AWS Lambda, or VPS.
- Build: `npm run build`. Start: `npm start` or `node .next/standalone/server.js`.

### Scaling notes / limitations
- Single `ADMIN_PIN` (no roles).
- In-memory event bus does not work across multiple Node processes — would need Redis Pub/Sub.
- No DB migrations/backups configured.

## 2.9 Environment Variables

| Variable | Example | Purpose |
|---|---|---|
| `ADMIN_PIN` | `1234` | DJ login PIN |
| `AWS_REGION` | `us-east-1` | DynamoDB region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | Optional creds (IAM role in Lambda) |
| `DYNAMODB_SESSIONS_TABLE` | `urTheDJ_Sessions` | Sessions table |
| `DYNAMODB_REQUESTS_TABLE` | `urTheDJ_Requests` | Requests table |
| `DATABASE_URL` | `postgresql://...` | Postgres (currently unused) |
| `NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN` | `eyJ...` | Client-side MusicKit token |
| `NODE_ENV` | `production` | Build mode |
| `PARTY_SESSIONS_TABLE` / `SONG_REQUESTS_TABLE` | — | Alternative table names per README |
| `APPLE_MUSIC_DEVELOPER_TOKEN` / `APPLE_MUSIC_STOREFRONT` | — | Server-side Apple Music |

---

# PART 3 — Cross-Workspace Integration

The two roots integrate through the RNB Events RSVP flow:

1. Host creates an event in `RNB EVENTS MASTER/event-create.html` → POST to `rnb-admin-sync` Lambda → DynamoDB (`rnb-events`, `rnb-guest-registry`).
2. Guest opens `/event/:id` → loads `event.html`/`event.js` → fetches event, RSVPs, submits up to 5 songs.
3. `rsvp-lambda.js` (`backend/`) calls `URTHEDJ_API_URL` env (typically `https://urthedj.com/api`) to forward song requests into urTheDJ's `POST /api/song-request` endpoint with the event's mapped `sessionId`.
4. DJ opens `urTheDJ` admin dashboard for that session → live queue updates via SSE; manages playback; uses Apple Music for actual playback.
5. `host-party-live.html` in RNB EVENTS MASTER can embed/proxy the urTheDJ admin view for the host's live console.

Shared identifiers:
- `eventId` (RNB) ↔ `sessionId` (urTheDJ) — mapped server-side in `rsvp-lambda.js` via the urTheDJ create-party call.
- Guest phone (E.164) used as RNB primary key; urTheDJ stores `requestedBy` as guest display name.

---

# PART 4 — Recent Changes (Session Log)

- Added guest invite mass/individual mode chooser in `event-create.html` + backend `addGuests(eventId, body, event)` mode handling — commit `8bee9f0`.
- Rewrote single-add UX into queue/table with explicit Add → Send flow, added email/phone channel chooser, backend per-channel metrics + failure logging — commit `9c4bc2b`.
- Fixed `Uncaught ReferenceError: escHtml is not defined` in `event-create.html` (queue render referenced missing helper) — commit `fd106ce` (2026-05-28).

---

**End of Workspace Master Context.**
