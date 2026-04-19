const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand: SNSPublishCommand } = require('@aws-sdk/client-sns');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const s3  = new S3Client({ region: 'us-east-2' });
const ses = new SESClient({ region: 'us-east-2' });
const sns = new SNSClient({ region: 'us-east-1' }); // SNS SMS must use us-east-1

const BUCKET = 'rnbevents716';
const KEY = 'clients.json';

/* ── Guest-seat in-memory cache (30-min TTL, reduces S3 reads under high concurrency) ── */
const _guestSeatCache = new Map(); // key: guestCode → { payload, ts }
const GUEST_SEAT_TTL  = 30 * 60 * 1000; // 30 min in ms
const ADMIN_DATA_KEY = 'admin-data.json';
const RECOVERY_EMAIL = 'rnbevents716@gmail.com';  // admin notification TO address
const FROM_EMAIL     = 'info@rnbevents716.com';   // all SES sends come FROM this (DKIM-verified domain)
const INFO_EMAIL     = 'info@rnbevents716.com';   // BCC copy
const RESET_CODE_KEY = 'admin-reset-code.json';
const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json'
};

function respond(code, data) {
    return { statusCode: code, headers: HEADERS, body: JSON.stringify(data) };
}

function safe(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Date formatting helpers ─────────────────────────────────────── */
function fmtOrdinal(d) {
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var day = d.getDate();
    var suf = [11,12,13].indexOf(day % 100) >= 0 ? 'th' : (['th','st','nd','rd'][day % 10] || 'th');
    return months[d.getMonth()] + ' ' + day + suf + ' ' + d.getFullYear();
}
function fmtEventDate(str) {
    if (!str) return '';
    var s = String(str);
    var ddm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddm) { var d = new Date(+ddm[3], +ddm[2]-1, +ddm[1]); if (!isNaN(d.getTime())) return fmtOrdinal(d); }
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) { var d = new Date(+iso[1], +iso[2]-1, +iso[3]); if (!isNaN(d.getTime())) return fmtOrdinal(d); }
    return s;
}

/* ── PDF quote generator ─────────────────────────────────────────── */
function generateQuotePDF(opts) {
    return new Promise(function (resolve, reject) {
        var doc  = new PDFDocument({ margin: 0, size: 'LETTER' });
        var bufs = [];
        doc.on('data', function (c) { bufs.push(c); });
        doc.on('end',  function ()  { resolve(Buffer.concat(bufs)); });
        doc.on('error', reject);

        var W       = doc.page.width;   // 612
        var gold    = '#b89a5e';
        var dkGn    = '#2d3a2d';
        var mdGn    = '#527141';
        var gray    = '#888888';
        var body    = '#3d3d3d';
        var divider = '#e8e2d9';
        var M       = 50;

        /* Header bar */
        doc.rect(0, 0, W, 90).fill(dkGn);
        doc.fillColor(gold).font('Helvetica-Bold').fontSize(24).text('RNB EVENTS', M, 22);
        doc.fillColor('#a3b18a').font('Helvetica').fontSize(9).text('EVENT PLANNING & COORDINATION', M, 54);
        doc.fillColor('#a3b18a').font('Helvetica').fontSize(9)
           .text(fmtOrdinal(new Date()),
                 0, 38, { align: 'right', width: W - M });

        /* Intro */
        doc.fillColor(mdGn).font('Helvetica').fontSize(8).text('PERSONALIZED QUOTE', M, 110);
        doc.fillColor(dkGn).font('Helvetica-Bold').fontSize(20).text('Hello, ' + opts.name, M, 126);

        var y = 162;

        /* Package badge */
        var badgeColor = (opts.pkgData && opts.pkgData.color) || dkGn;
        doc.roundedRect(M, y, 240, 22, 11).fill(badgeColor);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
           .text(opts.pkg + '  \u2014  ' + ((opts.pkgData && opts.pkgData.tagline) || ''), M + 10, y + 7, { width: 220 });
        y += 32;

        /* Event info */
        if (opts.eventType || opts.eventDate) {
            doc.fillColor(gray).font('Helvetica').fontSize(10)
               .text((opts.eventType || 'Event') + (opts.eventDate ? '  |  ' + fmtEventDate(opts.eventDate) : ''), M, y);
            y = doc.y + 4;
        }

        /* Package description */
        doc.fillColor(body).font('Helvetica').fontSize(10)
           .text((opts.pkgData && opts.pkgData.desc) || '', M, y, { width: W - 2 * M, lineGap: 2 });
        y = doc.y + 16;

        /* Divider */
        doc.moveTo(M, y).lineTo(W - M, y).strokeColor(divider).lineWidth(1).stroke();
        y += 14;

        /* Table header */
        var COL_D = M;
        var COL_Q = M + 280;
        var COL_U = M + 330;
        var COL_A = M + 420;
        var CW_D  = 270;
        var CW_Q  = 45;
        var CW_U  = 85;
        var CW_A  = W - M - COL_A;

        doc.rect(M, y - 3, W - 2 * M, 20).fill('#f5f2ec');
        doc.fillColor(mdGn).font('Helvetica-Bold').fontSize(8)
           .text('DESCRIPTION', COL_D, y + 3, { width: CW_D })
           .text('QTY',         COL_Q, y + 3, { width: CW_Q, align: 'right' })
           .text('UNIT PRICE',  COL_U, y + 3, { width: CW_U, align: 'right' })
           .text('AMOUNT',      COL_A, y + 3, { width: CW_A, align: 'right' });
        y += 22;

        doc.moveTo(M, y).lineTo(W - M, y).strokeColor(dkGn).lineWidth(1.5).stroke();
        y += 8;

        /* Line items */
        var fmt = function (n) {
            var abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (n < 0 ? '(' : '') + '$' + abs + (n < 0 ? ')' : '');
        };

        opts.items.forEach(function (item) {
            var sub   = item.qty * item.price;
            var isNeg = sub < 0;

            var preY = y;
            doc.fillColor(body).font('Helvetica').fontSize(10)
               .text(item.description, COL_D, y, { width: CW_D });
            var afterDescY = doc.y;
            var rowH = Math.max(afterDescY - preY, 14) + 4;

            doc.fillColor(isNeg ? '#c0392b' : body).font('Helvetica').fontSize(10)
               .text(String(item.qty),                       COL_Q, y, { width: CW_Q, align: 'right' })
               .text(item.price !== 0 ? fmt(item.price) : '\u2014', COL_U, y, { width: CW_U, align: 'right' })
               .text(sub !== 0 ? fmt(sub) : '\u2014',        COL_A, y, { width: CW_A, align: 'right' });

            y += rowH;
            doc.moveTo(M, y).lineTo(W - M, y).strokeColor(divider).lineWidth(0.5).stroke();
            y += 5;
        });

        /* Grand total / breakdown */
        y += 8;
        doc.moveTo(M, y).lineTo(W - M, y).strokeColor(divider).lineWidth(0.5).stroke();
        y += 8;

        if (opts.discountPct || opts.laborProduction || opts.taxAmt) {
            /* New breakdown format */
            var rowItems = [];
            if (opts.discountPct > 0) rowItems.push({ label: 'Items Subtotal', val: opts.itemsSubtotal || 0, color: gray });
            if (opts.discountPct > 0) rowItems.push({ label: 'Discount (' + opts.discountPct + '%)', val: -(opts.discountAmt || 0), color: '#c0392b' });
            if (opts.laborProduction > 0) rowItems.push({ label: 'Labor Production', val: opts.laborProduction, color: body });
            if (opts.taxAmt > 0) rowItems.push({ label: 'Texas Sales Tax (8.25%)', val: opts.taxAmt, color: gray });
            if (opts.deposit > 0) rowItems.push({ label: 'Required Deposit', val: opts.deposit, color: '#527141' });

            rowItems.forEach(function (r) {
                doc.fillColor(r.color).font('Helvetica').fontSize(9)
                   .text(r.label, M, y, { width: W - 2 * M - CW_A })
                   .text((r.val < 0 ? '-' : '') + '$' + Math.abs(r.val).toLocaleString('en-US', { minimumFractionDigits: 2 }), 0, y, { align: 'right', width: W - M });
                y = doc.y + 4;
            });

            doc.moveTo(M, y).lineTo(W - M, y).strokeColor(dkGn).lineWidth(1.5).stroke();
            y += 8;
            doc.fillColor(gray).font('Helvetica').fontSize(9)
               .text('GRAND TOTAL', M, y, { width: W - 2 * M - CW_A, align: 'right' });
            if (opts.grandTotal !== 0) {
                doc.fillColor(gold).font('Helvetica-Bold').fontSize(18)
                   .text(fmt(opts.grandTotal), 0, y - 4, { align: 'right', width: W - M });
            }
        } else {
            /* Legacy simple total */
            doc.fillColor(gray).font('Helvetica').fontSize(9)
               .text('ESTIMATED TOTAL', M, y, { width: W - 2 * M - CW_A, align: 'right' });
            if (opts.grandTotal !== 0) {
                doc.fillColor(gold).font('Helvetica-Bold').fontSize(18)
                   .text(fmt(opts.grandTotal), 0, y - 4, { align: 'right', width: W - M });
            }
        }
        y = doc.y + 16;

        /* Personal note */
        if (opts.customNote) {
            doc.moveTo(M, y).lineTo(W - M, y).strokeColor(divider).lineWidth(1).stroke();
            y += 12;
            doc.fillColor(gray).font('Helvetica').fontSize(8).text('A NOTE FROM OUR TEAM', M, y);
            y += 14;
            doc.fillColor(body).font('Helvetica').fontSize(10)
               .text(opts.customNote, M, y, { width: W - 2 * M, lineGap: 2 });
            y = doc.y + 12;
        }

        /* Disclaimer */
        if (y < doc.page.height - 120) {
            doc.moveTo(M, y).lineTo(W - M, y).strokeColor(divider).lineWidth(0.5).stroke();
            y += 10;
            doc.fillColor('#aaaaaa').font('Helvetica-Oblique').fontSize(8)
               .text('* All estimates are based on preliminary planning details and are subject to review during your consultation. Final pricing will be confirmed in your event agreement.',
                     M, y, { width: W - 2 * M, lineGap: 2 });
        }

        /* Footer */
        var fY = doc.page.height - 50;
        doc.rect(0, fY, W, 50).fill(dkGn);
        doc.fillColor('#a3b18a').font('Helvetica').fontSize(9)
           .text('RNB Events Production & Coordination LLC', 0, fY + 10, { align: 'center', width: W });
        doc.fillColor(mdGn).font('Helvetica').fontSize(8)
           .text('info@rnbevents716.com  \u00b7  rnbevents716.com', 0, fY + 26, { align: 'center', width: W });
        doc.fillColor(mdGn).font('Helvetica').fontSize(7)
           .text('Powered by ynk-techusa.com', 0, fY + 38, { align: 'center', width: W });

        doc.end();
    });
}

/* ── Contract PDF generator ──────────────────────────────────────── */
function generateContractPDF(opts) {
    // opts: { clientName, plannerName, eventType, eventDate, eventVenue,
    //         quotedAmount, quotedDeposit, agreedAmount, quotedPackage,
    //         coupleSignature, coupleSignedAt, plannerSignature, plannerSignedAt }
    return new Promise(function (resolve, reject) {
        var doc  = new PDFDocument({ margin: 0, size: 'LETTER' });
        var bufs = [];
        doc.on('data', function (c) { bufs.push(c); });
        doc.on('end',  function ()  { resolve(Buffer.concat(bufs)); });
        doc.on('error', reject);

        var W       = doc.page.width;
        var gold    = '#b89a5e';
        var dkGn    = '#2d3a2d';
        var mdGn    = '#527141';
        var gray    = '#888888';
        var body    = '#3d3d3d';
        var divider = '#e8e2d9';
        var M       = 50;

        function dStr(iso) {
            if (!iso) return '';
            try { var _d = new Date(iso); return isNaN(_d.getTime()) ? String(iso) : fmtOrdinal(_d); }
            catch (e) { return String(iso); }
        }

        function sec(title, y) {
            doc.fillColor(mdGn).font('Helvetica-Bold').fontSize(8.5)
               .text(title, M, y, { width: W - 2 * M });
            var ny = doc.y + 2;
            doc.moveTo(M, ny).lineTo(W - M, ny).strokeColor(dkGn).lineWidth(0.75).stroke();
            return doc.y + 5;
        }

        function para(text, y) {
            doc.fillColor(body).font('Helvetica').fontSize(9)
               .text(text, M, y, { width: W - 2 * M, lineGap: 1.5 });
            return doc.y + 6;
        }

        function bul(text, y) {
            doc.fillColor(body).font('Helvetica').fontSize(9)
               .text('\u2022  ' + text, M + 12, y, { width: W - 2 * M - 12, lineGap: 1.5 });
            return doc.y + 3;
        }

        function checkPage(y, needed) {
            if (y > doc.page.height - needed) { doc.addPage(); return 40; }
            return y;
        }

        /* ── Header ── */
        doc.rect(0, 0, W, 76).fill(dkGn);
        doc.fillColor(gold).font('Helvetica-Bold').fontSize(22).text('RNB EVENTS', M, 14);
        doc.fillColor('#a3b18a').font('Helvetica').fontSize(8).text('EVENT PLANNING & COORDINATION', M, 42);
        doc.fillColor(gold).font('Helvetica-Bold').fontSize(8).text('FULLY EXECUTED', 0, 42, { align: 'right', width: W - M });
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
           .text('EVENT VENDOR AGREEMENT', M, 56, { width: W - 2 * M, align: 'center' });

        var y = 90;

        /* ── Parties ── */
        doc.rect(M, y, W - 2 * M, 52).fill('#f5f2ec');
        doc.fillColor(dkGn).font('Helvetica-Bold').fontSize(8.5).text('PARTIES TO THIS AGREEMENT', M + 10, y + 8);
        doc.fillColor(body).font('Helvetica').fontSize(9)
           .text('Vendor:', M + 10, y + 22)
           .text(opts.plannerName || 'RNB Events', M + 58, y + 22)
           .text('Client:', M + 10, y + 36)
           .text(opts.clientName || 'Client', M + 58, y + 36);
        y += 60;

        /* ── Event details ── */
        doc.rect(M, y, W - 2 * M, 38).fill('#f9f7f4');
        doc.fillColor(mdGn).font('Helvetica-Bold').fontSize(8).text('EVENT DETAILS', M + 10, y + 6);
        doc.fillColor(body).font('Helvetica').fontSize(9)
           .text('Type: ' + (opts.eventType || 'TBD') + '   \u00b7   Date: ' + (opts.eventDate ? fmtEventDate(opts.eventDate) : 'TBD') + '   \u00b7   Venue: ' + (opts.eventVenue || 'TBD'), M + 10, y + 20, { width: W - 2 * M - 20 });
        y += 48;

        /* ── 1. Services ── */
        y = sec('1. SERVICES', y);
        y = para('The Vendor agrees to provide the decoration and design services outlined in the Client\'s mood board and written proposal (the "Working Scope"), which is subject to revision by mutual agreement until the Final Design Approval date. Agreed services cover the following:', y);
        y = bul('D\u00e9cor Concept & Mood Board: Custom concept development and collaborative mood board creation. The mood board may be revised by mutual written agreement up to 30 days prior to the event date.', y);
        y = bul('Sourcing & Procurement: Sourcing, procurement, and delivery of all decorative elements specifically listed in the Final Approved Scope.', y);
        y = bul('Setup & Installation: Full setup, styling, and installation of all Final Approved Scope d\u00e9cor at the designated venue prior to the event start time.', y);
        y = bul('Vendor Coordination: Coordination with venue staff and other vendors as it relates to execution of the Final Approved Scope d\u00e9cor.', y);
        y = bul('Breakdown & Removal: Post-event breakdown, removal, and cleanup of all Vendor-supplied d\u00e9cor items included in the Final Approved Scope.', y);
        y += 4;

        /* ── 2. Design Scope ── */
        y = checkPage(y, 180);
        y = sec('2. DESIGN SCOPE & FINAL APPROVAL', y);
        y = bul('Revision Window: The Client may request revisions to the mood board and Working Scope at any time up to 30 days before the event date. All revision requests must be submitted in writing.', y);
        y = bul('Final Design Approval: No later than 30 days prior to the event, the Vendor will present the then-current mood board for final sign-off. Once approved (or the deadline passes without objection), the scope is locked.', y);
        y = bul('Approved Scope Governs: This agreement secures the Vendor\'s availability and the agreed pricing. If the Final Approved Scope differs materially from the Working Scope, a written amendment must be agreed before the lock date.', y);
        y = para('Any elements or services not in the Final Approved Scope are add-ons subject to additional charges. All add-ons must be requested in writing, approved by the Vendor, and confirmed via a revised quote or written amendment.', y);
        y += 4;

        /* ── 3. Financial Commitment ── */
        y = checkPage(y, 160);
        y = sec('3. FINANCIAL COMMITMENT & PAYMENT OBLIGATION', y);
        if (opts.quotedAmount && Number(opts.quotedAmount) > 0) {
            var qAmt = '$' + Number(opts.quotedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 });
            var boxH = 52 + (opts.quotedPackage ? 14 : 0) + (opts.quotedDeposit && Number(opts.quotedDeposit) > 0 ? 14 : 0);
            doc.rect(M, y, W - 2 * M, boxH).fill('#f5f2ec').strokeColor(dkGn).lineWidth(1).stroke();
            doc.fillColor(mdGn).font('Helvetica-Bold').fontSize(8).text('AGREED QUOTED TOTAL', M + 10, y + 8);
            doc.fillColor(dkGn).font('Helvetica-Bold').fontSize(18).text(qAmt, M + 10, y + 20);
            var dY = y + 40;
            if (opts.quotedPackage) {
                doc.fillColor(body).font('Helvetica').fontSize(8.5).text('Package: ' + opts.quotedPackage, M + 10, dY);
                dY += 14;
            }
            if (opts.quotedDeposit && Number(opts.quotedDeposit) > 0) {
                var qDep = '$' + Number(opts.quotedDeposit).toLocaleString('en-US', { minimumFractionDigits: 2 });
                doc.fillColor(gray).font('Helvetica').fontSize(8.5).text('Non-refundable deposit: ' + qDep, M + 10, dY);
            }
            y += boxH + 8;
        }
        y = para('By signing this agreement, the Client acknowledges and confirms the quoted total amount presented in the official RNB Events proposal and commits to fulfilling the full payment obligation prior to the event date.', y);
        y += 4;

        /* ── 4. Client Responsibilities ── */
        y = checkPage(y, 180);
        y = sec('4. CLIENT RESPONSIBILITIES (CLIENT DELEGATE/EVENT PLANNER)', y);
        y = bul('Participate actively in the mood board and design review process and provide timely written feedback on all design proposals.', y);
        y = bul('Submit all scope revision requests in writing no later than 30 days before the event date.', y);
        y = bul('Provide written Final Design Approval no later than 30 days before the event.', y);
        y = bul('Fulfill all financial obligations per the agreed payment schedule, including charges resulting from approved add-ons or scope amendments.', y);
        y = bul('Ensure the designated venue is accessible to the Vendor for setup and breakdown at the agreed times.', y);
        y = bul('Notify the Vendor promptly of any changes to the event date, venue, or other logistical details.', y);
        y += 4;

        /* ── 5. Fees & Payment ── */
        y = checkPage(y, 120);
        y = sec('5. FEES & PAYMENT', y);
        if (opts.agreedAmount && Number(opts.agreedAmount) > 0) {
            var fmtAmt = '$' + Number(opts.agreedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 });
            y = para('The total agreed amount for all services rendered under this agreement is ' + fmtAmt + ', payable per the mutually agreed payment schedule. A non-refundable booking retainer is required to secure the event date. The agreed total includes the non-refundable deposit, which is due upon signing and is non-refundable under all circumstances.', y);
        } else {
            y = para('Fees and payment terms are as agreed upon in the separate fee schedule or proposal document. A non-refundable booking retainer is required to secure the event date. The agreed total stated in this agreement includes the non-refundable deposit, which is non-refundable under all circumstances.', y);
        }
        y += 4;

        /* ── 6. Cancellation ── */
        y = checkPage(y, 180);
        y = sec('6. CANCELLATION POLICY', y);
        y = para('In the event of cancellation by the Client:', y);
        y = bul('The non-refundable deposit/retainer is forfeited in full under all circumstances, including change of date or venue.', y);
        y = bul('Cancellations more than 60 days before the event date: deposit forfeited; no further balance is owed.', y);
        y = bul('Cancellations between 31 and 60 days before the event date: 50% of the remaining balance (after deposit) is due, as materials sourcing and planning will have commenced.', y);
        y = bul('Cancellations 30 days or fewer before the event date: the full contract amount is due, as the Final Approved Scope will have been locked and all materials procured or committed.', y);
        y = para('Date changes are subject to Vendor availability and may be treated as a cancellation and rebook at the Vendor\'s discretion.', y);
        y += 4;

        /* ── 7. Privacy ── */
        y = checkPage(y, 100);
        y = sec('7. PRIVACY & DATA SECURITY', y);
        y = para('RNB Events takes the privacy and security of all client and vendor information seriously. All personal data, event details, financial information, contract terms, and communications shared under this agreement are handled with the highest standard of care using industry-standard encryption and access controls. Neither party shall disclose the other\'s personal, financial, or logistical details to any third party without prior written consent, except as required by applicable law. RNB Events will never sell, rent, or share client information for marketing or commercial purposes.', y);
        y += 4;

        /* ── 8. Confidentiality ── */
        y = checkPage(y, 60);
        y = sec('8. CONFIDENTIALITY', y);
        y = para('Both parties agree to keep the terms of this agreement and any proprietary information confidential.', y);
        y += 4;

        /* ── 9. Agreement ── */
        y = checkPage(y, 100);
        y = sec('9. AGREEMENT', y);
        y = para('By signing below, both parties agree to the terms and conditions of this Event Vendor Agreement. The Client acknowledges that: (1) this agreement secures the Vendor\'s services based on the Working Scope at time of signing; (2) the mood board and design details may be collaboratively refined until the Final Design Approval date (30 days before the event); (3) any changes requested after the Final Design Approval date are subject to additional charges and Vendor availability; and (4) the Client confirms the quoted total amount stated in the official proposal and commits to fulfilling the full payment obligation prior to the event date. This agreement becomes legally binding when signed by both parties.', y);
        y += 8;

        /* ── Signatures ── */
        y = checkPage(y, 140);
        doc.rect(M, y, W - 2 * M, 22).fill(dkGn);
        doc.fillColor(gold).font('Helvetica-Bold').fontSize(8.5)
           .text('SIGNATURES \u2014 FULLY EXECUTED', M, y + 7, { align: 'center', width: W - 2 * M });
        y += 26;

        var colW = Math.floor((W - 2 * M - 16) / 2);
        var col1 = M;
        var col2 = M + colW + 16;

        /* Client sig */
        doc.rect(col1, y, colW, 82).fill('#f9f7f4').strokeColor(divider).lineWidth(0.5).stroke();
        doc.fillColor(mdGn).font('Helvetica-Bold').fontSize(7).text('CLIENT SIGNATURE', col1 + 8, y + 8);
        doc.fillColor(dkGn).font('Helvetica-BoldOblique').fontSize(15)
           .text(opts.coupleSignature || '', col1 + 8, y + 24, { width: colW - 16 });
        doc.moveTo(col1 + 8, y + 52).lineTo(col1 + colW - 8, y + 52).strokeColor('#ccc').lineWidth(0.5).stroke();
        doc.fillColor(gray).font('Helvetica').fontSize(8)
           .text(opts.clientName || '', col1 + 8, y + 57)
           .text(dStr(opts.coupleSignedAt), col1 + 8, y + 68, { width: colW - 16 });

        /* Planner sig */
        doc.rect(col2, y, colW, 82).fill('#f9f7f4').strokeColor(divider).lineWidth(0.5).stroke();
        doc.fillColor(mdGn).font('Helvetica-Bold').fontSize(7).text('VENDOR SIGNATURE', col2 + 8, y + 8);
        doc.fillColor(dkGn).font('Helvetica-BoldOblique').fontSize(15)
           .text(opts.plannerSignature || '', col2 + 8, y + 24, { width: colW - 16 });
        doc.moveTo(col2 + 8, y + 52).lineTo(col2 + colW - 8, y + 52).strokeColor('#ccc').lineWidth(0.5).stroke();
        doc.fillColor(gray).font('Helvetica').fontSize(8)
           .text(opts.plannerName || '', col2 + 8, y + 57)
           .text(dStr(opts.plannerSignedAt), col2 + 8, y + 68, { width: colW - 16 });

        y += 92;

        /* Executed stamp */
        doc.rect(M, y, W - 2 * M, 22).fill(mdGn);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
           .text('\u2713  FULLY EXECUTED \u2014 ' + dStr(opts.plannerSignedAt || new Date().toISOString()), M, y + 7, { align: 'center', width: W - 2 * M });
        y += 30;

        /* Footer */
        var fY = doc.page.height - 40;
        doc.rect(0, fY, W, 40).fill(dkGn);
        doc.fillColor('#a3b18a').font('Helvetica').fontSize(8)
           .text('RNB Events Production & Coordination LLC  \u00b7  info@rnbevents716.com  \u00b7  www.rnbevents716.com', 0, fY + 10, { align: 'center', width: W });
        doc.fillColor(mdGn).font('Helvetica').fontSize(7)
           .text('Powered by ynk-techusa.com', 0, fY + 26, { align: 'center', width: W });

        doc.end();
    });
}

/* ── Raw MIME email builder (supports PDF attachment) ─────────────── */
function buildRawEmail(to, subject, htmlBody, plainBody, pdfBuf, pdfFilename, bcc) {
    var mix = 'RNBmix' + Date.now();
    var alt = 'RNBalt' + Date.now();
    var b64 = function (s) {
        return Buffer.from(s, 'utf-8').toString('base64').match(/.{1,76}/g).join('\r\n');
    };
    var lines = [
        'From: RNB Events <' + FROM_EMAIL + '>',
        'To: ' + to,
        bcc ? 'Bcc: ' + bcc : null,
        'Subject: ' + subject,
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="' + mix + '"',
        '',
        '--' + mix,
        'Content-Type: multipart/alternative; boundary="' + alt + '"',
        '',
        '--' + alt,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(plainBody),
        '',
        '--' + alt,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(htmlBody),
        '',
        '--' + alt + '--',
        '',
        '--' + mix,
        'Content-Type: application/pdf',
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="' + pdfFilename + '"',
        '',
        pdfBuf.toString('base64').match(/.{1,76}/g).join('\r\n'),
        '',
        '--' + mix + '--'
    ];
    return Buffer.from(lines.filter(function(l){ return l !== null; }).join('\r\n'), 'utf-8');
}


async function readClients() {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const text = await res.Body.transformToString();
    return JSON.parse(text);
}

async function writeClients(clients) {
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: KEY,
        Body: JSON.stringify(clients),
        ContentType: 'application/json',
        CacheControl: 'no-cache, no-store, must-revalidate'
    }));
}

/* ── Section sanitizers ─────────────────────────── */

function sanitizeUrl(url) {
    url = String(url || '').slice(0, 2000);
    return /^https?:\/\//i.test(url) ? url : '';
}

/* Accepts https:// URLs and data: image URIs (device uploads) */
function sanitizeImageSrc(src) {
    src = String(src || '');
    if (/^https?:\/\//i.test(src)) return src.slice(0, 3000);
    if (/^data:image\/(jpeg|png|webp|gif);base64,/.test(src)) return src.slice(0, 200000);
    return '';
}

function sanitizeTimeline(data) {
    if (!Array.isArray(data)) return [];
    const STATUSES = ['upcoming', 'in-progress', 'done'];
    return data.slice(0, 50).map(item => ({
        date: String(item.date || '').slice(0, 100),
        milestone: String(item.milestone || '').slice(0, 200),
        notes: String(item.notes || '').slice(0, 500),
        status: STATUSES.includes(item.status) ? item.status : 'upcoming'
    })).filter(item => item.milestone.trim());
}

function sanitizeVendors(data) {
    if (!Array.isArray(data)) return [];
    return data.slice(0, 30).map(item => ({
        name: String(item.name || '').slice(0, 200),
        role: String(item.role || '').slice(0, 100),
        phone: String(item.phone || '').replace(/[^\d\s\-\+\(\)]/g, '').slice(0, 30),
        email: String(item.email || '').slice(0, 200),
        status: String(item.status || 'TBD').slice(0, 50)
    })).filter(item => item.name.trim());
}

function sanitizeDocuments(data) {
    if (!Array.isArray(data)) return [];
    return data.slice(0, 50).map(item => ({
        name: String(item.name || '').slice(0, 200),
        type: String(item.type || 'Document').slice(0, 100),
        url: sanitizeUrl(item.url),
        date: String(item.date || '').slice(0, 50)
    })).filter(item => item.name.trim() && item.url);
}

function sanitizeGallery(data) {
    if (!Array.isArray(data)) return [];
    return data.slice(0, 100).map(item => {
        if (typeof item === 'string') return { url: sanitizeImageSrc(item), caption: '' };
        return {
            url: sanitizeImageSrc(String(item.url || '')),
            caption: String(item.caption || '').slice(0, 300)
        };
    }).filter(item => item.url);
}

function sanitizeSeatingLayout(data) {
    if (!data || typeof data !== 'object') return { layoutImage: '', guestListEnabled: false, tables: [], tableMarkers: [] };
    return {
        layoutImage:      sanitizeImageSrc(String(data.layoutImage || '')),
        guestListEnabled: !!data.guestListEnabled,
        tables: Array.isArray(data.tables)
            ? data.tables.slice(0, 200).map(t => ({
                id:     String(t.id     || '').slice(0, 60).replace(/[^a-zA-Z0-9_\-]/g, '_'),
                name:   String(t.name   || 'Table').slice(0, 100),
                guests: Array.isArray(t.guests)
                    ? t.guests.slice(0, 1000).map(g => ({
                        firstName: String(g.firstName || '').slice(0, 100),
                        lastName:  String(g.lastName  || '').slice(0, 100)
                    })).filter(g => g.firstName || g.lastName)
                    : []
            }))
            : [],
        tableMarkers: Array.isArray(data.tableMarkers)
            ? data.tableMarkers.slice(0, 100).map(m => ({
                id:    String(m.id    || '').slice(0, 60).replace(/[^a-zA-Z0-9_\-]/g, '_'),
                label: String(m.label || '').slice(0, 100),
                x:     Math.max(0, Math.min(100, parseFloat(m.x) || 0)),
                y:     Math.max(0, Math.min(100, parseFloat(m.y) || 0))
            })).filter(m => m.label)
            : []
    };
}

function sanitizeMoodboard(data) {
    if (!data || typeof data !== 'object') return { ceremony: { enabled: true, palette: [], images: [], description: '' }, cocktails: { enabled: false, palette: [], images: [], description: '' }, reception: { enabled: false, palette: [], images: [], description: '' } };

    function sanitizeCat(cat) {
        if (!cat || typeof cat !== 'object') return { enabled: false, palette: [], images: [], description: '' };
        return {
            enabled:     cat.enabled === true,
            description: String(cat.description || '').slice(0, 2000),
            palette: Array.isArray(cat.palette)
                ? cat.palette.slice(0, 20).map(hex => String(hex).replace(/[^#a-fA-F0-9]/g, '').slice(0, 10))
                : [],
            images: Array.isArray(cat.images)
                ? cat.images.slice(0, 50).map(img => {
                    if (typeof img === 'string') return { url: sanitizeImageSrc(img), caption: '' };
                    return { url: sanitizeImageSrc(String(img.url || '')), caption: String(img.caption || '').slice(0, 300) };
                }).filter(img => img.url)
                : []
        };
    }

    /* Support old flat format (migrate to ceremony) */
    if (!data.ceremony && !data.cocktails && !data.reception) {
        return {
            ceremony:  { enabled: true, description: String(data.description || '').slice(0, 2000), palette: sanitizeCat({ palette: data.palette, images: data.images }).palette, images: sanitizeCat({ palette: data.palette, images: data.images }).images },
            cocktails: { enabled: false, palette: [], images: [], description: '' },
            reception: { enabled: false, palette: [], images: [], description: '' }
        };
    }

    return {
        ceremony:  sanitizeCat(data.ceremony),
        cocktails: sanitizeCat(data.cocktails),
        reception: sanitizeCat(data.reception)
    };
}

function sanitizePaymentSchedule(data) {
    if (!data || typeof data !== 'object') return null;
    const items = Array.isArray(data.items)
        ? data.items.slice(0, 50).map(it => ({
            label:   String(it.label   || '').slice(0, 200),
            amount:  Math.max(0, parseFloat(it.amount) || 0),
            dueDate: String(it.dueDate  || '').slice(0, 20),
            paid:    it.paid === true,
            paidAt:  String(it.paidAt   || '').slice(0, 50)
        })).filter(it => it.label || it.amount)
        : [];
    return {
        items,
        lastUpdatedAt: String(data.lastUpdatedAt || new Date().toISOString()).slice(0, 50),
        lastUpdatedBy: String(data.lastUpdatedBy || 'Admin').slice(0, 100)
    };
}

function sanitizeAgreement(data) {
    if (!data || typeof data !== 'object') return { status: 'pending', coupleSignature: '', coupleSignedAt: '', plannerSignature: '', plannerSignedAt: '', coupleSignatureIp: '', coupleSignatureUserAgent: '', attachments: [] };
    const STATUSES = ['pending', 'couple-signed', 'fully-executed'];
    return {
        status:                   STATUSES.includes(data.status) ? data.status : 'pending',
        coupleSignature:          String(data.coupleSignature          || '').slice(0, 300),
        coupleSignedAt:           String(data.coupleSignedAt           || '').slice(0, 50),
        coupleSignatureIp:        String(data.coupleSignatureIp        || '').slice(0, 100),
        coupleSignatureUserAgent: String(data.coupleSignatureUserAgent || '').slice(0, 500),
        plannerSignature:         String(data.plannerSignature         || '').slice(0, 300),
        plannerSignedAt:          String(data.plannerSignedAt          || '').slice(0, 50),
        attachments: Array.isArray(data.attachments) ? data.attachments.slice(0, 20).map(a => ({
            name:       String(a.name       || '').slice(0, 200),
            url:        sanitizeUrl(a.url),
            uploadedAt: String(a.uploadedAt || '').slice(0, 50),
            caption:    String(a.caption    || '').slice(0, 300)
        })).filter(a => a.url) : []
    };
}

const SECTION_SANITIZERS = {
    timeline: sanitizeTimeline,
    vendors: sanitizeVendors,
    documents: sanitizeDocuments,
    gallery: sanitizeGallery,
    moodboard: sanitizeMoodboard,
    agreement: sanitizeAgreement,
    seatingLayout: sanitizeSeatingLayout,
    paymentSchedule: sanitizePaymentSchedule
};

/* ── Find client by any of 3 access hashes ──────── */
function findClientByAnyHash(clients, hash) {
    return clients.findIndex(c =>
        c.codeHash === hash ||
        c.plannerCodeHash === hash ||
        c.teamCodeHash === hash
    );
}

/* ── Append an entry to the client's editLog ─────── */
function appendEditLog(client, entry) {
    const ROLES = ['couple', 'planner', 'rnbTeam'];
    if (!client.editLog) client.editLog = [];
    client.editLog = client.editLog.slice(-49);
    client.editLog.push({
        ts:       String(entry.ts       || new Date().toISOString()).slice(0, 50),
        role:     ROLES.includes(entry.role) ? entry.role : 'unknown',
        roleName: String(entry.roleName || '').slice(0, 100),
        action:   String(entry.action   || '').slice(0, 200)
    });
}

/* ── Admin CRM data (S3) ───────────────────────── */
async function readAdminData() {
    try {
        const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: ADMIN_DATA_KEY }));
        const text = await res.Body.transformToString();
        return JSON.parse(text);
    } catch (e) {
        // NoSuchKey on first use — return empty structure
        return { prospects: [], tasks: [], content: {}, adminCodeHash: '' };
    }
}

async function writeAdminData(data) {
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: ADMIN_DATA_KEY,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
        CacheControl: 'no-cache, no-store, must-revalidate'
    }));
}

function getKnownAdminHash(adminData) {
    return ((adminData.adminCodeHash || '') || '47d538bc9bbdba86910d104f78b851d87356c7fcee36e214878a5a24f7bbedf4').toLowerCase();
}

async function ensureAuthorizedAdmin(submittedAdminHash) {
    const submittedHash = String(submittedAdminHash || '').toLowerCase().trim();
    if (!submittedHash || !/^[a-f0-9]{64}$/.test(submittedHash)) {
        return false;
    }
    const adminData = await readAdminData();
    return submittedHash === getKnownAdminHash(adminData);
}

/* ── Create admin task via S3 ─────────────────── */
async function createAdminTask(taskObj) {
    try {
        const data = await readAdminData();
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        tasks.unshift(taskObj);
        await writeAdminData({ ...data, tasks });
    } catch (e) {
        console.error('Failed to create admin task:', e);
    }
}

/* ── Register a new lead/prospect in Admin CRM ── */
async function createAdminProspect(prospectObj) {
    /* No internal catch — caller is responsible for handling failure.
       This ensures S3 write errors are never silently swallowed. */
    const data = await readAdminData();
    const prospects = Array.isArray(data.prospects) ? data.prospects : [];
    prospects.unshift(prospectObj);
    await writeAdminData({ ...data, prospects });
}

/* ── IP geolocation (ip-api.com free tier) ───── */
async function geoLookup(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1') return { city: '', country: '' };
    /* Strip port if present (IPv4:port or [IPv6]:port) */
    const cleanIp = ip.replace(/:\d+$/, '').replace(/^\[(.+)\]$/, '$1');
    if (!cleanIp) return { city: '', country: '' };
    try {
        /* ipinfo.io returns city/region/country as a single JSON object — free tier, HTTPS, good accuracy */
        const res = await fetch(`https://ipinfo.io/${cleanIp}/json`, {
            signal: AbortSignal.timeout(2000)
        });
        if (!res.ok) return { city: '', country: '' };
        const data = await res.json();
        /* ipinfo.io bogon/private IPs return { bogon: true } */
        if (data.bogon) return { city: '', country: '' };
        return {
            city:    String(data.city    || '').slice(0, 100),
            country: String(data.country || '').slice(0, 100)
        };
    } catch (e) {
        return { city: '', country: '' };
    }
}

exports.handler = async (event) => {
    if (event.requestContext && event.requestContext.http && event.requestContext.http.method === 'OPTIONS') {
        return respond(200, '');
    }

    const path = (event.rawPath || event.requestContext.http.path || '').replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || 'POST').toUpperCase();

    try {
        const body = JSON.parse(event.body || '{}');

        /* ── Admin data: GET all (replaces Google Apps Script) ── */
        if (path === '/admin-data' && body.action === 'get') {
            const data = await readAdminData();
            return respond(200, data);
        }

        /* ── Admin data: POST/save (replaces Google Apps Script) ── */
        if (path === '/admin-data' && method === 'POST') {
            const current = await readAdminData();
            // Merge: only update keys that are present in body
            const updated = { ...current };
            if (Array.isArray(body.prospects))    updated.prospects     = body.prospects;
            if (Array.isArray(body.tasks))         updated.tasks         = body.tasks;
            if (body.content && typeof body.content === 'object') {
                updated.content = { ...(current.content || {}), ...body.content };
            }
            if (body.contentHistory && typeof body.contentHistory === 'object') {
                updated.contentHistory = body.contentHistory;
            }
            if (typeof body.adminCodeHash === 'string') updated.adminCodeHash = body.adminCodeHash;
            await writeAdminData(updated);
            return respond(200, { ok: true, ts: new Date().toISOString() });
        }

        if (path === '/admin-upload-content-image' && method === 'POST') {
            const isAuthorized = await ensureAuthorizedAdmin(body.adminCodeHash);
            if (!isAuthorized) return respond(401, { ok: false, error: 'Unauthorized' });

            const fileName = String(body.fileName || 'content-image').slice(0, 200);
            const contentType = String(body.contentType || '').toLowerCase();
            const draftKey = String(body.draftKey || 'draft').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'draft';
            const data = String(body.data || '');
            const allowed = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
                'image/gif': 'gif'
            };
            const ext = allowed[contentType];
            if (!ext) return respond(400, { ok: false, error: 'Only JPEG, PNG, WebP, or GIF images are allowed.' });
            if (!/^[A-Za-z0-9+/=]+$/.test(data)) return respond(400, { ok: false, error: 'Invalid image payload.' });

            const buf = Buffer.from(data, 'base64');
            if (!buf.length) return respond(400, { ok: false, error: 'Image payload is empty.' });
            if (buf.length > 8 * 1024 * 1024) return respond(400, { ok: false, error: 'Image exceeds 8 MB limit.' });

            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '').slice(0, 80) || 'content-image';
            const key = `admin-content-drafts/${Date.now()}-${draftKey}-${safeName}.${ext}`;

            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buf,
                ContentType: contentType,
                CacheControl: 'public, max-age=31536000, immutable'
            }));

            return respond(200, { ok: true, url: `https://${BUCKET}.s3.us-east-2.amazonaws.com/${key}` });
        }

        /* ── Admin: full publish ────────────────────── */
        if (path === '/upload-clients') {
            if (!body.clients || !Array.isArray(body.clients)) {
                return respond(400, { ok: false, error: 'Missing clients array' });
            }

            /* Additive upsert: incoming clients are merged/added into S3; existing
               clients NOT in the incoming list are KEPT unless their id appears in
               the optional deletedIds array.  This prevents a stale admin session
               (one whose localStorage hadn't yet loaded all S3 clients) from
               accidentally wiping clients that exist on S3.
               Portal sections from S3 always win so in-progress portal work is
               never overwritten by a stale admin session. */
            // Sections that are ALWAYS preserved from S3 (client-only data, admin cannot overwrite)
            const PORTAL_SECTIONS = ['timeline','vendors','documents','gallery','moodboard','agreement','editLog','trackingNotes','seatingLayout'];
            const deletedIds = Array.isArray(body.deletedIds)
                ? new Set(body.deletedIds.map(String))
                : new Set();

            let existing = [];
            try { existing = await readClients(); } catch (e) { /* first write */ }
            if (!Array.isArray(existing)) existing = [];

            const existingById = {};
            existing.forEach(c => { if (c && c.id) existingById[c.id] = c; });

            // Upsert all incoming clients (preserving portal sections from S3)
            const mergedById = {};
            body.clients.forEach(incoming => {
                const s3 = existingById[incoming.id];
                if (!s3) {
                    mergedById[incoming.id] = incoming; // new client
                } else {
                    const out = Object.assign({}, incoming);
                    PORTAL_SECTIONS.forEach(k => { if (s3[k] !== undefined) out[k] = s3[k]; });

                    // paymentSchedule: admin controls the item list/structure,
                    // but paid confirmations previously recorded in S3 are preserved.
                    const adminPS = incoming.paymentSchedule;
                    const s3PS    = s3.paymentSchedule;
                    if (adminPS && Array.isArray(adminPS.items)) {
                        if (s3PS && Array.isArray(s3PS.items)) {
                            // Build lookup of S3 items marked paid, keyed by normalised label
                            const s3Paid = {};
                            s3PS.items.forEach(it => {
                                if (it.paid && it.label) s3Paid[String(it.label).trim().toLowerCase()] = it;
                            });
                            out.paymentSchedule = Object.assign({}, adminPS, {
                                items: adminPS.items.map(it => {
                                    const key = String(it.label || '').trim().toLowerCase();
                                    const confirmed = key && s3Paid[key];
                                    if (confirmed) {
                                        return Object.assign({}, it, { paid: true, paidAt: confirmed.paidAt || it.paidAt || new Date().toISOString() });
                                    }
                                    return it;
                                })
                            });
                        } else {
                            out.paymentSchedule = adminPS; // no S3 schedule yet — use admin's
                        }
                    } else if (s3PS !== undefined) {
                        out.paymentSchedule = s3PS; // admin sent nothing — keep S3
                    }

                    mergedById[incoming.id] = out;
                }
            });

            // Keep existing S3 clients not in incoming, unless explicitly deleted
            existing.forEach(c => {
                if (c && c.id && !mergedById[c.id] && !deletedIds.has(String(c.id))) {
                    mergedById[c.id] = c;
                }
            });

            const merged = Object.values(mergedById);
            await writeClients(merged);
            return respond(200, { ok: true, count: merged.length });
        }

        /* ── Client: update own tracking notes ──────── */
        if (path === '/update-client-notes') {
            const { codeHash, clientTodos, plannerTodos, teamTodos, editLogEntry } = body;
            if (!codeHash || typeof codeHash !== 'string') return respond(400, { ok: false, error: 'Missing codeHash' });

            const ALLOWED = ['pending', 'in-progress', 'done', 'not-applicable'];
            const ROLES   = ['couple', 'planner', 'rnbTeam'];

            function sanitizeTodoList(arr) {
                if (!Array.isArray(arr)) return null;
                return arr.slice(0, 100).map(item => {
                    const out = {
                        text:   String(item.text   || '').slice(0, 500),
                        status: ALLOWED.includes(item.status) ? item.status : 'pending'
                    };
                    if (item.addedAt)  out.addedAt  = String(item.addedAt).slice(0, 50);
                    if (item.addedBy && ROLES.includes(item.addedBy)) out.addedBy = item.addedBy;
                    return out;
                }).filter(item => item.text.trim().length > 0);
            }

            const cleanClientTodos  = clientTodos  !== undefined ? sanitizeTodoList(clientTodos)  : undefined;
            const cleanPlannerTodos = plannerTodos  !== undefined ? sanitizeTodoList(plannerTodos) : undefined;
            const cleanTeamTodos    = teamTodos     !== undefined ? sanitizeTodoList(teamTodos)    : undefined;

            if (clientTodos !== undefined && cleanClientTodos === null)
                return respond(400, { ok: false, error: 'clientTodos must be an array' });

            const clients = await readClients();
            const idx = findClientByAnyHash(clients, codeHash);
            if (idx === -1) return respond(404, { ok: false, error: 'Client not found' });

            if (!clients[idx].trackingNotes) clients[idx].trackingNotes = {};
            if (cleanClientTodos  !== undefined && cleanClientTodos  !== null) clients[idx].trackingNotes.clientTodos  = cleanClientTodos;
            if (cleanPlannerTodos !== undefined && cleanPlannerTodos !== null) clients[idx].trackingNotes.plannerTodos = cleanPlannerTodos;
            if (cleanTeamTodos    !== undefined && cleanTeamTodos    !== null) clients[idx].trackingNotes.teamTodos    = cleanTeamTodos;

            if (editLogEntry && typeof editLogEntry === 'object') {
                appendEditLog(clients[idx], editLogEntry);
            }

            await writeClients(clients);
            return respond(200, { ok: true });
        }

        /* ── Client: update any portal section ──────── */
        if (path === '/update-client-section') {
            const { codeHash, section, data, editLogEntry } = body;
            if (!codeHash || typeof codeHash !== 'string') return respond(400, { ok: false, error: 'Missing codeHash' });
            if (!SECTION_SANITIZERS[section]) return respond(400, { ok: false, error: 'Invalid section: ' + section });

            const clients = await readClients();
            const idx = findClientByAnyHash(clients, codeHash);
            if (idx === -1) return respond(404, { ok: false, error: 'Client not found' });

            const oldAgreementStatus = (clients[idx].agreement || {}).status;
            clients[idx][section] = SECTION_SANITIZERS[section](data);

            /* For agreement: capture IP + userAgent server-side when couple signs for the first time */
            if (section === 'agreement' && clients[idx].agreement.status === 'couple-signed' && oldAgreementStatus === 'pending') {
                const sigIp = (event.requestContext && event.requestContext.http && event.requestContext.http.sourceIp)
                    ? event.requestContext.http.sourceIp
                    : ((event.headers && (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For']))
                        ? (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For']).split(',')[0].trim()
                        : 'Unknown');
                clients[idx].agreement.coupleSignatureIp        = sigIp.slice(0, 100);
                clients[idx].agreement.coupleSignatureUserAgent = String(body.coupleSignatureUserAgent || '').slice(0, 500);
            }

            if (editLogEntry && typeof editLogEntry === 'object') {
                appendEditLog(clients[idx], editLogEntry);
            }

            await writeClients(clients);

            /* When the seating layout is saved, pre-generate a compact guest-seat snapshot
               stored at guests/{guestCode}.json in S3. The /guest-seat-lookup endpoint reads
               this small file first, avoiding a full clients.json parse under high concurrency.
               Also invalidate the in-memory cache for this guest code. */
            if (section === 'seatingLayout') {
                try {
                    const c = clients[idx];
                    const guestCode = typeof c.codeHash === 'string' ? c.codeHash.slice(0, 20) : '';
                    if (guestCode.length >= 16) {
                        const sl = c.seatingLayout || {};
                        const mb = c.moodboard || {};
                        const paletteSrc = (mb.reception && Array.isArray(mb.reception.palette) && mb.reception.palette.length)
                            ? mb.reception.palette
                            : (mb.ceremony && Array.isArray(mb.ceremony.palette) && mb.ceremony.palette.length)
                                ? mb.ceremony.palette
                                : (mb.cocktails && Array.isArray(mb.cocktails.palette) && mb.cocktails.palette.length)
                                    ? mb.cocktails.palette : [];
                        const palette = paletteSrc
                            .filter(h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.trim()))
                            .slice(0, 10).map(h => h.trim().toLowerCase());
                        const snapshot = {
                            ok:           true,
                            eventName:    String(c.fullName || c.firstName || 'Your Event').replace(/[<>"]/g, ''),
                            eventDate:    String(c.eventDate  || '').slice(0, 100),
                            eventVenue:   String(c.eventVenue || '').slice(0, 200),
                            palette,
                            layoutImage:  sl.layoutImage   || '',
                            tableMarkers: Array.isArray(sl.tableMarkers) ? sl.tableMarkers : [],
                            tables:       Array.isArray(sl.tables) ? sl.tables.map(t => ({
                                id:   t.id,
                                name: String(t.name || '').replace(/[<>"]/g, ''),
                                guests: (t.guests || []).map(g => ({
                                    firstName: String(g.firstName || '').replace(/[<>"]/g, ''),
                                    lastName:  String(g.lastName  || '').replace(/[<>"]/g, '')
                                }))
                            })) : []
                        };
                        await s3.send(new PutObjectCommand({
                            Bucket: BUCKET,
                            Key: 'guests/' + guestCode + '.json',
                            Body: JSON.stringify(snapshot),
                            ContentType: 'application/json'
                        }));
                        /* Invalidate in-memory cache so next request re-reads the fresh file */
                        _guestSeatCache.delete(guestCode);
                    }
                } catch (snapErr) {
                    console.error('Failed to write guest-seat snapshot:', snapErr);
                    /* Non-fatal — /guest-seat-lookup falls back to readClients() */
                }
            }

            /* Send confirmation email to client immediately when they sign (couple-signed transition) */
            if (section === 'agreement' && clients[idx].agreement.status === 'couple-signed' && oldAgreementStatus === 'pending') {
                const c = clients[idx];
                const clientEmail = c.email || '';
                const clientName  = c.fullName || c.firstName || 'Client';
                const agr         = c.agreement;
                if (clientEmail) {
                    const confirmHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:40px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:8px 0 0;color:#a3b18a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Crafting Moments That Last Forever</p>
</td></tr>
<tr><td style="padding:40px 30px">
  <h2 style="margin:0 0 20px;color:#2d3a2d;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400">Agreement Signed — Awaiting Countersignature</h2>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">Dear ${clientName.replace(/[<>"]/g, '')},</p>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">This email confirms that you have signed the <strong>Event Vendor Agreement</strong> with RNB Events. Your signature has been recorded and the agreement is now awaiting countersignature from your Vendor.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:4px;margin:0 0 24px">
    <tr><td style="padding:24px">
      <p style="margin:0 0 12px;color:#527141;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600">Signature Details</p>
      <table width="100%" cellpadding="4" cellspacing="0">
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Name Signed</td><td style="color:#2d3a2d;font-size:13px;font-weight:600;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(agr.coupleSignature || '').replace(/[<>"]/g, '')}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Date &amp; Time</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${agr.coupleSignedAt ? new Date(agr.coupleSignedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Event</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(c.eventType || 'Event').replace(/[<>"]/g, '')}${c.eventDate ? ' — ' + fmtEventDate(c.eventDate) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0">Status</td><td style="color:#b89a5e;font-size:13px;font-weight:600;padding:4px 0;text-align:right">AWAITING COUNTERSIGNATURE</td></tr>
      </table>
    </td></tr>
  </table>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">You will receive another email once RNB Events countersigns the agreement.</p>
  <p style="color:#888;font-size:12px;line-height:1.6;margin:0 0 16px">If you did not authorize this signature, please contact us immediately at <a href="mailto:rnbevents716@gmail.com" style="color:#527141">rnbevents716@gmail.com</a>.</p>
  <p style="color:#aaa;font-size:11px;line-height:1.6;margin:0">Device: ${(agr.coupleSignatureUserAgent || 'Unknown').replace(/[<>"]/g, '').slice(0, 120)}</p>
</td></tr>
<tr><td style="background:#2d3a2d;padding:24px 30px;text-align:center">
  <p style="margin:0 0 6px;color:#b89a5e;font-size:12px;letter-spacing:1px">RNB EVENTS</p>
  <p style="margin:0;color:#a3b18a;font-size:11px">www.rnbevents716.com</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
                    try {
                        await ses.send(new SendEmailCommand({
                            Source: FROM_EMAIL,
                            Destination: { ToAddresses: [clientEmail.slice(0, 200)] },
                            Message: {
                                Subject: { Data: 'RNB Events — You Have Signed the Agreement (Awaiting Countersignature)' },
                                Body: {
                                    Html: { Data: confirmHtml },
                                    Text: { Data: `Dear ${clientName},\n\nThis confirms you have signed the Event Vendor Agreement with RNB Events.\n\nName Signed: ${agr.coupleSignature || ''}\nDate: ${agr.coupleSignedAt || ''}\nEvent: ${c.eventType || 'Event'}${c.eventDate ? ' \u2014 ' + fmtEventDate(c.eventDate) : ''}\nStatus: Awaiting countersignature\n\nIf you did not authorize this signature, contact us immediately at rnbevents716@gmail.com.\n\n- RNB Events\nwww.rnbevents716.com` }
                                }
                            }
                        }));
                    } catch (emailErr) {
                        console.error('Failed to send signing confirmation email:', emailErr);
                    }
                }
                /* Also notify planner that client has signed and countersignature is required */
                const plannerAlertEmail = (c.plannerEmail || '').trim();
                if (plannerAlertEmail && plannerAlertEmail !== RECOVERY_EMAIL) {
                    try {
                        await ses.send(new SendEmailCommand({
                            Source: FROM_EMAIL,
                            Destination: { ToAddresses: [plannerAlertEmail.slice(0, 200)] },
                            Message: {
                                Subject: { Data: `RNB Events \u2014 ${(c.fullName || c.firstName || 'Your Client').replace(/[<>"]/g, '')} Has Signed — Countersignature Required` },
                                Body: {
                                    Html: { Data: `<html><body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#2d3a2d"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><h2 style="color:#2d3a2d">Countersignature Required</h2><p>${(c.fullName || c.firstName || 'Your client').replace(/[<>"]/g, '')} has signed the Event Vendor Agreement.</p><p><strong>Signed:</strong> ${(agr.coupleSignature || '').replace(/[<>"]/g, '')} &mdash; ${agr.coupleSignedAt ? new Date(agr.coupleSignedAt).toLocaleString('en-US') : ''}</p><p><strong>Event:</strong> ${(c.eventType || '').replace(/[<>"]/g, '')}${c.eventDate ? ' &mdash; ' + fmtEventDate(c.eventDate) : ''}</p><p>Please log in to the RNB Events portal and countersign the agreement to fully execute the contract.</p><p><a href="https://rnb716events.com/Client/documents.html">Go to Client Portal &rarr;</a></p><hr style="border:none;border-top:1px solid #e0dcd4"><p style="font-size:12px;color:#888">RNB Events &mdash; www.rnbevents716.com</p></div></body></html>` },
                                    Text: { Data: `${(c.fullName || 'Your client')} has signed the Event Vendor Agreement and countersignature is required.\n\nSigned: ${agr.coupleSignature || ''} on ${agr.coupleSignedAt || ''}\nEvent: ${c.eventType || ''}${c.eventDate ? ' \u2014 ' + fmtEventDate(c.eventDate) : ''}\n\nLog in to countersign: https://rnb716events.com/Client/documents.html\n\n- RNB Events` }
                                }
                            }
                        }));
                    } catch (plannerAlertErr) {
                        console.error('Failed to send planner countersign alert:', plannerAlertErr);
                    }
                }
            }

            /* Auto-send receipt + create admin task when agreement becomes fully-executed */
            if (section === 'agreement' && clients[idx].agreement.status === 'fully-executed' && oldAgreementStatus !== 'fully-executed') {
                const c = clients[idx];
                const clientName = c.fullName || c.firstName || 'Client';
                const clientEmail = c.email || '';
                const agr = c.agreement;

                /* Generate the signed contract PDF once for attachment */
                let contractPdfBuf = null;
                try {
                    contractPdfBuf = await generateContractPDF({
                        clientName:       clientName,
                        plannerName:      c.planner || 'RNB Events Team',
                        eventType:        c.eventType  || '',
                        eventDate:        c.eventDate  || '',
                        eventVenue:       c.eventVenue || '',
                        quotedAmount:     c.quotedAmount,
                        quotedDeposit:    c.quotedDeposit,
                        quotedPackage:    c.quotedPackage,
                        agreedAmount:     c.agreedAmount,
                        coupleSignature:  agr.coupleSignature  || '',
                        coupleSignedAt:   agr.coupleSignedAt   || '',
                        plannerSignature: agr.plannerSignature || '',
                        plannerSignedAt:  agr.plannerSignedAt  || ''
                    });
                } catch (pdfErr) {
                    console.error('Contract PDF generation failed:', pdfErr);
                }

                const contractFilename = 'RNB_Events_Agreement_' + (clientName || 'Client').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';

                /* Build shared HTML receipt body */
                const makeReceiptHtml = (recipientName, extraNote) => `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:40px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:8px 0 0;color:#a3b18a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Crafting Moments That Last Forever</p>
</td></tr>
<tr><td style="padding:40px 30px">
  <h2 style="margin:0 0 20px;color:#2d3a2d;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400">Agreement Fully Executed</h2>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">Dear ${String(recipientName).replace(/[<>"]/g, '')},</p>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">${String(extraNote).replace(/[<>"&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;'}[c]))}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:4px;margin:0 0 24px">
    <tr><td style="padding:24px">
      <p style="margin:0 0 12px;color:#527141;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600">Agreement Details</p>
      <table width="100%" cellpadding="4" cellspacing="0">
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Event</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(c.eventType || 'Event').replace(/[<>"]/g, '')}${c.eventDate ? ' \u2014 ' + fmtEventDate(c.eventDate) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Client</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${clientName.replace(/[<>"]/g, '')}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Client Signed</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(agr.coupleSignature || '').replace(/[<>"]/g, '')} on ${agr.coupleSignedAt ? fmtOrdinal(new Date(agr.coupleSignedAt)) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Vendor Signed</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(agr.plannerSignature || '').replace(/[<>"]/g, '')} on ${agr.plannerSignedAt ? fmtOrdinal(new Date(agr.plannerSignedAt)) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0">Status</td><td style="color:#527141;font-size:13px;font-weight:600;padding:4px 0;text-align:right">FULLY EXECUTED</td></tr>
      </table>
    </td></tr>
  </table>
  ${contractPdfBuf ? '<p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">The fully signed agreement is attached as a PDF for your records.</p>' : ''}
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">You can view the agreement at any time in the <a href="https://rnb716events.com/Client/documents.html" style="color:#527141">Client Portal</a>.</p>
  <p style="color:#888;font-size:12px;line-height:1.6;margin:0">If you have any questions, please reach out to your event planner.</p>
</td></tr>
<tr><td style="background:#2d3a2d;padding:24px 30px;text-align:center">
  <p style="margin:0 0 6px;color:#b89a5e;font-size:12px;letter-spacing:1px">RNB EVENTS</p>
  <p style="margin:0;color:#a3b18a;font-size:11px">www.rnbevents716.com</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

                /* Send receipt + PDF to client */
                if (clientEmail) {
                    const clientHtml  = makeReceiptHtml(clientName, 'Your Events Production &amp; Coordination Agreement has been fully signed by all parties. This email serves as your official receipt and confirmation.');
                    const clientPlain = `Dear ${clientName},\n\nYour Events Production & Coordination Agreement has been fully signed by all parties.\n\nClient Signed: ${agr.coupleSignature || ''} on ${agr.coupleSignedAt || ''}\nVendor Signed: ${agr.plannerSignature || ''} on ${agr.plannerSignedAt || ''}\n${contractPdfBuf ? '\nThe signed agreement PDF is attached to this email.\n' : ''}\nView your agreement: https://rnb716events.com/Client/documents.html\n\n- RNB Events`;
                    try {
                        if (contractPdfBuf) {
                            const rawMsg = buildRawEmail(clientEmail.slice(0, 200), 'RNB Events \u2014 Your Agreement Has Been Fully Executed', clientHtml, clientPlain, contractPdfBuf, contractFilename);
                            await ses.send(new SendRawEmailCommand({ RawMessage: { Data: rawMsg } }));
                        } else {
                            await ses.send(new SendEmailCommand({
                                Source: FROM_EMAIL,
                                Destination: { ToAddresses: [clientEmail.slice(0, 200)] },
                                Message: { Subject: { Data: 'RNB Events \u2014 Your Agreement Has Been Fully Executed' }, Body: { Html: { Data: clientHtml }, Text: { Data: clientPlain } } }
                            }));
                        }
                    } catch (emailErr) {
                        console.error('Failed to send agreement receipt to client:', emailErr);
                    }
                }

                /* Send receipt + PDF to planner — fall back to admin inbox if no plannerEmail set */
                const plannerReceiptEmail = (c.plannerEmail || '').trim() || RECOVERY_EMAIL;
                const plannerName = c.planner || 'RNB Events Team';
                const plannerHtml  = makeReceiptHtml(plannerName, `The Event Vendor Agreement for <strong>${(c.fullName || c.firstName || 'Client').replace(/[<>"]/g, '')}</strong> has been fully executed by both parties. The signed PDF is attached for your records.`);
                const plannerPlain = `Dear ${plannerName},\n\nThe Event Vendor Agreement for ${clientName} has been fully executed.\n\nClient Signed: ${agr.coupleSignature || ''} on ${agr.coupleSignedAt || ''}\nVendor Signed: ${agr.plannerSignature || ''} on ${agr.plannerSignedAt || ''}\nEvent: ${c.eventType || ''}${c.eventDate ? ' \u2014 ' + fmtEventDate(c.eventDate) : ''}\n${contractPdfBuf ? '\nThe signed agreement PDF is attached.\n' : ''}\n- RNB Events`;
                try {
                    if (contractPdfBuf) {
                        const adminRaw = buildRawEmail(plannerReceiptEmail.slice(0, 200), `RNB Events \u2014 Agreement Fully Executed: ${(c.fullName || c.firstName || 'Client').replace(/[<>"]/g, '')}`, plannerHtml, plannerPlain, contractPdfBuf, contractFilename);
                        await ses.send(new SendRawEmailCommand({ RawMessage: { Data: adminRaw } }));
                    } else {
                        await ses.send(new SendEmailCommand({
                            Source: FROM_EMAIL,
                            Destination: { ToAddresses: [plannerReceiptEmail.slice(0, 200)] },
                            Message: { Subject: { Data: `RNB Events \u2014 Agreement Fully Executed: ${(c.fullName || c.firstName || 'Client').replace(/[<>"]/g, '')}` }, Body: { Html: { Data: plannerHtml }, Text: { Data: plannerPlain } } }
                        }));
                    }
                } catch (plannerReceiptErr) {
                    console.error('Failed to send planner receipt:', plannerReceiptErr);
                }

                /* Also create admin task as confirmation */
                createAdminTask({
                    id:         't' + Date.now(),
                    section:    'Client Portal',
                    task:       'Agreement fully executed for ' + clientName + (clientEmail ? ' — receipt sent to ' + clientEmail : ' — no email on file'),
                    priority:   'High',
                    status:     clientEmail ? 'Done' : 'Pending',
                    githubFile: ''
                });
            }

            return respond(200, { ok: true });
        }

        /* ── Enable Seating Layout add-on ($39.99) ──── */
        /* Called from the client portal when the client opts in.
           Saves the enabled flag and sends receipt emails to both
           the client and admin so it can be added to the contract. */
        if (path === '/enable-seating-layout') {
            const { codeHash } = body;
            if (!codeHash || typeof codeHash !== 'string') return respond(400, { ok: false, error: 'Missing codeHash' });

            const clients = await readClients();
            const idx = findClientByAnyHash(clients, codeHash);
            if (idx === -1) return respond(404, { ok: false, error: 'Client not found' });

            const c = clients[idx];

            /* Guard: already enabled */
            if (c.seatingLayout && c.seatingLayout.guestListEnabled) {
                return respond(200, { ok: true, alreadyEnabled: true });
            }

            /* Enable */
            c.seatingLayout = Object.assign(
                { layoutImage: '', tables: [] },
                c.seatingLayout || {},
                { guestListEnabled: true, enabledAt: new Date().toISOString() }
            );
            appendEditLog(c, {
                ts: new Date().toISOString(), role: 'couple', roleName: c.fullName || 'Client',
                action: 'Enabled Seating Chart & Guest List add-on ($39.99)'
            });
            await writeClients(clients);

            /* ── Receipt email to client ── */
            const clientEmail = (c.email || '').trim();
            const clientName  = c.fullName || c.firstName || 'Client';
            const eventLabel  = (c.eventType || 'Event') + (c.eventDate ? ' — ' + c.eventDate : '');
            const receiptHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:36px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,serif;font-size:26px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:8px 0 0;color:#a3b18a;font-size:10px;letter-spacing:2px;text-transform:uppercase">Crafting Moments That Last Forever</p>
</td></tr>
<tr><td style="padding:36px 30px">
  <h2 style="margin:0 0 16px;color:#2d3a2d;font-family:Georgia,serif;font-size:20px;font-weight:400">Add-On Confirmed: Seating Chart &amp; Guest List</h2>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">Dear ${safe(clientName)},</p>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">Thank you for activating the <strong>Seating Chart &amp; Guest List</strong> add-on for your event. Your RNB Events planning team has been notified and will add this to your contract.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:4px;margin:0 0 24px">
    <tr><td style="padding:22px 24px">
      <p style="margin:0 0 14px;color:#527141;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600">Receipt</p>
      <table width="100%" cellpadding="4" cellspacing="0">
        <tr><td style="color:#666;font-size:12px;padding:5px 0;border-bottom:1px solid #e0dcd4">Client</td><td style="color:#2d3a2d;font-size:13px;font-weight:600;padding:5px 0;border-bottom:1px solid #e0dcd4;text-align:right">${safe(clientName)}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:5px 0;border-bottom:1px solid #e0dcd4">Event</td><td style="color:#2d3a2d;font-size:13px;padding:5px 0;border-bottom:1px solid #e0dcd4;text-align:right">${safe(eventLabel)}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:5px 0;border-bottom:1px solid #e0dcd4">Add-On</td><td style="color:#2d3a2d;font-size:13px;padding:5px 0;border-bottom:1px solid #e0dcd4;text-align:right">Seating Chart &amp; Guest List Management</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:5px 0;border-bottom:1px solid #e0dcd4">Date Activated</td><td style="color:#2d3a2d;font-size:13px;padding:5px 0;border-bottom:1px solid #e0dcd4;text-align:right">${fmtOrdinal(new Date())}</td></tr>
        <tr><td style="color:#666;font-size:13px;font-weight:600;padding:8px 0">Total</td><td style="color:#b89a5e;font-size:18px;font-weight:700;padding:8px 0;text-align:right">$39.99</td></tr>
      </table>
    </td></tr>
  </table>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">You can now access your Seating Chart &amp; Layout page in the <a href="https://rnbevents716.com/Client/seating-layout" style="color:#527141">Client Portal</a> to upload your floor plan and manage guest seating.</p>
  <p style="color:#888;font-size:12px;line-height:1.6;margin:0 0 6px">Questions? Contact us at <a href="mailto:info@rnbevents716.com" style="color:#527141">info@rnbevents716.com</a></p>
</td></tr>
<tr><td style="background:#2d3a2d;padding:20px 30px;text-align:center">
  <p style="margin:0 0 4px;color:#b89a5e;font-size:11px;letter-spacing:1px">RNB EVENTS PRODUCTION &amp; COORDINATION LLC</p>
  <p style="margin:0;color:#a3b18a;font-size:10px">rnbevents716.com &nbsp;&middot;&nbsp; info@rnbevents716.com</p>
</td></tr>
</table></td></tr></table></body></html>`;
            const receiptPlain = `Seating Chart & Guest List Add-On — Receipt\n\nDear ${safe(clientName)},\n\nYour Seating Chart & Guest List add-on has been activated.\n\nClient: ${safe(clientName)}\nEvent: ${safe(eventLabel)}\nAdd-On: Seating Chart & Guest List Management\nTotal: $39.99\nDate: ${fmtOrdinal(new Date())}\n\nYour RNB Events team has been notified and will add this to your contract.\n\nQuestions? info@rnbevents716.com`;

            /* Send to client */
            if (clientEmail) {
                try {
                    await ses.send(new SendEmailCommand({
                        Source: FROM_EMAIL,
                        Destination: { ToAddresses: [clientEmail] },
                        Message: {
                            Subject: { Data: 'Seating Chart & Guest List Add-On — Receipt ($39.99)' },
                            Body: { Html: { Data: receiptHtml }, Text: { Data: receiptPlain } }
                        }
                    }));
                } catch (e) { console.error('Seating receipt to client failed:', e.message); }
            }

            /* ── Admin notification ── */
            const adminHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:30px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:22px 28px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,serif;font-size:18px;font-weight:300;letter-spacing:2px">RNB EVENTS — Admin Notification</h1>
</td></tr>
<tr><td style="padding:26px 28px">
  <p style="color:#527141;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin:0 0 14px">&#9989; Seating Add-On Activated — Add to Contract</p>
  <table width="100%" cellpadding="4" cellspacing="0" style="background:#f5f2ec;border-radius:4px">
    <tr><td style="padding:8px 14px;color:#666;font-size:12px">Client</td><td style="padding:8px 14px;color:#2d3a2d;font-size:13px;font-weight:600;text-align:right">${safe(clientName)}</td></tr>
    <tr><td style="padding:4px 14px;color:#666;font-size:12px">Email</td><td style="padding:4px 14px;color:#2d3a2d;font-size:13px;text-align:right">${safe(clientEmail || '—')}</td></tr>
    <tr><td style="padding:4px 14px;color:#666;font-size:12px">Access Code</td><td style="padding:4px 14px;color:#2d3a2d;font-size:13px;text-align:right"><code>${safe(c.accessCode || '—')}</code></td></tr>
    <tr><td style="padding:4px 14px;color:#666;font-size:12px">Event</td><td style="padding:4px 14px;color:#2d3a2d;font-size:13px;text-align:right">${safe(eventLabel)}</td></tr>
    <tr><td style="padding:4px 14px 10px;color:#666;font-size:13px;font-weight:600">Fee</td><td style="padding:4px 14px 10px;color:#b89a5e;font-size:16px;font-weight:700;text-align:right">$39.99</td></tr>
  </table>
  <p style="color:#666;font-size:13px;margin:18px 0 0;line-height:1.6">&#128203; Please <strong>add the $39.99 Seating Chart &amp; Guest List add-on</strong> to ${safe(clientName)}'s contract.</p>
  <p style="color:#aaa;font-size:11px;margin:10px 0 0">Activated: ${new Date().toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'})} ET</p>
</td></tr>
</table></td></tr></table></body></html>`;

            try {
                await ses.send(new SendEmailCommand({
                    Source: FROM_EMAIL,
                    Destination: { ToAddresses: [RECOVERY_EMAIL] },
                    ReplyToAddresses: clientEmail ? [clientEmail] : [],
                    Message: {
                        Subject: { Data: `[ACTION REQUIRED] Seating Add-On — ${safe(clientName)} — Add $39.99 to contract` },
                        Body: { Html: { Data: adminHtml }, Text: { Data: `Seating Chart add-on activated by ${safe(clientName)} (${safe(c.accessCode || '')}). Add $39.99 to the contract.\n\nEvent: ${safe(eventLabel)}\nClient email: ${safe(clientEmail || '—')}\nActivated: ${new Date().toISOString()}` } }
                    }
                }));
            } catch (e) { console.error('Seating admin notification failed:', e.message); }

            return respond(200, { ok: true });
        }

        /* ── Admin: Resend fully-executed contract email ── */
        /* Re-generates the PDF and re-sends the fully-executed receipt
           to both the client and admin.  Used when the original email
           was silently dropped (PDF error, SES bounce, etc.). */
        if (path === '/resend-contract') {
            const { codeHash, adminCodeHash: submittedAdminHash } = body;
            if (!codeHash || typeof codeHash !== 'string') return respond(400, { ok: false, error: 'Missing codeHash' });

            /* Verify admin identity */
            const submittedHash = String(submittedAdminHash || '').toLowerCase().trim();
            if (!submittedHash || !/^[a-f0-9]{64}$/.test(submittedHash)) {
                return respond(401, { ok: false, error: 'Unauthorized' });
            }
            const adminDataForAuth = await readAdminData();
            const knownAdminHash = ((adminDataForAuth.adminCodeHash || '') || '47d538bc9bbdba86910d104f78b851d87356c7fcee36e214878a5a24f7bbedf4').toLowerCase();
            if (submittedHash !== knownAdminHash) return respond(401, { ok: false, error: 'Unauthorized' });

            const clients = await readClients();
            const idx = clients.findIndex(c => c.codeHash === codeHash);
            if (idx === -1) return respond(404, { ok: false, error: 'Client not found' });

            const c = clients[idx];
            const agr = c.agreement || {};
            if ((agr.status || '') !== 'fully-executed') {
                return respond(400, { ok: false, error: 'Agreement is not fully-executed' });
            }

            const clientName = c.fullName || c.firstName || 'Client';
            const clientEmail = (c.email || '').trim();
            const plannerReceiptEmail = (c.plannerEmail || '').trim() || RECOVERY_EMAIL;
            const plannerName = c.planner || 'RNB Events Team';

            /* Generate PDF */
            let contractPdfBuf = null;
            try {
                contractPdfBuf = await generateContractPDF({
                    clientName,
                    plannerName,
                    eventType:        c.eventType  || '',
                    eventDate:        c.eventDate  || '',
                    eventVenue:       c.eventVenue || '',
                    quotedAmount:     c.quotedAmount,
                    quotedDeposit:    c.quotedDeposit,
                    quotedPackage:    c.quotedPackage,
                    agreedAmount:     c.agreedAmount,
                    coupleSignature:  agr.coupleSignature  || '',
                    coupleSignedAt:   agr.coupleSignedAt   || '',
                    plannerSignature: agr.plannerSignature || '',
                    plannerSignedAt:  agr.plannerSignedAt  || ''
                });
            } catch (pdfErr) {
                console.error('Resend contract — PDF generation failed:', pdfErr);
            }

            const contractFilename = 'RNB_Events_Agreement_' + (clientName).replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';

            const makeResendHtml = (recipientName, extraNote) => `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:40px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:8px 0 0;color:#a3b18a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Crafting Moments That Last Forever</p>
</td></tr>
<tr><td style="padding:40px 30px">
  <h2 style="margin:0 0 20px;color:#2d3a2d;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400">Agreement Fully Executed — Copy Resent</h2>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">Dear ${String(recipientName).replace(/[<>"]/g, '')},</p>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">${String(extraNote).replace(/[<>"&]/g, ch => ({'<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;'}[ch]))}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:4px;margin:0 0 24px">
    <tr><td style="padding:24px">
      <p style="margin:0 0 12px;color:#527141;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600">Agreement Details</p>
      <table width="100%" cellpadding="4" cellspacing="0">
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Event</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(c.eventType || 'Event').replace(/[<>"]/g, '')}${c.eventDate ? ' \u2014 ' + fmtEventDate(c.eventDate) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Client</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${clientName.replace(/[<>"]/g, '')}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Client Signed</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(agr.coupleSignature || '').replace(/[<>"]/g, '')} on ${agr.coupleSignedAt ? fmtOrdinal(new Date(agr.coupleSignedAt)) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0;border-bottom:1px solid #e0dcd4">Vendor Signed</td><td style="color:#2d3a2d;font-size:13px;padding:4px 0;border-bottom:1px solid #e0dcd4;text-align:right">${(agr.plannerSignature || '').replace(/[<>"]/g, '')} on ${agr.plannerSignedAt ? fmtOrdinal(new Date(agr.plannerSignedAt)) : ''}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:4px 0">Status</td><td style="color:#527141;font-size:13px;font-weight:600;padding:4px 0;text-align:right">FULLY EXECUTED</td></tr>
      </table>
    </td></tr>
  </table>
  ${contractPdfBuf ? '<p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">The fully signed agreement is attached as a PDF for your records.</p>' : ''}
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">You can view the agreement at any time in the <a href="https://rnb716events.com/Client/documents.html" style="color:#527141">Client Portal</a>.</p>
  <p style="color:#888;font-size:12px;line-height:1.6;margin:0">If you have any questions, please reach out to your event planner.</p>
</td></tr>
<tr><td style="background:#2d3a2d;padding:24px 30px;text-align:center">
  <p style="margin:0 0 6px;color:#b89a5e;font-size:12px;letter-spacing:1px">RNB EVENTS</p>
  <p style="margin:0;color:#a3b18a;font-size:11px">www.rnbevents716.com</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

            let sentTo = [];

            /* Re-send to client */
            if (clientEmail) {
                const html  = makeResendHtml(clientName, 'This is a resent copy of your fully executed Events Production & Coordination Agreement. The fully signed agreement is attached as a PDF for your records.');
                const plain = `Dear ${clientName},\n\nThis is a resent copy of your fully executed Events Production & Coordination Agreement.\n\nClient Signed: ${agr.coupleSignature || ''} on ${agr.coupleSignedAt || ''}\nVendor Signed: ${agr.plannerSignature || ''} on ${agr.plannerSignedAt || ''}\n${contractPdfBuf ? '\nThe signed agreement PDF is attached.\n' : ''}\nView your agreement: https://rnb716events.com/Client/documents.html\n\n- RNB Events`;
                try {
                    if (contractPdfBuf) {
                        const raw = buildRawEmail(clientEmail.slice(0, 200), 'RNB Events \u2014 Your Agreement Has Been Fully Executed (Resent)', html, plain, contractPdfBuf, contractFilename);
                        await ses.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
                    } else {
                        await ses.send(new SendEmailCommand({
                            Source: FROM_EMAIL,
                            Destination: { ToAddresses: [clientEmail.slice(0, 200)] },
                            Message: { Subject: { Data: 'RNB Events \u2014 Your Agreement Has Been Fully Executed (Resent)' }, Body: { Html: { Data: html }, Text: { Data: plain } } }
                        }));
                    }
                    sentTo.push(clientEmail);
                } catch (e) { console.error('Resend contract to client failed:', e); }
            }

            /* Re-send to planner / admin inbox */
            {
                const html  = makeResendHtml(plannerName, `This is a resent copy of the fully executed agreement for <strong>${(c.fullName || c.firstName || 'Client').replace(/[<>"]/g, '')}</strong>.`);
                const plain = `Dear ${plannerName},\n\nThis is a resent copy of the fully executed agreement for ${clientName}.\n\nClient Signed: ${agr.coupleSignature || ''} on ${agr.coupleSignedAt || ''}\nVendor Signed: ${agr.plannerSignature || ''} on ${agr.plannerSignedAt || ''}\nEvent: ${c.eventType || ''}${c.eventDate ? ' \u2014 ' + fmtEventDate(c.eventDate) : ''}\n${contractPdfBuf ? '\nThe signed agreement PDF is attached.\n' : ''}\n- RNB Events`;
                try {
                    if (contractPdfBuf) {
                        const raw = buildRawEmail(plannerReceiptEmail.slice(0, 200), `RNB Events \u2014 Agreement Fully Executed (Resent): ${(c.fullName || c.firstName || 'Client').replace(/[<>"]/g, '')}`, html, plain, contractPdfBuf, contractFilename);
                        await ses.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
                    } else {
                        await ses.send(new SendEmailCommand({
                            Source: FROM_EMAIL,
                            Destination: { ToAddresses: [plannerReceiptEmail.slice(0, 200)] },
                            Message: { Subject: { Data: `RNB Events \u2014 Agreement Fully Executed (Resent): ${(c.fullName || c.firstName || 'Client').replace(/[<>"]/g, '')}` }, Body: { Html: { Data: html }, Text: { Data: plain } } }
                        }));
                    }
                    sentTo.push(plannerReceiptEmail);
                } catch (e) { console.error('Resend contract to planner failed:', e); }
            }

            appendEditLog(clients[idx], {
                ts: new Date().toISOString(), role: 'rnbTeam', roleName: 'Admin',
                action: 'Admin resent fully-executed contract emails to: ' + sentTo.join(', ')
            });
            await writeClients(clients);

            return respond(200, { ok: true, sentTo });
        }

        /* ── Client: Download fully-executed contract as PDF ── */
        /* Auth: client's own codeHash (couple, planner, or rnbTeam role).
           Returns base64-encoded PDF so the browser can trigger a direct download
           without a separate email — useful when the original email didn't arrive. */
        if (path === '/download-contract') {
            const { codeHash } = body;
            if (!codeHash || typeof codeHash !== 'string' || !/^[a-f0-9]{40,128}$/i.test(codeHash.trim())) {
                return respond(400, { ok: false, error: 'Invalid request' });
            }
            const dcClients = await readClients();
            const dcIdx = findClientByAnyHash(dcClients, codeHash.trim());
            if (dcIdx === -1) return respond(404, { ok: false, error: 'Client not found' });
            const dcClient = dcClients[dcIdx];
            const dcAgr = dcClient.agreement || {};
            if (dcAgr.status !== 'fully-executed') {
                return respond(400, { ok: false, error: 'Agreement is not fully executed yet' });
            }
            const dcClientName = dcClient.fullName || dcClient.firstName || 'Client';
            const dcPlannerName = dcClient.planner || 'RNB Events Team';
            let dcBuf = null;
            try {
                dcBuf = await generateContractPDF({
                    clientName:       dcClientName,
                    plannerName:      dcPlannerName,
                    eventType:        dcClient.eventType  || '',
                    eventDate:        dcClient.eventDate  || '',
                    eventVenue:       dcClient.eventVenue || '',
                    quotedAmount:     dcClient.quotedAmount,
                    quotedDeposit:    dcClient.quotedDeposit,
                    quotedPackage:    dcClient.quotedPackage,
                    agreedAmount:     dcClient.agreedAmount,
                    coupleSignature:  dcAgr.coupleSignature  || '',
                    coupleSignedAt:   dcAgr.coupleSignedAt   || '',
                    plannerSignature: dcAgr.plannerSignature || '',
                    plannerSignedAt:  dcAgr.plannerSignedAt  || ''
                });
            } catch (pdfErr) {
                console.error('download-contract PDF error:', pdfErr);
                return respond(500, { ok: false, error: 'PDF generation failed' });
            }
            const dcFilename = 'RNB_Events_Agreement_' + dcClientName.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
            return respond(200, { ok: true, pdfBase64: dcBuf.toString('base64'), filename: dcFilename });
        }

        /* ── Admin: Reset Seating Layout for a client ── */
        /* Allows admin to undo an accidental seating opt-in */
        if (path === '/admin-reset-seating') {
            const { codeHash } = body;
            if (!codeHash || typeof codeHash !== 'string') return respond(400, { ok: false, error: 'Missing codeHash' });

            const clients = await readClients();
            const idx = clients.findIndex(c => c.codeHash === codeHash);
            if (idx === -1) return respond(404, { ok: false, error: 'Client not found' });

            clients[idx].seatingLayout = { layoutImage: '', guestListEnabled: false, tables: [] };
            appendEditLog(clients[idx], {
                ts: new Date().toISOString(), role: 'rnbTeam', roleName: 'Admin',
                action: 'Admin reset seating chart & guest list add-on'
            });
            await writeClients(clients);
            return respond(200, { ok: true });
        }

        /* ── Square Invoices Proxy ── */
        if (path === '/get-square-invoices') {
            const { codeHash } = body;
            if (!codeHash || typeof codeHash !== 'string') return respond(400, { ok: false, error: 'Missing codeHash' });

            const clients = await readClients();
            const client = findClientByAnyHash(clients, codeHash);
            if (!client) return respond(404, { ok: false, error: 'Client not found' });

            const squareCustomerId  = client.squareCustomerId  || '';
            const squareProjectUrl  = client.squareProjectUrl  || '';

            if (!squareProjectUrl) return respond(200, { ok: true, invoices: [], squareProjectUrl: '' });

            /* Extract location_id from URL: ?currentUnitToken=XXXXXXXX */
            const locMatch = squareProjectUrl.match(/[?&]currentUnitToken=([A-Z0-9]+)/i);
            const locationId = locMatch ? locMatch[1] : (process.env.SQUARE_LOCATION_ID || '');

            const accessToken = process.env.SQUARE_ACCESS_TOKEN || '';
            if (!accessToken) return respond(200, { ok: true, invoices: [], squareProjectUrl, error: 'Square not configured' });

            try {
                const sqBody = JSON.stringify({
                    query: {
                        filter: {
                            location_ids: locationId ? [locationId] : [],
                            ...(squareCustomerId ? { customer_ids: [squareCustomerId] } : {})
                        }
                    },
                    limit: 50
                });

                const sqRes = await new Promise((resolve, reject) => {
                    const https = require('https');
                    const options = {
                        hostname: 'connect.squareup.com',
                        path:     '/v2/invoices/search',
                        method:   'POST',
                        headers: {
                            'Square-Version':  '2024-01-18',
                            'Authorization':   'Bearer ' + accessToken,
                            'Content-Type':    'application/json',
                            'Content-Length':  Buffer.byteLength(sqBody)
                        }
                    };
                    const req = https.request(options, res => {
                        let raw = '';
                        res.on('data', d => { raw += d; });
                        res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve({}); } });
                    });
                    req.on('error', reject);
                    req.write(sqBody);
                    req.end();
                });

                const rawInvoices = Array.isArray(sqRes.invoices) ? sqRes.invoices : [];
                const invoices = rawInvoices.map(inv => {
                    const payment = (inv.payment_requests || [])[0] || {};
                    const amtMoney = inv.total_money || payment.total_money || {};
                    const paidMoney = inv.amount_paid_money || {};
                    return {
                        id:             inv.id || '',
                        invoiceNumber:  inv.invoice_number || '',
                        status:         inv.status || '',
                        dueDate:        payment.due_date || '',
                        totalMoney:      amtMoney.amount != null ? amtMoney.amount : null,
                        amountPaidMoney: paidMoney.amount != null ? paidMoney.amount : null,
                        publicUrl:       inv.public_url || ''
                    };
                });

                return respond(200, { ok: true, invoices, squareProjectUrl });
            } catch (e) {
                console.error('Square API error:', e.message);
                return respond(200, { ok: true, invoices: [], squareProjectUrl, error: 'Square API unavailable' });
            }
        }

        /* ── Branded booking email via SES ──────────── */
        if (path === '/send-booking-email') {
            const { email, fullName, eventType, eventDate, accessCode, plannerCode, teamCode } = body;
            if (!email || typeof email !== 'string') return respond(400, { ok: false, error: 'Missing email' });

            const portalUrl = 'https://rnb716events.com/Client';
            const htmlBody = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">

<!-- Header -->
<tr><td style="background:#2d3a2d;padding:40px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:8px 0 0;color:#a3b18a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Crafting Moments That Last Forever</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px 30px">
  <h2 style="margin:0 0 20px;color:#2d3a2d;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400">Welcome, ${String(fullName).replace(/[<>"]/g, '')}!</h2>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 20px">We are thrilled to officially welcome you to the RNB Events family. Your${eventType ? ' <strong>' + String(eventType).replace(/[<>"]/g, '') + '</strong>' : ' event'}${eventDate ? ' on <strong>' + String(eventDate).replace(/[<>"]/g, '') + '</strong>' : ''} is going to be unforgettable.</p>
  <p style="color:#3d3d3d;font-size:14px;line-height:1.7;margin:0 0 24px">Your personalized client portal is ready. Use the access codes below to log in and start planning with your team.</p>

  <!-- Access Codes -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:4px;margin:0 0 24px">
    <tr><td style="padding:24px">
      <p style="margin:0 0 12px;color:#527141;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600">Your Access Codes</p>
      <table width="100%" cellpadding="6" cellspacing="0">
        <tr>
          <td style="color:#666;font-size:12px;letter-spacing:0.5px;padding:6px 0;border-bottom:1px solid #e0dcd4">COUPLE (Your Code)</td>
          <td style="color:#2d3a2d;font-size:16px;font-weight:600;font-family:monospace;padding:6px 0;border-bottom:1px solid #e0dcd4;text-align:right">${String(accessCode).replace(/[<>"]/g, '')}</td>
        </tr>
        ${plannerCode ? `<tr>
          <td style="color:#666;font-size:12px;letter-spacing:0.5px;padding:6px 0;border-bottom:1px solid #e0dcd4">PLANNER</td>
          <td style="color:#527141;font-size:16px;font-weight:600;font-family:monospace;padding:6px 0;border-bottom:1px solid #e0dcd4;text-align:right">${String(plannerCode).replace(/[<>"]/g, '')}</td>
        </tr>` : ''}
        ${teamCode ? `<tr>
          <td style="color:#666;font-size:12px;letter-spacing:0.5px;padding:6px 0">RNB TEAM</td>
          <td style="color:#2d3a2d;font-size:16px;font-weight:600;font-family:monospace;padding:6px 0;text-align:right">${String(teamCode).replace(/[<>"]/g, '')}</td>
        </tr>` : ''}
      </table>
    </td></tr>
  </table>

  <!-- CTA Button -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:10px 0 20px">
      <a href="${portalUrl}" style="display:inline-block;background:#527141;color:#fff;text-decoration:none;padding:14px 36px;border-radius:3px;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:500">ACCESS YOUR PORTAL</a>
    </td></tr>
  </table>

  <p style="color:#888;font-size:12px;line-height:1.6;margin:0">Keep these codes safe. Each code grants different access levels to your planning portal. Share the Planner code with your event coordinator only.</p>
</td></tr>

<!-- Footer -->
<tr><td style="background:#2d3a2d;padding:24px 30px;text-align:center">
  <p style="margin:0 0 6px;color:#b89a5e;font-size:12px;letter-spacing:1px">RNB EVENTS</p>
  <p style="margin:0;color:#a3b18a;font-size:11px">www.rnbevents716.com</p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

            const textBody = `Welcome, ${String(fullName)}!\n\nYour client portal is ready at ${portalUrl}\n\nAccess Codes:\n- Couple: ${accessCode}\n${plannerCode ? '- Planner: ' + plannerCode + '\n' : ''}${teamCode ? '- RNB Team: ' + teamCode + '\n' : ''}\nKeep these codes safe.\n\n- RNB Events\nwww.rnbevents716.com`;

            await ses.send(new SendEmailCommand({
                Source: FROM_EMAIL,
                Destination: { ToAddresses: [String(email).slice(0, 200)] },
                Message: {
                    Subject: { Data: 'Welcome to RNB Events - Your Client Portal Access' },
                    Body: {
                        Html: { Data: htmlBody },
                        Text: { Data: textBody }
                    }
                }
            }));

            return respond(200, { ok: true });
        }

        /* ── Client: upload image file ───────────────── */
        if (path === '/upload-file') {
            const { codeHash, fileName, contentType, data } = body;
            if (!codeHash || typeof codeHash !== 'string') return respond(400, { ok: false, error: 'Missing codeHash' });
            if (!data || typeof data !== 'string') return respond(400, { ok: false, error: 'Missing file data' });

            const ALLOWED_TYPES = {
                'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
                'application/pdf': 'pdf',
                'application/msword': 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
            };
            const ext = ALLOWED_TYPES[(contentType || '').toLowerCase()];
            if (!ext) return respond(400, { ok: false, error: 'Only images (JPEG/PNG/WebP/GIF) or documents (PDF/DOC/DOCX) are allowed.' });

            const buf = Buffer.from(data, 'base64');
            if (buf.length > 15 * 1024 * 1024) return respond(400, { ok: false, error: 'File exceeds 15 MB limit.' });

            const clients = await readClients();
            const idx = findClientByAnyHash(clients, codeHash);
            if (idx === -1) return respond(404, { ok: false, error: 'Client not found' });

            const safeName = String(fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '').slice(0, 80);
            const key = `client-uploads/${clients[idx].codeHash}/${Date.now()}-${safeName}.${ext}`;
            const mimeType = contentType.startsWith('image/') ? contentType : (ext === 'pdf' ? 'application/pdf' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword');

            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buf,
                ContentType: mimeType
            }));

            const fileUrl = `https://${BUCKET}.s3.us-east-2.amazonaws.com/${key}`;
            return respond(200, { ok: true, url: fileUrl });
        }

        /* ── Public quote request ─────────────────── */
        if (path === '/send-quote-request') {
            const { name, email, phone, location, eventType, eventDate, guestCount, budget, serviceScale, message } = body;
            if (!name  || typeof name  !== 'string') return respond(400, { ok: false, error: 'Name is required' });
            if (!email || typeof email !== 'string' || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
                return respond(400, { ok: false, error: 'A valid email address is required' });

            const safe = s => String(s || '').replace(/[<>"]/g, '').slice(0, 500);

            const htmlBody = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:36px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,serif;font-size:26px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:6px 0 0;color:#a3b18a;font-size:11px;letter-spacing:2px;text-transform:uppercase">New Quote Request</p>
</td></tr>
<tr><td style="padding:36px 30px">
  <h2 style="margin:0 0 6px;color:#2d3a2d;font-family:Georgia,serif;font-size:20px;font-weight:400">Quote Request from ${safe(name)}</h2>
  <p style="margin:0 0 24px;color:#888;font-size:12px">${safe(email)}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:4px;margin:0 0 24px">
    <tr><td style="padding:24px">
      <table width="100%" cellpadding="5" cellspacing="0">
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Name</td><td style="color:#2d3a2d;font-size:13px;font-weight:600;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${safe(name)}</td></tr>
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Email</td><td style="color:#2d3a2d;font-size:13px;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${safe(email)}</td></tr>
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Phone</td><td style="color:#2d3a2d;font-size:13px;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${safe(phone) || '—'}</td></tr>
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Location / City</td><td style="color:#2d3a2d;font-size:13px;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${safe(location) || '—'}</td></tr>
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Event Type</td><td style="color:#2d3a2d;font-size:13px;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${safe(eventType) || '—'}</td></tr>
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Event Date</td><td style="color:#2d3a2d;font-size:13px;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${fmtEventDate(String(eventDate || '')) || '—'}</td></tr>
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Guest Count</td><td style="color:#2d3a2d;font-size:13px;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${safe(guestCount) || '—'}</td></tr>
        <tr><td style="color:#666;font-size:12px;border-bottom:1px solid #e0dcd4;padding:8px 0">Budget Range</td><td style="color:#2d3a2d;font-size:13px;border-bottom:1px solid #e0dcd4;padding:8px 0;text-align:right">${safe(budget) || '—'}</td></tr>
        <tr><td style="color:#666;font-size:12px;padding:8px 0">Service Level</td><td style="color:#2d3a2d;font-size:13px;font-weight:600;padding:8px 0;text-align:right">${safe(serviceScale) || '—'}/10</td></tr>
      </table>
    </td></tr>
  </table>
  ${message ? `<p style="color:#666;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px">Message</p><p style="color:#3d3d3d;font-size:14px;line-height:1.7;background:#f9f7f4;padding:16px;border-radius:4px;margin:0 0 20px">${safe(message)}</p>` : ''}
  <p style="color:#888;font-size:12px">Received ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' })} ET</p>
</td></tr>
<tr><td style="background:#2d3a2d;padding:20px 30px;text-align:center">
  <p style="margin:0 0 4px;color:#a3b18a;font-size:11px">RNB Events Production &amp; Coordination LLC</p>
  <p style="margin:0;color:#527141;font-size:10px">info@rnbevents716.com &nbsp;&middot;&nbsp; rnbevents716.com</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

            /* Save lead first — must succeed before we do anything else */
            try {
                await createAdminProspect({
                    id:        'lead_' + Date.now(),
                    name:      safe(name),
                    email:     safe(email),
                    phone:     safe(phone) || '',
                    eventType: safe(eventType) || '',
                    eventDate: safe(eventDate) || '',
                    status:    'New Lead',
                    notes:     'Website quote request.' +
                               (budget      ? ' Budget: '        + safe(budget)       : '') +
                               (location    ? ' Location: '      + safe(location)     : '') +
                               (guestCount  ? ' Guests: '        + safe(guestCount)   : '') +
                               (serviceScale? ' Service Level: ' + safe(serviceScale) + '/10' : '') +
                               (message     ? ' Message: '       + safe(message)      : ''),
                    added:     new Date().toISOString().slice(0, 10)
                });
            } catch (saveErr) {
                console.error('CRITICAL: Failed to save prospect to S3:', saveErr);
                return respond(500, { ok: false, error: 'Failed to save your request. Please try again.' });
            }

            /* Send notification email — best effort; failure still returns 200 since lead is saved */
            try {
                await ses.send(new SendEmailCommand({
                    Source: FROM_EMAIL,
                    Destination: { ToAddresses: [RECOVERY_EMAIL] },
                    ReplyToAddresses: [String(email).slice(0, 200)],
                    /* BCC to info@ removed — that domain has no inbox and silently bounced */
                    Message: {
                        Subject: { Data: `Quote Request: ${safe(name)} — ${safe(eventType) || 'Event'}` },
                        Body: {
                            Html: { Data: htmlBody },
                            Text: { Data: `New Quote Request\n\nName: ${safe(name)}\nEmail: ${safe(email)}\nPhone: ${safe(phone)}\nLocation: ${safe(location)}\nEvent: ${safe(eventType)}\nDate: ${fmtEventDate(String(eventDate || '')) || safe(eventDate)}\nGuests: ${safe(guestCount)}\nBudget: ${safe(budget)}\nService Level: ${safe(serviceScale)}/10\n\nMessage:\n${safe(message)}` }
                        }
                    }
                }));
            } catch (sesErr) {
                console.error('Quote notification email failed (lead was still saved):', sesErr);
            }

            return respond(200, { ok: true });
        }

        /* ── Admin password reset via email ─────────── */
        if (path === '/send-reset-code') {
            const { action, code } = body;

            if (action === 'send') {
                const pin = String(Math.floor(100000 + Math.random() * 900000));
                const expiry = Date.now() + 10 * 60 * 1000; /* 10 min */
                await s3.send(new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: RESET_CODE_KEY,
                    Body: JSON.stringify({ code: pin, expiry }),
                    ContentType: 'application/json'
                }));

                await ses.send(new SendEmailCommand({
                    Source: FROM_EMAIL,
                    Destination: { ToAddresses: [RECOVERY_EMAIL] },
                    Message: {
                        Subject: { Data: 'RNB Events Admin - Password Reset Code' },
                        Body: {
                            Text: { Data: 'Your admin password reset code is: ' + pin + '\n\nThis code expires in 10 minutes.\n\nIf you did not request this, ignore this email.' }
                        }
                    }
                }));

                return respond(200, { ok: true });
            }

            if (action === 'verify') {
                if (!code || typeof code !== 'string') return respond(400, { ok: false, error: 'Missing code' });

                let stored;
                try {
                    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: RESET_CODE_KEY }));
                    stored = JSON.parse(await res.Body.transformToString());
                } catch (e) {
                    return respond(400, { ok: false, error: 'No reset code pending.' });
                }

                if (!stored || Date.now() > stored.expiry) {
                    return respond(400, { ok: false, error: 'Code expired. Request a new one.' });
                }
                if (code !== stored.code) {
                    return respond(400, { ok: false, error: 'Invalid code.' });
                }

                /* Clean up used code */
                try {
                    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: RESET_CODE_KEY }));
                } catch (e) {}

                return respond(200, { ok: true });
            }

            return respond(400, { ok: false, error: 'Invalid action' });
        }

        /* ── Analytics: log a page view to S3 ─────── */
        if (path === '/track-visit') {
            const VALID_SECTIONS = ['public', 'admin', 'client', 'prospect'];
            const VALID_TYPES    = ['page_view', 'click'];
            const section  = VALID_SECTIONS.includes(body.section) ? body.section : 'public';
            const entryType = VALID_TYPES.includes(body.type) ? body.type : 'page_view';

            /* Prefer X-Forwarded-For (real client IP behind CloudFront/API GW proxy);
               fall back to the Lambda Function URL sourceIp */
            const xffRaw = (event.headers && (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'])) || '';
            const sourceIp = xffRaw
                ? xffRaw.split(',')[0].trim()          /* first IP in XFF chain is the real client */
                : ((event.requestContext && event.requestContext.http)
                    ? (event.requestContext.http.sourceIp || '')
                    : '');

            const dateKey = new Date().toISOString().slice(0, 10);
            const s3Key   = `logs/visits-${dateKey}.ndjson`;

            /* Run geo lookup and S3 read in parallel */
            const [geo, existingContent] = await Promise.all([
                geoLookup(sourceIp),
                s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }))
                    .then(r => r.Body.transformToString())
                    .catch(() => '')
            ]);

            const entry = {
                ts:          new Date().toISOString(),
                section,
                type:        entryType,
                action:      entryType === 'click' ? String(body.action || '').slice(0, 100) : '',
                page:        String(body.page        || '').slice(0, 500),
                title:       String(body.title       || '').slice(0, 500),
                referrer:    String(body.referrer    || '').slice(0, 2000),
                utmSource:   String(body.utmSource   || '').slice(0, 200),
                utmMedium:   String(body.utmMedium   || '').slice(0, 200),
                utmCampaign: String(body.utmCampaign || '').slice(0, 200),
                utmTerm:     String(body.utmTerm     || '').slice(0, 500),
                sessionId:   String(body.sessionId   || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
                codeHash:    section === 'public' ? '' : String(body.codeHash || '').slice(0, 100),
                loadMs:      entryType === 'page_view' && Number.isFinite(body.loadMs) ? Math.round(body.loadMs) : null,
                city:        geo.city,
                country:     geo.country
            };

            await s3.send(new PutObjectCommand({
                Bucket: BUCKET, Key: s3Key,
                Body: existingContent + JSON.stringify(entry) + '\n',
                ContentType: 'application/x-ndjson',
                CacheControl: 'no-cache, no-store, must-revalidate'
            }));

            return respond(200, { ok: true });
        }

        /* ── Admin: send package quote to prospect ────── */
        if (path === '/send-quote-email') {
            const { name, email, eventType, eventDate, package: pkg, lineItems, estimatedAmount, customNote, customFeatures,
                    discountPct, discountAmt, laborProduction, taxAmt, deposit, grandTotal: clientGrandTotal } = body;
            if (!name  || typeof name  !== 'string') return respond(400, { ok: false, error: 'Name is required' });
            if (!email || typeof email !== 'string' || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
                return respond(400, { ok: false, error: 'A valid email address is required' });

            const VALID_PACKAGES = ['Silver', 'Gold', 'Platinum', 'Presidential'];
            const safePkg = VALID_PACKAGES.includes(pkg) ? pkg : 'Silver';
            const safe    = s => String(s || '').replace(/[<>"']/g, '').slice(0, 500);
            const safeAmt = v => { const n = parseFloat(v); return (!isNaN(n) && n > 0) ? n : null; };

            const PACKAGES = {
                Silver:      { tagline: 'Essentials Package',    color: '#7a8fa6', desc: 'Perfect for intimate gatherings and smaller celebrations. Covers the core elements of event coordination so your day runs smoothly.' },
                Gold:        { tagline: 'Full-Service Package',  color: '#b89a5e', desc: 'Our most popular package — comprehensive planning and coordination from first meeting to final farewell, with hands-on support every step of the way.' },
                Platinum:    { tagline: 'Premium Experience',    color: '#557a55', desc: 'An elevated, white-glove planning experience for clients who want every detail curated to perfection. We handle everything — you simply celebrate.' },
                Presidential:{ tagline: 'Ultra-Luxury Package',  color: '#2d3a2d', desc: 'The pinnacle of the RNB Events experience. Reserved for the most discerning clients — a fully bespoke, end-to-end luxury event production with no detail overlooked.' }
            };

            const p = PACKAGES[safePkg];

            /* ── Build line items ─────────────────────────── */
            /* Accept new lineItems array; fall back to legacy customFeatures list */
            let items = [];
            let grandTotal = 0;

            if (Array.isArray(lineItems) && lineItems.length > 0) {
                items = lineItems.slice(0, 50).map(item => ({
                    description: String(item.description || '').replace(/[<>"]/g, '').slice(0, 300),
                    qty:   Math.max(0, parseFloat(item.qty)   || 1),
                    price: parseFloat(item.price) || 0
                })).filter(item => item.description.trim());
                grandTotal = items.reduce((sum, item) => sum + (item.qty * item.price), 0);
            } else if (Array.isArray(customFeatures) && customFeatures.length > 0) {
                /* Legacy: plain text feature list (no pricing) */
                items = customFeatures.slice(0, 50).map(f => ({
                    description: String(f).replace(/[<>"]/g, '').slice(0, 300),
                    qty: null, price: null
                })).filter(item => item.description.trim());
                /* Legacy estimatedAmount */
                grandTotal = safeAmt(estimatedAmount) || 0;
            }

            /* New breakdown fields (sent from admin quote builder) */
            const hasBreakdown = clientGrandTotal != null && (discountPct != null || laborProduction != null || taxAmt != null);
            const safeNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
            const bDiscountPct     = safeNum(discountPct);
            const bDiscountAmt     = safeNum(discountAmt);
            const bLaborProduction = safeNum(laborProduction);
            const bTaxAmt          = safeNum(taxAmt);
            const bDeposit         = safeNum(deposit);
            const bGrandTotal      = hasBreakdown ? safeNum(clientGrandTotal) : grandTotal;
            const fmtUSD = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            /* Recompute items-only subtotal for breakdown display */
            const bItemsSubtotal = items.reduce((sum, item) => sum + (item.qty || 1) * (item.price || 0), 0);

            /* ── Invoice line items HTML ─────────────────── */
            const hasLinePrices = items.some(item => item.price !== null && item.price > 0);

            const lineItemsHtml = items.map(item => {
                if (item.qty === null) {
                    /* Legacy text-only row */
                    return `<tr>
                      <td colspan="4" style="padding:8px 0;font-size:13px;color:#3d3d3d;border-bottom:1px solid #f0ece6">&#10003;&nbsp; ${item.description}</td>
                    </tr>`;
                }
                const sub = item.qty * item.price;
                return `<tr>
                  <td style="padding:9px 0;font-size:13px;color:#3d3d3d;border-bottom:1px solid #f0ece6">${item.description}</td>
                  <td style="padding:9px 8px;font-size:13px;color:#555;text-align:center;border-bottom:1px solid #f0ece6">${item.qty}</td>
                  <td style="padding:9px 0;font-size:13px;color:#555;text-align:right;border-bottom:1px solid #f0ece6">${item.price > 0 ? fmtUSD(item.price) : '—'}</td>
                  <td style="padding:9px 0;font-size:13px;color:#2d3a2d;font-weight:600;text-align:right;border-bottom:1px solid #f0ece6">${sub > 0 ? fmtUSD(sub) : '—'}</td>
                </tr>`;
            }).join('');

            const lineItemsHeaderHtml = hasLinePrices ? `
              <tr style="background:#f5f2ec">
                <th style="padding:8px 0;font-size:10px;letter-spacing:1.5px;color:#527141;text-transform:uppercase;font-weight:600;text-align:left;border-bottom:2px solid #2d3a2d">Description</th>
                <th style="padding:8px 8px;font-size:10px;letter-spacing:1.5px;color:#527141;text-transform:uppercase;font-weight:600;text-align:center;border-bottom:2px solid #2d3a2d">Qty</th>
                <th style="padding:8px 0;font-size:10px;letter-spacing:1.5px;color:#527141;text-transform:uppercase;font-weight:600;text-align:right;border-bottom:2px solid #2d3a2d">Unit Price</th>
                <th style="padding:8px 0;font-size:10px;letter-spacing:1.5px;color:#527141;text-transform:uppercase;font-weight:600;text-align:right;border-bottom:2px solid #2d3a2d">Amount</th>
              </tr>` : '';

            /* Breakdown rows (new format) or simple total row (legacy) */
            const totalRowHtml = hasBreakdown ? `
              <tr><td colspan="4" style="padding:0"><table width="100%" cellpadding="0" cellspacing="0">
                <tr><td colspan="2" style="border-top:1px solid #e0dcd4;padding-top:8px"></td></tr>
                ${bItemsSubtotal > 0 ? `<tr>
                  <td style="padding:5px 0;font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase">Items Subtotal</td>
                  <td style="padding:5px 0;font-size:12px;color:#555;text-align:right">${fmtUSD(bItemsSubtotal)}</td>
                </tr>` : ''}
                ${bDiscountPct > 0 ? `<tr>
                  <td style="padding:5px 0;font-size:11px;color:#c0392b;letter-spacing:1px">Family &amp; Friends Discount (${bDiscountPct}%)</td>
                  <td style="padding:5px 0;font-size:12px;color:#c0392b;text-align:right">-${fmtUSD(bDiscountAmt)}</td>
                </tr>` : ''}
                ${bLaborProduction > 0 ? `<tr>
                  <td style="padding:5px 0;font-size:11px;color:#3d3d3d;letter-spacing:0.5px">Labor Production <span style="font-size:9px;color:#888">(labor, setup &amp; teardown)</span></td>
                  <td style="padding:5px 0;font-size:12px;color:#3d3d3d;text-align:right">${fmtUSD(bLaborProduction)}</td>
                </tr>` : ''}
                ${bTaxAmt > 0 ? `<tr>
                  <td style="padding:5px 0;font-size:11px;color:#888;letter-spacing:0.5px">Texas Sales Tax (8.25%) — non-modifiable</td>
                  <td style="padding:5px 0;font-size:12px;color:#888;text-align:right">${fmtUSD(bTaxAmt)}</td>
                </tr>` : ''}
                ${bDeposit > 0 ? `<tr>
                  <td style="padding:5px 0;font-size:11px;color:#527141;letter-spacing:1px">Required Deposit</td>
                  <td style="padding:5px 0;font-size:12px;color:#527141;text-align:right">${fmtUSD(bDeposit)}</td>
                </tr>` : ''}
                <tr><td colspan="2" style="border-top:2px solid #2d3a2d;padding-top:10px"></td></tr>
                <tr>
                  <td style="padding:4px 0;font-size:11px;letter-spacing:1.5px;color:#2d3a2d;text-transform:uppercase;font-weight:600">Grand Total</td>
                  <td style="padding:4px 0;text-align:right">
                    <span style="font-family:Georgia,serif;font-size:24px;color:#b89a5e;font-weight:400">${fmtUSD(bGrandTotal)}</span>
                  </td>
                </tr>
              </table></td></tr>` :
              (grandTotal > 0 ? `<tr>
                <td colspan="${hasLinePrices ? '3' : '4'}" style="padding:14px 0 6px;text-align:right;font-size:11px;letter-spacing:1.5px;color:#888;text-transform:uppercase">Estimated Total</td>
                ${hasLinePrices ? `<td style="padding:14px 0 6px;text-align:right">
                  <span style="font-family:Georgia,serif;font-size:22px;color:#b89a5e;font-weight:400">${fmtUSD(grandTotal)}</span>
                </td>` : ''}
              </tr>` : '');

            /* Use breakdown grand total if present */
            if (hasBreakdown) grandTotal = bGrandTotal;

            /* Personal note block */
            const safeNote = customNote ? String(customNote).replace(/[<>"]/g, '').slice(0, 800) : '';
            const noteHtml = safeNote ? `
  <!-- Personal Note -->
  <tr><td style="padding:0 36px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-left:3px solid #b89a5e;border-radius:0 4px 4px 0">
      <tr><td style="padding:16px 20px">
        <p style="margin:0 0 6px;color:#888;font-size:10px;letter-spacing:2px;text-transform:uppercase">A Note From Our Team</p>
        <p style="margin:0;color:#3d3d3d;font-size:13px;line-height:1.8">${safeNote}</p>
      </td></tr>
    </table>
  </td></tr>` : '';

            const quoteHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07)">

  <!-- Header with logo -->
  <tr><td style="background:#2d3a2d;padding:32px 36px;text-align:center">
    <img src="https://rnbevents716.com/RNB%20Logo%20Olive.png" alt="RNB Events" width="120" style="display:block;margin:0 auto 12px;max-width:120px">
    <h1 style="margin:0 0 4px;color:#b89a5e;font-family:Georgia,serif;font-size:26px;font-weight:300;letter-spacing:4px">RNB EVENTS</h1>
    <p style="margin:0;color:#a3b18a;font-size:11px;letter-spacing:3px;text-transform:uppercase">Events Production &amp; Coordination LLC</p>
  </td></tr>

  <!-- Quote label + ref -->
  <tr><td style="padding:28px 36px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <p style="margin:0 0 2px;color:#527141;font-size:10px;letter-spacing:2px;text-transform:uppercase">Personalized Quote</p>
          <h2 style="margin:0;color:#2d3a2d;font-family:Georgia,serif;font-size:22px;font-weight:400">Hello, ${safe(name)}</h2>
        </td>
        <td style="text-align:right;vertical-align:top">
          <p style="margin:0 0 2px;color:#888;font-size:10px;letter-spacing:1px;text-transform:uppercase">Date</p>
          <p style="margin:0;color:#2d3a2d;font-size:12px">${fmtOrdinal(new Date())}</p>
        </td>
      </tr>
    </table>
    <p style="margin:14px 0 0;color:#555;font-size:13px;line-height:1.8">Thank you for your interest in RNB Events. Based on your ${safe(eventType) || 'event'}${eventDate ? ' on <strong>' + fmtEventDate(String(eventDate)) + '</strong>' : ''}, we&rsquo;re excited to present the following package proposal.</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:20px 36px 0"><hr style="border:none;border-top:1px solid #e8e2d9;margin:0"></td></tr>

  <!-- Package badge -->
  <tr><td style="padding:20px 36px 0">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:${p.color};padding:6px 16px;border-radius:20px">
          <span style="color:#fff;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif">${safePkg} — ${p.tagline}</span>
        </td>
      </tr>
    </table>
    <p style="margin:10px 0 0;color:#3d3d3d;font-size:13px;line-height:1.8">${p.desc}</p>
  </td></tr>

  <!-- Line Items -->
  <tr><td style="padding:20px 36px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${lineItemsHeaderHtml}
      ${lineItemsHtml}
      ${totalRowHtml}
    </table>
  </td></tr>

  <tr><td style="padding:6px 36px 0"><hr style="border:none;border-top:1px solid #e8e2d9;margin:0"></td></tr>

  ${noteHtml}

  <!-- Disclaimer -->
  <tr><td style="padding:20px 36px">
    <p style="margin:0;color:#aaa;font-size:11px;line-height:1.7;font-style:italic">* All estimates are based on preliminary planning details and are subject to review during your consultation. Final pricing will be confirmed in your event agreement.</p>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 36px 32px;text-align:center">
    <p style="margin:0 0 20px;color:#555;font-size:13px;line-height:1.8">Ready to move forward or have questions? We&rsquo;d love to connect. Reply to this email or reach us directly:</p>
    <a href="mailto:info@rnbevents716.com" style="display:inline-block;background:#2d3a2d;color:#b89a5e;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;padding:14px 32px;border-radius:3px;text-decoration:none">REPLY TO THIS QUOTE</a>
    <p style="margin:20px 0 0;color:#888;font-size:11px">Or visit us at <a href="https://rnbevents716.com" style="color:#527141">rnbevents716.com</a></p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#2d3a2d;padding:24px 36px;text-align:center">
    <p style="margin:0 0 4px;color:#a3b18a;font-size:11px;letter-spacing:1px">RNB Events Production &amp; Coordination LLC</p>
    <p style="margin:0 0 6px;color:#527141;font-size:10px">info@rnbevents716.com &nbsp;&middot;&nbsp; rnbevents716.com</p>
    <p style="margin:0;color:#527141;font-size:9px">A product of RNB Events &nbsp;&middot;&nbsp; Powered by <a href="https://ynk-techusa.com" style="color:#a3b18a;text-decoration:none">ynk-techusa.com</a></p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

            const plainLines = items.map(item =>
                item.qty !== null
                    ? `  ${item.description}${item.qty !== 1 ? ' (x'+item.qty+')' : ''}${item.price > 0 ? ' — $'+(item.qty*item.price).toFixed(2) : ''}`
                    : `  • ${item.description}`
            ).join('\n');
            const plainTotal = grandTotal > 0 ? `\nEstimated Total: $${grandTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}\n` : '';
            const plainNote  = safeNote ? `\nNote from our team:\n${safeNote}\n` : '';

            const plainText = `Hello ${safe(name)},\n\nThank you for your interest in RNB Events!\n\n${safePkg} — ${p.tagline}\n${p.desc}\n\n${plainLines}${plainTotal}${plainNote}\nReady to move forward? Reply to this email or visit rnbevents716.com.\n\n— RNB Events Team\nrnbevents716@gmail.com`;

            /* ── Generate PDF ─────────────────────────────── */
            const pdfBuf = await generateQuotePDF({
                name: safe(name),
                pkg:  safePkg,
                pkgData: p,
                items,
                grandTotal:      bGrandTotal,
                itemsSubtotal:   bItemsSubtotal,
                discountPct:     hasBreakdown ? bDiscountPct      : 0,
                discountAmt:     hasBreakdown ? bDiscountAmt      : 0,
                laborProduction: hasBreakdown ? bLaborProduction  : 0,
                taxAmt:          hasBreakdown ? bTaxAmt           : 0,
                deposit:         hasBreakdown ? bDeposit          : 0,
                customNote: safeNote,
                eventType:  safe(eventType),
                eventDate:  safe(eventDate)
            });

            /* ── Save PDF to S3 (backup + admin download) ──── */
            const quoteKey = `quotes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
            try {
                await s3.send(new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: quoteKey,
                    Body: pdfBuf,
                    ContentType: 'application/pdf'
                }));
            } catch (s3Err) {
                console.error('S3 quote save failed:', s3Err.message);
            }

            /* ── Send PDF quote to client ─────────────────── */
            const pdfFilename = `RNB-Events-${safePkg}-Quote.pdf`;
            const clientSubject = `Your RNB Events ${safePkg} Package Quote`;
            let clientEmailSent = false;
            let clientSendError = '';
            try {
                /* No BCC here — admin always gets a dedicated copy below */
                const rawMsg = buildRawEmail(
                    String(email).slice(0, 200),
                    clientSubject,
                    quoteHtml,
                    plainText,
                    pdfBuf,
                    pdfFilename
                );
                await ses.send(new SendRawEmailCommand({ RawMessage: { Data: rawMsg } }));
                clientEmailSent = true;
            } catch (sesErr) {
                clientSendError = sesErr.message || String(sesErr);
                console.error('SES client quote send failed:', clientSendError);
            }

            /* ── Always send dedicated admin copy (guaranteed — not BCC) ── */
            /* BCC on the client email used to go to info@rnbevents716.com which has
               no inbox. This separate send to the Gmail account is the reliable copy. */
            try {
                const totalFmt = grandTotal > 0 ? `$${grandTotal.toLocaleString('en-US',{minimumFractionDigits:2})}` : 'N/A';
                const clientAddr = String(email).slice(0, 200);
                const statusLine = clientEmailSent
                    ? `<p style="color:#527141;font-weight:600;font-size:13px">&#10003; Quote successfully delivered to <strong>${clientAddr}</strong></p>`
                    : `<p style="color:#c0392b;font-weight:600;font-size:13px">&#9888; Delivery to <strong>${clientAddr}</strong> failed — please open the PDF below and forward it manually.<br><small style="font-weight:400;color:#888">${clientSendError}</small></p>`;
                const adminCopyHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:30px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:24px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:6px 0 0;color:#a3b18a;font-size:10px;letter-spacing:2px;text-transform:uppercase">Admin Quote Copy</p>
</td></tr>
<tr><td style="padding:28px 30px">
  ${statusLine}
  <table width="100%" cellpadding="5" cellspacing="0" style="background:#f5f2ec;border-radius:4px;margin:16px 0">
    <tr><td style="padding:12px 16px 4px"><strong style="font-size:11px;color:#527141;letter-spacing:1.5px;text-transform:uppercase">Quote Summary</strong></td></tr>
    <tr><td style="padding:4px 16px;color:#666;font-size:12px">Client</td><td style="padding:4px 16px;color:#2d3a2d;font-size:13px;font-weight:600;text-align:right">${safe(name)}</td></tr>
    <tr><td style="padding:4px 16px;color:#666;font-size:12px">Email</td><td style="padding:4px 16px;color:#2d3a2d;font-size:13px;text-align:right">${clientAddr}</td></tr>
    <tr><td style="padding:4px 16px;color:#666;font-size:12px">Package</td><td style="padding:4px 16px;color:#2d3a2d;font-size:13px;text-align:right">${safePkg}</td></tr>
    <tr><td style="padding:4px 16px;color:#666;font-size:12px">Event</td><td style="padding:4px 16px;color:#2d3a2d;font-size:13px;text-align:right">${safe(eventType) || '—'}${eventDate ? ' \u2014 ' + fmtEventDate(String(eventDate)) : ''}</td></tr>
    <tr><td style="padding:4px 16px 12px;color:#666;font-size:12px">Total</td><td style="padding:4px 16px 12px;color:#b89a5e;font-size:15px;font-weight:600;text-align:right">${totalFmt}</td></tr>
  </table>
  <p style="color:#888;font-size:11px;margin:0">Sent ${new Date().toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'})} ET</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
                const adminCopyPlain = `[QUOTE COPY] ${safe(name)} — ${safePkg} — ${totalFmt}\n\n${clientEmailSent ? 'Delivered to: ' + clientAddr : 'DELIVERY FAILED to: ' + clientAddr + '\nError: ' + clientSendError + '\nPlease forward the attached PDF manually.'}\n\nEvent: ${safe(eventType) || '—'}${eventDate ? ' — ' + fmtEventDate(String(eventDate)) : ''}\nSent: ${new Date().toISOString()}`;
                const adminCopyRaw = buildRawEmail(RECOVERY_EMAIL, `[QUOTE COPY] ${safe(name)} — ${safePkg} ${grandTotal > 0 ? '— $'+grandTotal.toLocaleString('en-US',{minimumFractionDigits:2}) : ''}`, adminCopyHtml, adminCopyPlain, pdfBuf, pdfFilename);
                await ses.send(new SendRawEmailCommand({ RawMessage: { Data: adminCopyRaw } }));
            } catch (adminCopyErr) {
                console.error('Admin quote copy email failed:', adminCopyErr.message);
            }

            return respond(200, { ok: true, clientDelivered: clientEmailSent });
        }

        /* ── Post-event task runner ────────────────────── */
        if (path === '/run-post-event-tasks') {
            let clientsRaw = await readClients();
            const clients  = Array.isArray(clientsRaw) ? clientsRaw : (Array.isArray(clientsRaw && clientsRaw.clients) ? clientsRaw.clients : []);
            const now          = new Date();
            const TWO_DAYS_MS  = 2 * 24 * 60 * 60 * 1000;
            const processed    = [];

            function parseDDMMYYYY(str) {
                const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || ''));
                if (!m) return null;
                return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
            }

            const thankYouHtml = (clientName, eventType, eventDate, recipientType) => `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
<tr><td style="background:#2d3a2d;padding:40px 30px;text-align:center">
  <h1 style="margin:0;color:#b89a5e;font-family:Georgia,serif;font-size:28px;font-weight:300;letter-spacing:3px">RNB EVENTS</h1>
  <p style="margin:8px 0 0;color:#a3b18a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Crafting Moments That Last Forever</p>
</td></tr>
<tr><td style="padding:40px 30px;text-align:center">
  <h2 style="margin:0 0 14px;color:#2d3a2d;font-family:Georgia,serif;font-size:26px;font-weight:400">Thank You!</h2>
  <p style="color:#3d3d3d;font-size:15px;line-height:1.8;margin:0 0 20px">Dear ${clientName.replace(/[<>"]/g, '')},</p>
  ${recipientType === 'client'
    ? `<p style="color:#3d3d3d;font-size:14px;line-height:1.8;margin:0 0 24px">We are so honored to have been a part of your <strong>${(eventType || 'event').replace(/[<>"]/g, '')}</strong>${eventDate ? ' on <strong>' + fmtEventDate(eventDate) + '</strong>' : ''}. It was a privilege to help bring your vision to life, and we hope every detail exceeded your expectations.</p><p style="color:#3d3d3d;font-size:14px;line-height:1.8;margin:0 0 24px">We would love to hear about your experience. If you have a moment, please consider leaving us a review &mdash; it means the world to us and helps us continue crafting unforgettable moments for others.</p>` 
    : `<p style="color:#3d3d3d;font-size:14px;line-height:1.8;margin:0 0 24px">Thank you for your partnership on the <strong>${(eventType || 'event').replace(/[<>"]/g, '')}</strong>${eventDate ? ' on <strong>' + fmtEventDate(eventDate) + '</strong>' : ''}. Your professionalism and collaboration made this event a success, and we deeply appreciate working alongside you.</p>` }
  <div style="margin:28px auto;width:60px;height:2px;background:#b89a5e"></div>
  <p style="color:#527141;font-size:13px;line-height:1.7;margin:0 0 8px">From all of us at RNB Events,</p>
  <p style="color:#2d3a2d;font-size:15px;font-family:Georgia,serif;font-weight:400;margin:0">Thank you for choosing RNB Events.</p>
</td></tr>
<tr><td style="background:#2d3a2d;padding:24px 30px;text-align:center">
  <p style="margin:0 0 6px;color:#b89a5e;font-size:12px;letter-spacing:1px">RNB EVENTS</p>
  <p style="margin:0;color:#a3b18a;font-size:11px">www.rnbevents716.com</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

            for (const c of clients) {
                if (c.archived) continue;
                if (!c.eventDate) continue;
                const ed = parseDDMMYYYY(c.eventDate);
                if (!ed) continue;
                const msSinceEvent = now - ed;
                if (msSinceEvent < TWO_DAYS_MS) continue;

                const clientName = c.fullName || c.firstName || 'Valued Client';

                /* Send thank-you to client */
                if (c.email) {
                    try {
                        await ses.send(new SendEmailCommand({
                            Source: FROM_EMAIL,
                            Destination: { ToAddresses: [c.email.slice(0, 200)] },
                            Message: {
                                Subject: { Data: 'Thank You for Choosing RNB Events!' },
                                Body: {
                                    Html: { Data: thankYouHtml(clientName, c.eventType, c.eventDate, 'client') },
                                    Text: { Data: `Dear ${clientName},\n\nThank you so much for choosing RNB Events for your ${c.eventType || 'event'}. It was an honor to help bring your vision to life.\n\nWe hope every detail exceeded your expectations. We would love to hear about your experience!\n\nWith gratitude,\nRNB Events\nwww.rnbevents716.com` }
                                }
                            }
                        }));
                    } catch (e) { console.error('Post-event client email error:', e); }
                }

                /* Send thank-you to planner */
                const plannerEmail = (c.plannerEmail || '').trim();
                if (plannerEmail) {
                    const plannerName = c.planner || 'Team';
                    try {
                        await ses.send(new SendEmailCommand({
                            Source: FROM_EMAIL,
                            Destination: { ToAddresses: [plannerEmail.slice(0, 200)] },
                            Message: {
                                Subject: { Data: `Thank You for Your Partnership — ${(c.eventType || 'Event').replace(/[<>"]/g, '')} for ${clientName.replace(/[<>"]/g, '')}` },
                                Body: {
                                    Html: { Data: thankYouHtml(plannerName, c.eventType, c.eventDate, 'planner') },
                                    Text: { Data: `Dear ${plannerName},\n\nThank you for your partnership on the ${c.eventType || 'event'} for ${clientName}. Your collaboration made it a success.\n\nWith gratitude,\nRNB Events\nwww.rnbevents716.com` }
                                }
                            }
                        }));
                    } catch (e) { console.error('Post-event planner email error:', e); }
                }

                /* Archive and disable */
                c.active     = false;
                c.archived   = true;
                c.archivedAt = now.toISOString();
                appendEditLog(c, { ts: now.toISOString(), role: 'rnbTeam', roleName: 'RNB Events (Auto)', action: 'Client archived after event date — thank-you emails sent' });
                processed.push({ id: c.id, name: clientName });
            }

            if (processed.length) await writeClients(clients);
            return respond(200, { ok: true, processed });
        }

        /* ── Admin activity log ──────────────────────── */
        if (path === '/log-admin-activity') {
            const { entries } = body;
            if (!Array.isArray(entries) || !entries.length) return respond(400, { ok: false, error: 'Missing entries' });
            const adminData = await readAdminData();
            if (!adminData.activityLog) adminData.activityLog = [];
            const now = new Date().toISOString();
            entries.forEach(function (e) {
                adminData.activityLog.push({
                    ts:      now,
                    action:  String(e.action  || '').slice(0, 200),
                    details: String(e.details || '').slice(0, 500)
                });
            });
            /* Keep last 500 log entries */
            adminData.activityLog = adminData.activityLog.slice(-500);
            await writeAdminData(adminData);
            return respond(200, { ok: true });
        }

        /* ── Admin analytics stats ──────────────────────────── */
        if (path === '/get-stats') {
            /* Verify admin hash against stored or fallback hash */
            const submittedHash = String(body.codeHash || '').toLowerCase().trim();
            if (!submittedHash || !/^[a-f0-9]{64}$/.test(submittedHash)) {
                return respond(401, { ok: false, error: 'Unauthorized' });
            }
            const adminData = await readAdminData();
            const knownHash = ((adminData.adminCodeHash || '') || '47d538bc9bbdba86910d104f78b851d87356c7fcee36e214878a5a24f7bbedf4').toLowerCase();
            if (submittedHash !== knownHash) {
                return respond(401, { ok: false, error: 'Unauthorized' });
            }

            const days = Math.min(Math.max(parseInt(body.days) || 30, 1), 90);
            const dateKeys = [];
            // Always fetch at least 2 UTC days so todayViews (last 24h) is accurate
            // when the UTC date has rolled past midnight (e.g. it's 9pm Eastern Time).
            const fetchDays = Math.max(days, 2);
            for (let i = 0; i < fetchDays; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                dateKeys.push(d.toISOString().slice(0, 10));
            }

            const files = await Promise.all(
                dateKeys.map(dateKey =>
                    s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `logs/visits-${dateKey}.ndjson` }))
                        .then(r => r.Body.transformToString())
                        .then(text => ({ dateKey, text }))
                        .catch(() => ({ dateKey, text: '' }))
                )
            );

            const allEntries = [];
            files.forEach(({ text }) => {
                if (!text) return;
                text.split('\n').forEach(line => {
                    line = line.trim();
                    if (!line) return;
                    try { allEntries.push(JSON.parse(line)); } catch (e) {}
                });
            });

            // Range-scoped: only include entries within the user-selected `days` window
            // (allEntries may contain one extra UTC day fetched for todayViews accuracy)
            const rangeStart = new Date();
            rangeStart.setDate(rangeStart.getDate() - (days - 1));
            rangeStart.setUTCHours(0, 0, 0, 0);
            const rangeStartISO = rangeStart.toISOString();
            const pageViews = allEntries.filter(e => e.type === 'page_view' && (e.ts || '') >= rangeStartISO);
            const clicks    = allEntries.filter(e => e.type === 'click'     && (e.ts || '') >= rangeStartISO);

            /* By date */
            const byDateMap = {};
            pageViews.forEach(e => {
                const d = (e.ts || '').slice(0, 10);
                byDateMap[d] = (byDateMap[d] || 0) + 1;
            });

            /* By section */
            const bySection = {};
            pageViews.forEach(e => {
                const s = e.section || 'unknown';
                bySection[s] = (bySection[s] || 0) + 1;
            });

            /* Top pages (strip query strings) */
            const byPageMap = {};
            pageViews.forEach(e => {
                let pg = (e.page || 'unknown');
                try { pg = new URL(pg).pathname; } catch (err) { pg = pg.split('?')[0]; }
                byPageMap[pg] = (byPageMap[pg] || 0) + 1;
            });
            const topPages = Object.entries(byPageMap)
                .sort((a, b) => b[1] - a[1]).slice(0, 15)
                .map(([page, count]) => ({ page, count }));

            /* UTM sources */
            const bySourceMap = {};
            [...pageViews, ...clicks].forEach(e => {
                if (e.utmSource) bySourceMap[e.utmSource] = (bySourceMap[e.utmSource] || 0) + 1;
            });
            const topSources = Object.entries(bySourceMap)
                .sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([source, count]) => ({ source, count }));

            /* Top cities */
            const byCityMap = {};
            pageViews.forEach(e => { if (e.city) byCityMap[e.city] = (byCityMap[e.city] || 0) + 1; });
            const topCities = Object.entries(byCityMap)
                .sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([city, count]) => ({ city, count }));

            const uniqueSessions = new Set(pageViews.map(e => e.sessionId).filter(Boolean)).size;
            const loadTimes = pageViews.filter(e => e.loadMs != null).map(e => e.loadMs);
            const avgLoadMs = loadTimes.length
                ? Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length)
                : null;

            // todayViews = last 24 hours — works correctly across UTC midnight / Eastern Time
            // boundary by drawing from the extra day always included in the fetch above.
            const dayAgoISO  = new Date(Date.now() - 86400000).toISOString();
            const todayViews = allEntries
                .filter(e => e.type === 'page_view' && (e.ts || '') >= dayAgoISO)
                .length;

            /* Access code login analytics */
            const loginEntries = allEntries.filter(e =>
                (e.type === 'login' || e.type === 'page_view') &&
                e.section === 'client' &&
                e.codeHash
            );

            /* Join with clients to get names and roles */
            let clientsList = [];
            try { clientsList = await readClients(); } catch (e) { clientsList = []; }

            function hashRole(clients, hash) {
                for (const c of clients) {
                    if (c.codeHash === hash)        return { name: c.fullName || c.firstName || 'Client', role: 'Couple',   primaryHash: c.codeHash };
                    if (c.plannerCodeHash === hash)  return { name: c.fullName || c.firstName || 'Client', role: 'Planner',  primaryHash: c.codeHash };
                    if (c.teamCodeHash === hash)     return { name: c.fullName || c.firstName || 'Client', role: 'RNB Team', primaryHash: c.codeHash };
                }
                return { name: '(unknown)', role: 'Client', primaryHash: hash };
            }

            /* Group all entries by primary client (couple's codeHash) with per-role breakdown */
            const clientLoginMap = {};
            loginEntries.forEach(e => {
                const h    = e.codeHash;
                const info = hashRole(clientsList, h);
                const pk   = info.primaryHash;
                if (!clientLoginMap[pk]) clientLoginMap[pk] = {
                    clientName: info.name, roleBreakdown: {}, totalCount: 0,
                    lastLogin: null, firstLogin: null, events: []
                };
                const entry = clientLoginMap[pk];
                if (info.role === 'Couple' || entry.clientName === '(unknown)') entry.clientName = info.name;
                entry.roleBreakdown[info.role] = (entry.roleBreakdown[info.role] || 0) + 1;
                entry.totalCount++;
                const ts = e.ts || '';
                if (!entry.lastLogin  || ts > entry.lastLogin)  entry.lastLogin  = ts;
                if (!entry.firstLogin || ts < entry.firstLogin) entry.firstLogin = ts;
                entry.events.push({ ts, page: e.page || '', type: e.type || '', role: info.role });
            });

            const accessCodeLogins = Object.values(clientLoginMap)
                .sort((a, b) => (b.lastLogin || '').localeCompare(a.lastLogin || ''))
                .map(entry => ({
                    clientName:    entry.clientName,
                    roleBreakdown: entry.roleBreakdown,
                    totalCount:    entry.totalCount,
                    lastLogin:     entry.lastLogin,
                    firstLogin:    entry.firstLogin,
                    events:        entry.events
                        .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
                        .slice(0, 100)
                }));

            return respond(200, {
                ok:             true,
                totalViews:     pageViews.length,
                totalClicks:    clicks.length,
                uniqueSessions,
                avgLoadMs,
                todayViews,
                byDate:         Object.entries(byDateMap).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
                bySection,
                topPages,
                topSources,
                topCities,
                accessCodeLogins
            });
        }

        /* ══════════════════════════════════════
           RSVP — Phone OTP + Guest List + QR
        ══════════════════════════════════════ */

        /* ── RSVP helpers ─────────────────────── */
        function rsvpPhoneHash(e164) {
            return crypto.createHash('sha256').update(e164).digest('hex').slice(0, 24);
        }
        function rsvpOtpKey(hash) { return 'rsvp/otp/' + hash + '.json'; }
        function rsvpDataKey(hash) { return 'rsvp/' + hash + '.json'; }

        async function readRsvp(hash) {
            try {
                const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: rsvpDataKey(hash) }));
                return JSON.parse(await r.Body.transformToString());
            } catch (e) { return null; }
        }

        async function writeRsvp(hash, data) {
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET, Key: rsvpDataKey(hash),
                Body: JSON.stringify(data), ContentType: 'application/json',
                CacheControl: 'no-cache'
            }));
        }

        function sanitizeRsvpTables(tables) {
            if (!Array.isArray(tables)) return [];
            return tables.slice(0, 100).map(t => ({
                id:     String(t.id   || '').slice(0, 40).replace(/[<>"]/g, ''),
                name:   String(t.name || '').slice(0, 80).replace(/[<>"]/g, ''),
                guests: Array.isArray(t.guests) ? t.guests.slice(0, 200).map(g => ({
                    firstName: String(g.firstName || '').slice(0, 80).replace(/[<>"]/g, ''),
                    lastName:  String(g.lastName  || '').slice(0, 80).replace(/[<>"]/g, '')
                })) : []
            }));
        }

        /* ── POST /rsvp-send-otp ──────────────── */
        if (path === '/rsvp-send-otp' && method === 'POST') {
            const { name, phone } = body;
            if (!name || typeof name !== 'string' || !name.trim())
                return respond(400, { ok: false, error: 'Name is required' });
            if (!phone || typeof phone !== 'string' || !/^\+1\d{10}$/.test(phone.trim()))
                return respond(400, { ok: false, error: 'A valid US phone number is required' });

            const cleanPhone = phone.trim();
            const cleanName  = name.trim().slice(0, 80).replace(/[<>"]/g, '');
            const hash = rsvpPhoneHash(cleanPhone);

            /* Generate secure 6-digit OTP */
            const otp = String(crypto.randomInt(100000, 999999));
            const otpData = { otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), name: cleanName, phone: cleanPhone };

            await s3.send(new PutObjectCommand({
                Bucket: BUCKET, Key: rsvpOtpKey(hash),
                Body: JSON.stringify(otpData), ContentType: 'application/json',
                CacheControl: 'no-store'
            }));

            /* Send SMS via SNS */
            try {
                await sns.send(new SNSPublishCommand({
                    PhoneNumber: cleanPhone,
                    Message: `Your RNB Events RSVP verification code is: ${otp}\n\nValid for 10 minutes. Do not share this code.`,
                    MessageAttributes: {
                        'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
                        'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'RNBEvents' }
                    }
                }));
            } catch (smsErr) {
                console.error('SNS SMS error:', smsErr);
                return respond(500, { ok: false, error: 'Could not send verification code. Please try again.' });
            }

            return respond(200, { ok: true, phoneHash: hash });
        }

        /* ── POST /rsvp-verify-otp ───────────── */
        if (path === '/rsvp-verify-otp' && method === 'POST') {
            const { phoneHash, otp } = body;
            if (!phoneHash || typeof phoneHash !== 'string' || !/^[0-9a-f]{24}$/.test(phoneHash))
                return respond(400, { ok: false, error: 'Invalid request' });
            if (!otp || !/^\d{6}$/.test(otp))
                return respond(400, { ok: false, error: 'Please enter the 6-digit code' });

            /* Read OTP record */
            let otpData;
            try {
                const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: rsvpOtpKey(phoneHash) }));
                otpData = JSON.parse(await r.Body.transformToString());
            } catch (e) {
                return respond(400, { ok: false, error: 'Code not found or expired. Please request a new code.' });
            }

            if (!otpData || new Date(otpData.expiresAt) < new Date())
                return respond(400, { ok: false, error: 'Code expired. Please request a new code.' });

            if (otpData.otp !== otp)
                return respond(400, { ok: false, error: 'Invalid code. Please check and try again.' });

            /* Valid — delete OTP object */
            try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rsvpOtpKey(phoneHash) })); } catch(e){}

            /* Create or load RSVP record */
            let rsvpRecord = await readRsvp(phoneHash);
            if (!rsvpRecord) {
                rsvpRecord = {
                    name:      otpData.name,
                    phoneHash,
                    createdAt: new Date().toISOString(),
                    paid:      false,
                    paymentPending: false,
                    tables:    []
                };
                await writeRsvp(phoneHash, rsvpRecord);
            }

            return respond(200, {
                ok: true,
                token: phoneHash,
                rsvp: {
                    name:   rsvpRecord.name,
                    paid:   rsvpRecord.paid,
                    tables: sanitizeRsvpTables(rsvpRecord.tables)
                }
            });
        }

        /* ── POST /rsvp-save ─────────────────── */
        if (path === '/rsvp-save' && method === 'POST') {
            const token = String((event.headers && (event.headers['x-rsvp-token'] || event.headers['X-RSVP-Token'])) || '').trim();
            if (!token || !/^[0-9a-f]{24}$/.test(token))
                return respond(401, { ok: false, error: 'Unauthorized' });

            const rsvpRecord = await readRsvp(token);
            if (!rsvpRecord)
                return respond(404, { ok: false, error: 'RSVP record not found. Please sign in again.' });

            const { tables } = body;
            rsvpRecord.tables    = sanitizeRsvpTables(tables);
            rsvpRecord.updatedAt = new Date().toISOString();
            await writeRsvp(token, rsvpRecord);

            return respond(200, { ok: true });
        }

        /* ── GET /rsvp-get ───────────────────── */
        if (path === '/rsvp-get' && method === 'GET') {
            const qp = event.queryStringParameters || {};
            const hash = String(qp.r || '').trim().replace(/[^0-9a-f]/gi, '').slice(0, 24);
            if (hash.length < 24) return respond(400, { ok: false, error: 'Invalid code' });

            const rsvpRecord = await readRsvp(hash);
            if (!rsvpRecord) return respond(404, { ok: false, error: 'RSVP not found' });

            return respond(200, {
                ok:     true,
                name:   rsvpRecord.name || '',
                paid:   !!rsvpRecord.paid,
                tables: sanitizeRsvpTables(rsvpRecord.tables)
            });
        }

        /* ── POST /rsvp-generate-qr ──────────── */
        if (path === '/rsvp-generate-qr' && method === 'POST') {
            const token = String((event.headers && (event.headers['x-rsvp-token'] || event.headers['X-RSVP-Token'])) || '').trim();
            if (!token || !/^[0-9a-f]{24}$/.test(token))
                return respond(401, { ok: false, error: 'Unauthorized' });

            const rsvpRecord = await readRsvp(token);
            if (!rsvpRecord)
                return respond(404, { ok: false, error: 'RSVP record not found. Please sign in again.' });

            if (!rsvpRecord.paid) {
                /* Mark as payment pending (admin can confirm) */
                rsvpRecord.paymentPending = true;
                rsvpRecord.paymentPendingAt = new Date().toISOString();
                await writeRsvp(token, rsvpRecord);
                return respond(402, {
                    ok:              false,
                    requiresPayment: true,
                    squareLink:      'https://square.link/u/fRda6GSg'
                });
            }

            const guestUrl = 'https://rnbevents716.com/gs.html?r=' + encodeURIComponent(token);
            return respond(200, { ok: true, qrUrl: guestUrl });
        }

        /* ── Public: Guest Seat Lookup (no auth required) ────── */
        /* URL: GET /guest-seat-lookup?e=[first-20-chars-of-codeHash]  */
        if (path === '/guest-seat-lookup') {
            const qp = event.queryStringParameters || {};

            /* ── Branch: r= is an RSVP code ── */
            const rsvpCode = String(qp.r || '').trim().replace(/[^a-f0-9]/gi, '').slice(0, 24);
            if (rsvpCode.length === 24) {
                const rsvpRec = await readRsvp(rsvpCode);
                if (!rsvpRec) return respond(404, { ok: false, error: 'RSVP event not found' });
                if (!rsvpRec.paid) return respond(403, { ok: false, error: 'Seat finder not yet activated for this event' });
                const rsvpPayload = {
                    ok:           true,
                    eventName:    String(rsvpRec.name || 'Your Event').replace(/[<>"]/g, ''),
                    eventDate:    '',
                    eventVenue:   '',
                    palette:      [],
                    layoutImage:  '',
                    tableMarkers: [],
                    tables: sanitizeRsvpTables(rsvpRec.tables)
                };
                return respond(200, rsvpPayload);
            }

            const guestCode = String(qp.e || '').trim().replace(/[^a-f0-9]/gi, '').slice(0, 64);
            if (guestCode.length < 16) return respond(400, { ok: false, error: 'Invalid code' });

            /* 1. Check module-level in-memory cache (warm container reuse under high concurrency) */
            const cached = _guestSeatCache.get(guestCode);
            if (cached && (Date.now() - cached.ts) < GUEST_SEAT_TTL) {
                return {
                    statusCode: 200,
                    headers: { ...HEADERS, 'Cache-Control': 'public, max-age=1800, s-maxage=1800' },
                    body: JSON.stringify(cached.payload)
                };
            }

            /* 2. Try the pre-generated compact snapshot first (tiny file vs full clients.json) */
            let guestPayload = null;
            try {
                const snapResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'guests/' + guestCode + '.json' }));
                const snapStr = await snapResp.Body.transformToString();
                const snap = JSON.parse(snapStr);
                if (snap && snap.ok) guestPayload = snap;
            } catch (snapErr) {
                /* Snapshot not found — fall through to full clients.json lookup */
            }

            /* 3. Fall back to full clients.json scan */
            if (!guestPayload) {
                const clients = await readClients();
                const client = clients.find(c => typeof c.codeHash === 'string' && c.codeHash.startsWith(guestCode));
                if (!client) return respond(404, { ok: false, error: 'Event not found' });
                const sl = client.seatingLayout || {};
                if (!sl.guestListEnabled) return respond(403, { ok: false, error: 'Seating chart not available' });
                const eventName = String(client.fullName || client.firstName || 'Your Event').replace(/[<>"]/g, '');
                const mb = client.moodboard || {};
                const paletteSrc = (mb.reception && Array.isArray(mb.reception.palette) && mb.reception.palette.length)
                    ? mb.reception.palette
                    : (mb.ceremony && Array.isArray(mb.ceremony.palette) && mb.ceremony.palette.length)
                        ? mb.ceremony.palette
                        : (mb.cocktails && Array.isArray(mb.cocktails.palette) && mb.cocktails.palette.length)
                            ? mb.cocktails.palette : [];
                const palette = paletteSrc
                    .filter(h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.trim()))
                    .slice(0, 10).map(h => h.trim().toLowerCase());
                guestPayload = {
                    ok:           true,
                    eventName,
                    eventDate:    String(client.eventDate  || '').slice(0, 100),
                    eventVenue:   String(client.eventVenue || '').slice(0, 200),
                    palette,
                    layoutImage:  sl.layoutImage   || '',
                    tableMarkers: Array.isArray(sl.tableMarkers) ? sl.tableMarkers : [],
                    tables: Array.isArray(sl.tables) ? sl.tables.map(t => ({
                        id:   t.id,
                        name: String(t.name || '').replace(/[<>"]/g, ''),
                        guests: (t.guests || []).map(g => ({
                            firstName: String(g.firstName || '').replace(/[<>"]/g, ''),
                            lastName:  String(g.lastName  || '').replace(/[<>"]/g, '')
                        }))
                    })) : []
                };
            }

            /* 4. Store in module-level cache and return with CDN-friendly cache headers */
            _guestSeatCache.set(guestCode, { payload: guestPayload, ts: Date.now() });
            return {
                statusCode: 200,
                headers: { ...HEADERS, 'Cache-Control': 'public, max-age=1800, s-maxage=1800' },
                body: JSON.stringify(guestPayload)
            };
        }

        /* ── POST /rsvp-admin-list ───────────────────────────── */
        if (path === '/rsvp-admin-list' && method === 'POST') {
            const submittedHash = String(body.adminCodeHash || '').toLowerCase().trim();
            if (!submittedHash || !/^[a-f0-9]{64}$/.test(submittedHash))
                return respond(401, { ok: false, error: 'Unauthorized' });
            const adminDataForAuth = await readAdminData();
            const knownAdminHash = ((adminDataForAuth.adminCodeHash || '') || '47d538bc9bbdba86910d104f78b851d87356c7fcee36e214878a5a24f7bbedf4').toLowerCase();
            if (submittedHash !== knownAdminHash)
                return respond(401, { ok: false, error: 'Unauthorized' });

            /* List all RSVP records (exclude OTP temp keys) */
            let listResp;
            try {
                listResp = await s3.send(new ListObjectsV2Command({
                    Bucket: BUCKET,
                    Prefix: 'rsvp/'
                }));
            } catch (listErr) {
                return respond(500, { ok: false, error: 'Failed to list records' });
            }
            const keys = ((listResp && listResp.Contents) || [])
                .map(function(obj) { return obj.Key; })
                .filter(function(k) { return k && !k.startsWith('rsvp/otp/') && k.endsWith('.json'); });

            const records = [];
            for (const key of keys) {
                try {
                    const getResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
                    const raw = await getResp.Body.transformToString();
                    const rec = JSON.parse(raw);
                    const tableCount = Array.isArray(rec.tables) ? rec.tables.length : 0;
                    const guestCount = Array.isArray(rec.tables)
                        ? rec.tables.reduce(function(sum, t) { return sum + (Array.isArray(t.guests) ? t.guests.length : 0); }, 0)
                        : 0;
                    records.push({
                        phoneHash:      rec.phoneHash || key.replace('rsvp/', '').replace('.json', ''),
                        name:           String(rec.name || '').slice(0, 80),
                        paid:           !!rec.paid,
                        paymentPending: !!rec.paymentPending,
                        tableCount,
                        guestCount,
                        createdAt:      rec.createdAt || ''
                    });
                } catch (e) { /* skip unreadable records */ }
            }

            /* Sort newest first */
            records.sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
            return respond(200, { ok: true, records });
        }

        /* ── POST /rsvp-admin-set-paid ───────────────────────── */
        if (path === '/rsvp-admin-set-paid' && method === 'POST') {
            const submittedHash = String(body.adminCodeHash || '').toLowerCase().trim();
            if (!submittedHash || !/^[a-f0-9]{64}$/.test(submittedHash))
                return respond(401, { ok: false, error: 'Unauthorized' });
            const adminDataForAuth2 = await readAdminData();
            const knownAdminHash2 = ((adminDataForAuth2.adminCodeHash || '') || '47d538bc9bbdba86910d104f78b851d87356c7fcee36e214878a5a24f7bbedf4').toLowerCase();
            if (submittedHash !== knownAdminHash2)
                return respond(401, { ok: false, error: 'Unauthorized' });

            const phoneHash = String(body.phoneHash || '').trim().replace(/[^0-9a-f]/gi, '').slice(0, 24);
            if (phoneHash.length < 24) return respond(400, { ok: false, error: 'Invalid phoneHash' });

            const rsvpRec = await readRsvp(phoneHash);
            if (!rsvpRec) return respond(404, { ok: false, error: 'RSVP record not found' });

            rsvpRec.paid           = !!body.paid;
            rsvpRec.paymentPending = false;
            rsvpRec.updatedAt      = new Date().toISOString();
            await writeRsvp(phoneHash, rsvpRec);
            return respond(200, { ok: true });
        }

        return respond(404, { ok: false, error: 'Not found' });
    } catch (err) {
        console.error(err);
        return respond(500, { ok: false, error: 'An unexpected error occurred' });
    }
};
