/**
 * SeventyTwo — backend za sajt
 * ----------------------------
 * Jedna Apps Script veb aplikacija radi tri stvari:
 *  1. prima zakazane pozive i pisane upite sa sajta, upisuje ih u Google
 *     tabelu i šalje jedan email sa obaveštenjem
 *  2. sajtu javlja koji su termini zauzeti ili blokirani (action=slots)
 *  3. služi admin stranicu (admin.html): lista, statusi, beleške, blokiranje
 *     termina. Sve admin akcije traže lozinku.
 *
 * Sajt šalje GET sa parametrima u adresi (Apps Script preusmerava POST i usput
 * gubi e.postData). doPost postoji za JSON telo, ako se sajt ikad promeni.
 */

/* ================= CONFIG ================= */

// Gde stižu obaveštenja.
var NOTIFY_TO   = 'seventytwoweb@gmail.com';
var SENDER_NAME = 'SeventyTwo sajt';
var BRAND       = 'SeventyTwo';
// Lozinka za admin stranicu. OBAVEZNO promeni pre objave skripte.
// Dok stoji PROMENI-ME, admin stranica ne radi.
var ADMIN_PASSWORD = 'PROMENI-ME';
// Linkovi u dnu svakog obaveštenja. Prazno sakriva link.
var ADMIN_URL   = 'https://seventytwo-develop.vercel.app/admin.html';
var SHEET_URL   = '';
// Prazno kada je skripta vezana za tabelu. Popuni kada je samostalna.
var SHEET_ID    = '';

var TZ = 'Europe/Belgrade';
var TAB_CALLS  = 'Pozivi';
var TAB_LEADS  = 'Upiti';
var TAB_BLOCKS = 'Blokirano';
var CALL_HEAD  = ['ID', 'Primljeno', 'Datum', 'Vreme', 'Način', 'Ime', 'Telefon', 'Email', 'Delatnost', 'Status', 'Beleška', 'Jezik'];
var LEAD_HEAD  = ['ID', 'Primljeno', 'Ime', 'Email', 'Telefon', 'Usluga', 'Delatnost', 'Kada', 'Poruka', 'Status', 'Beleška', 'Jezik'];
var BLOCK_HEAD = ['Datum', 'Vreme'];
var CALL_KEYS  = ['id', 'received', 'date', 'time', 'channel', 'name', 'phone', 'email', 'business', 'status', 'note', 'lang'];
var LEAD_KEYS  = ['id', 'received', 'name', 'email', 'phone', 'service', 'business', 'timing', 'message', 'status', 'note', 'lang'];
var CALL_STATUSES = ['Novo', 'Potvrđen', 'Obavljen', 'Otkazan'];
var LEAD_STATUSES = ['Novo', 'Odgovoreno', 'Zatvoreno'];
var CANCELLED = 'Otkazan';

/* ================= PALETTE =================
   Svetla tema, crvena sa sajta (styles.css, --accent) samo kao akcenat. */

var C = {
  page:      '#F4F4F2',
  card:      '#FFFFFF',
  panel:     '#F7F7F5',
  line:      '#E6E5E1',
  brand:     '#C2183C',
  brandDark: '#C2183C',
  ink:       '#14161A',
  body:      '#3C4046',
  muted:     '#7A7F87',
  onBrand:   '#FFFFFF'
};

var RADIUS = '16px';
var RPILL  = '8px';
var SANS = 'Helvetica,Arial,sans-serif';

/* ================= ENTRY POINTS ================= */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = String(p.action || '');
  try {
    if (action === 'slots') return json_(slots_());
    if (action.indexOf('admin.') === 0) return json_(admin_(action.slice(6), p));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
  var d = readParams_(e);
  if (d.website) return json_({ ok: true });   // skriveno polje popunjava samo bot
  if (!d.name && !d.email && !d.phone && !d.message) {
    return json_({ ok: true, service: BRAND + ' endpoint' });
  }
  return handle_(d);
}

function doPost(e) {
  var d = readParams_(e);
  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var k in body) if (body[k]) d[k] = clip_(body[k]);
    } catch (err) { /* nije JSON, parametri su već pročitani */ }
  }
  if (d.website) return json_({ ok: true });
  return handle_(d);
}

function handle_(d) {
  var sheetErr = '';
  if (isCall_(d)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.time)) {
      return json_({ ok: false, error: 'bad-slot' });
    }
    var lock = LockService.getScriptLock();
    try { lock.waitLock(8000); } catch (err) { /* nastavi bez brave */ }
    try {
      var taken = false;
      try { taken = isTaken_(d.date, d.time); } catch (err) { sheetErr = String(err); }
      if (taken) return json_({ ok: false, error: 'taken' });
      // Namerno odvojeno: neuspeo upis u tabelu ne sme da košta zahteva.
      try { saveRow_(d); } catch (err) { sheetErr = String(err); }
    } finally {
      try { lock.releaseLock(); } catch (err) { /* nije ni držana */ }
    }
  } else {
    try { saveRow_(d); } catch (err) { sheetErr = String(err); }
  }
  try {
    sendEmail_(d);
  } catch (err) {
    return json_({ ok: false, error: String(err), sheetError: sheetErr });
  }
  return json_({ ok: true, sheetError: sheetErr });
}

// Jedan red po polju koje forme zaista šalju (index.html i contact.html).
function readParams_(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  return {
    type:     clip_(p.type),      // "Poziv" kod zakazivanja, prazno kod upita
    date:     clip_(p.date),      // 2026-10-13
    time:     clip_(p.time),      // 11:00
    channel:  clip_(p.channel),   // Telefon, WhatsApp, Viber, Google Meet
    name:     clip_(p.name),
    phone:    clip_(p.phone),
    email:    clip_(p.email),
    business: clip_(p.business),
    service:  clip_(p.service),
    timing:   clip_(p.timing),
    message:  clip_(p.message),
    lang:     clip_(p.lang),
    page:     clip_(p.page),
    website:  clip_(p.website)    // zamka za botove, ljudi je ne vide
  };
}

function isCall_(d) { return d.type === 'Poziv'; }

/* ================= SHEET =================
   Tri lista u istoj tabeli: Pozivi, Upiti, Blokirano. Sve ćelije su tekst,
   da Sheets ne pretvara datume, vremena i brojeve telefona u nešto drugo. */

function book_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Nema tabele: veži skriptu za tabelu ili popuni SHEET_ID.');
  return ss;
}

function tab_(name, head) {
  var ss = book_();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, sheet.getMaxRows(), head.length).setNumberFormat('@');
    sheet.appendRow(head);
    sheet.getRange(1, 1, 1, head.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rows_(name, head, keys) {
  var values = tab_(name, head).getDataRange().getDisplayValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    for (var k = 0; k < keys.length; k++) o[keys[k]] = values[i][k] || '';
    out.push(o);
  }
  return out;
}

// "=" na početku bi tabela pročitala kao formulu.
function cell_(v) { return String(v == null ? '' : v).replace(/^=+/, ''); }

function saveRow_(d) {
  var id = Utilities.getUuid().slice(0, 8);
  var now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  if (isCall_(d)) {
    tab_(TAB_CALLS, CALL_HEAD).appendRow([id, now, d.date, d.time, d.channel, d.name, d.phone, d.email, d.business, 'Novo', '', d.lang].map(cell_));
  } else {
    tab_(TAB_LEADS, LEAD_HEAD).appendRow([id, now, d.name, d.email, d.phone, d.service, d.business, d.timing, d.message, 'Novo', '', d.lang].map(cell_));
  }
}

function blocks_() { return rows_(TAB_BLOCKS, BLOCK_HEAD, ['date', 'time']); }

function isTaken_(date, time) {
  var calls = rows_(TAB_CALLS, CALL_HEAD, CALL_KEYS);
  for (var i = 0; i < calls.length; i++) {
    if (calls[i].date === date && calls[i].time === time && calls[i].status !== CANCELLED) return true;
  }
  var blocks = blocks_();
  for (var j = 0; j < blocks.length; j++) {
    if (blocks[j].date === date && (!blocks[j].time || blocks[j].time === time)) return true;
  }
  return false;
}

// Javno: samo datumi i vremena, bez ijednog ličnog podatka.
function slots_() {
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var taken = {};
  var add = function (date, time) {
    if (!date || date < today) return;
    if (!taken[date]) taken[date] = [];
    taken[date].push(time || '*');   // * znači ceo dan
  };
  rows_(TAB_CALLS, CALL_HEAD, CALL_KEYS).forEach(function (c) { if (c.status !== CANCELLED) add(c.date, c.time); });
  blocks_().forEach(function (b) { add(b.date, b.time); });
  return { ok: true, taken: taken };
}

/* ================= ADMIN ================= */

function admin_(action, p) {
  var cache = CacheService.getScriptCache();
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'PROMENI-ME') return { ok: false, error: 'setup' };
  var fails = Number(cache.get('fails') || 0);
  if (fails >= 8) return { ok: false, error: 'locked' };
  if (String(p.key || '') !== ADMIN_PASSWORD) {
    cache.put('fails', String(fails + 1), 600);   // 8 promašaja zaključava na 10 minuta
    return { ok: false, error: 'auth' };
  }

  if (action === 'list') {
    return {
      ok: true,
      calls: rows_(TAB_CALLS, CALL_HEAD, CALL_KEYS),
      leads: rows_(TAB_LEADS, LEAD_HEAD, LEAD_KEYS),
      blocks: blocks_(),
      callStatuses: CALL_STATUSES,
      leadStatuses: LEAD_STATUSES,
      sheetUrl: SHEET_URL || book_().getUrl()
    };
  }

  if (action === 'update') {
    var isCalls = p.tab === 'calls';
    var head = isCalls ? CALL_HEAD : LEAD_HEAD;
    var sheet = tab_(isCalls ? TAB_CALLS : TAB_LEADS, head);
    var ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues();
    for (var i = 1; i < ids.length; i++) {
      if (ids[i][0] !== p.id) continue;
      if (p.status !== undefined) {
        if ((isCalls ? CALL_STATUSES : LEAD_STATUSES).indexOf(p.status) < 0) return { ok: false, error: 'bad-status' };
        sheet.getRange(i + 1, head.indexOf('Status') + 1).setValue(p.status);
      }
      if (p.note !== undefined) sheet.getRange(i + 1, head.indexOf('Beleška') + 1).setValue(cell_(clip_(p.note)));
      return { ok: true };
    }
    return { ok: false, error: 'not-found' };
  }

  if (action === 'block' || action === 'unblock') {
    var date = String(p.date || '');
    var time = String(p.time || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (time && !/^\d{2}:\d{2}$/.test(time))) return { ok: false, error: 'bad-slot' };
    var bs = tab_(TAB_BLOCKS, BLOCK_HEAD);
    var rows = bs.getDataRange().getDisplayValues();
    for (var r = rows.length - 1; r >= 1; r--) {
      if (rows[r][0] === date && rows[r][1] === time) {
        if (action === 'unblock') bs.deleteRow(r + 1);
        return { ok: true };
      }
    }
    if (action === 'block') bs.appendRow([date, time]);
    return { ok: true };
  }

  return { ok: false, error: 'unknown-action' };
}

/* ================= EMAIL ================= */

function sendEmail_(d) {
  MailApp.sendEmail(NOTIFY_TO, buildSubject_(d), buildPlain_(d), {
    name: SENDER_NAME,
    htmlBody: buildHtml_(d),
    replyTo: /.+@.+\..+/.test(String(d.email || '')) ? d.email : undefined
  });
}

var DAYS_ = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];
var MONTHS_ = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];

// "2026-10-13", "11:00" -> "utorak, 13. oktobar u 11:00"
function termin_(d) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d.date || ''));
  if (!m) return [d.date, d.time].filter(Boolean).join(' ');
  var day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return DAYS_[day.getUTCDay()] + ', ' + Number(m[3]) + '. ' + MONTHS_[day.getUTCMonth()] + (d.time ? ' u ' + d.time : '');
}

function buildSubject_(d) {
  var who = d.name || 'Novi kontakt';
  return isCall_(d)
    ? 'Novi ' + BRAND + ' poziv: ' + who + ' (' + termin_(d) + ')'
    : 'Novi ' + BRAND + ' upit: ' + who;
}

function buildPlain_(d) {
  var lines = [isCall_(d) ? 'NOVI POZIV' : 'NOVI UPIT', ''];
  var add = function (label, value) { if (value) lines.push(label + ': ' + value); };
  if (isCall_(d)) add('Termin', termin_(d));
  add('Način', d.channel);
  add('Ime', d.name);
  add('Telefon', d.phone);
  add('Email', d.email);
  add('Delatnost', d.business);
  add('Usluga', d.service);
  add('Kada kreće', d.timing);
  if (d.message) lines.push('', 'PORUKA', d.message);
  lines.push('', 'Poslato sa sajta ' + BRAND + (d.page ? ' (' + d.page + ')' : '') + '.');
  if (ADMIN_URL) lines.push('Admin: ' + ADMIN_URL);
  return lines.join('\n');
}

// 064 123 4567 -> 381641234567 (format koji traži wa.me)
function waNumber_(phone) {
  var raw = String(phone || '');
  var digits = raw.replace(/\D/g, '');
  if (raw.replace(/\s/g, '').charAt(0) === '+') return digits;
  if (digits.indexOf('00') === 0) return digits.slice(2);
  if (digits.charAt(0) === '0') return '381' + digits.slice(1);
  return digits;
}

/**
 * Pravila koja su ovde namerno ugrađena (reference/gotchas.md):
 *  - samo tabele i inline stilovi, bez flex/grid, bez veb fontova, bez slika
 *  - !important na svakoj boji i bgcolor na svakom bloku (tamni režim)
 *  - color-scheme meta da Apple Mail ne izvrće boje
 *  - dugmad su ćelije tabele sa paddingom, ne stilizovani linkovi
 */
function buildHtml_(d) {
  d = d || {};
  var call  = isCall_(d);
  var name  = d.name || 'Neko';
  var first = (String(name).split(' ')[0] || 'osobu').slice(0, 18);

  // Dugme se pojavljuje samo kada je vrednost zaista upotrebljiva.
  var digits   = String(d.phone || '').replace(/[^\d+]/g, '');
  var callable = digits.replace(/\D/g, '').length >= 6;
  var tel      = 'tel:' + digits;
  var mailable = /.+@.+\..+/.test(String(d.email || ''));

  var rows = [
    ['Ime',        d.name],
    ['Način',      call ? d.channel : ''],
    ['Telefon',    d.phone, callable ? tel : ''],
    ['Email',      d.email, mailable ? 'mailto:' + esc_(d.email) : ''],
    ['Delatnost',  d.business],
    ['Usluga',     d.service],
    ['Kada kreće', d.timing]
  ].filter(function (r) { return r[1]; }).map(function (r, i, all) {
    var border = (i === all.length - 1) ? '' : 'border-bottom:1px solid ' + C.line + ';';
    var value = r[2]
      ? '<a href="' + r[2] + '" style="color:' + C.ink + ' !important;text-decoration:none;' +
        'border-bottom:1px solid ' + C.line + ';">' + esc_(r[1]) + '</a>'
      : esc_(r[1]);
    return '<tr>' +
      '<td bgcolor="' + C.card + '" width="120" style="background-color:' + C.card + ' !important;' + border +
        'padding:15px 16px 15px 0;color:' + C.muted + ' !important;font:700 11px/1.35 ' + SANS + ';' +
        'letter-spacing:.13em;text-transform:uppercase;vertical-align:top;">' + r[0] + '</td>' +
      '<td bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;' + border +
        'padding:13px 0;color:' + C.ink + ' !important;font:400 17px/1.45 ' + SANS + ';word-break:break-word;">' + value + '</td>' +
    '</tr>';
  }).join('');

  // Kod poziva panel nosi termin, kod upita poruku.
  var panelLabel = call ? 'Termin' : 'Poruka';
  var panelBody = call
    ? '<div style="color:' + C.ink + ' !important;font:700 20px/1.4 ' + SANS + ';">' + esc_(termin_(d)) + '</div>'
    : '<div style="color:' + C.body + ' !important;font:400 16px/1.65 ' + SANS + ';white-space:pre-wrap;word-break:break-word;">' +
        esc_(d.message || 'Bez poruke.') + '</div>';
  var panel =
    '<tr><td bgcolor="' + C.panel + '" style="background-color:' + C.panel + ' !important;' +
      'border-left:3px solid ' + C.brand + ';border-radius:' + RPILL + ';padding:20px 22px;">' +
      '<div style="color:' + C.muted + ' !important;font:700 11px/1.2 ' + SANS + ';letter-spacing:.13em;' +
        'text-transform:uppercase;padding-bottom:10px;">' + panelLabel + '</div>' + panelBody +
    '</td></tr>';

  var solid = function (href, label) {
    return '<td bgcolor="' + C.brandDark + '" style="background-color:' + C.brandDark + ' !important;' +
      'border-radius:' + RPILL + ';padding:15px 26px;">' +
      '<a href="' + href + '" style="color:' + C.onBrand + ' !important;text-decoration:none;' +
      'font:700 13px/1 ' + SANS + ';letter-spacing:.1em;text-transform:uppercase;">' + label + '</a></td>';
  };
  var ghost = function (href, label) {
    return '<td bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;' +
      'border:1px solid ' + C.line + ';border-radius:' + RPILL + ';padding:14px 24px;">' +
      '<a href="' + href + '" style="color:' + C.ink + ' !important;text-decoration:none;' +
      'font:700 13px/1 ' + SANS + ';letter-spacing:.1em;text-transform:uppercase;">' + label + '</a></td>';
  };
  var gap = '<td width="10" style="width:10px;">&nbsp;</td>';
  var mailHref = 'mailto:' + esc_(d.email) + '?subject=' + encodeURIComponent(BRAND + ': tvoj zahtev sa sajta');
  var waHref = 'https://wa.me/' + waNumber_(d.phone);

  // Prvo dugme je glavno: način koji je osoba izabrala, inače poziv pa email.
  var list = [];
  if (callable && d.channel === 'WhatsApp') list.push([waHref, 'WhatsApp']);
  if (callable) list.push([tel, 'Pozovi ' + esc_(first)]);
  if (mailable) list.push([mailHref, callable ? 'Email' : 'Email ' + esc_(first)]);
  var buttons = list.slice(0, 2).map(function (b, i) { return (i === 0 ? solid : ghost)(b[0], b[1]); }).join(gap);

  var actions = buttons
    ? '<tr><td class="pad" bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;padding:28px 40px 38px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' + buttons + '</tr></table>' +
      '</td></tr>'
    : '<tr><td bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;height:34px;font-size:0;line-height:0;">&nbsp;</td></tr>';

  var footLink = function (href, label) {
    return '<a href="' + href + '" style="color:' + C.muted + ' !important;font:400 12px/1.7 ' + SANS + ';' +
      'text-decoration:underline;">' + label + '</a>';
  };
  var footLinks = [
    ADMIN_URL ? footLink(ADMIN_URL, 'Otvori admin stranicu') : '',
    SHEET_URL ? footLink(SHEET_URL, 'Tabela sa svim zahtevima') : ''
  ].filter(Boolean).join(' &nbsp;&middot;&nbsp; ');

  return '' +
'<!DOCTYPE html><html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<meta name="color-scheme" content="light dark">' +
'<meta name="supported-color-schemes" content="light dark">' +
'<style>:root{color-scheme:light dark;supported-color-schemes:light dark;}' +
'@media (max-width:600px){.pad{padding-left:24px !important;padding-right:24px !important;}' +
'.hd{font-size:26px !important;}}</style></head>' +
'<body style="margin:0;padding:0;background-color:' + C.page + ' !important;" bgcolor="' + C.page + '">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
  'bgcolor="' + C.page + '" style="background-color:' + C.page + ' !important;">' +
'<tr><td align="center" style="padding:32px 12px 44px;">' +

  '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;max-width:600px;">' +

  '<tr><td style="padding:0;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;' +
    'border:1px solid ' + C.line + ';border-radius:' + RADIUS + ';">' +

    '<tr><td class="pad" bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;' +
      'border-top:4px solid ' + C.brand + ';border-radius:' + RADIUS + ' ' + RADIUS + ' 0 0;padding:34px 40px 28px;">' +
      '<div style="color:' + C.brand + ' !important;font:700 11px/1.2 ' + SANS + ';letter-spacing:.2em;' +
        'text-transform:uppercase;">' + esc_(BRAND) + '</div>' +
      '<div class="hd" style="color:' + C.ink + ' !important;font:700 32px/1.15 ' + SANS + ';' +
        'letter-spacing:-.01em;padding-top:14px;">' + (call ? 'Zakazan poziv' : 'Novi upit') + '</div>' +
      '<div style="color:' + C.muted + ' !important;font:400 15px/1.5 ' + SANS + ';padding-top:10px;word-break:break-word;">' +
        esc_(name) + (d.business ? ' &middot; ' + esc_(d.business) : '') + '</div>' +
    '</td></tr>' +

    '<tr><td class="pad" bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;padding:0 40px 26px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + panel + '</table>' +
    '</td></tr>' +

    (rows ? '<tr><td class="pad" bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;padding:0 40px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
        'bgcolor="' + C.card + '" style="background-color:' + C.card + ' !important;' +
        'border-top:1px solid ' + C.line + ';">' + rows + '</table>' +
    '</td></tr>' : '') +

    actions +

  '</table></td></tr>' +

    '<tr><td class="pad" bgcolor="' + C.page + '" style="background-color:' + C.page + ' !important;padding:20px 40px 0;">' +
      '<div style="color:' + C.muted + ' !important;font:700 11px/1.7 ' + SANS + ';letter-spacing:.12em;' +
        'text-transform:uppercase;">Sajt ' + esc_(BRAND) +
        (d.page ? ' &nbsp;&middot;&nbsp; ' + esc_(d.page) : '') + '</div>' +
      (footLinks ? '<div style="padding-top:8px;">' + footLinks + '</div>' : '') +
    '</td></tr>' +

  '</table>' +
  '<!--[if mso]></td></tr></table><![endif]-->' +
'</td></tr></table></body></html>';
}

/* ================= HELPERS ================= */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function clip_(v) { return String(v == null ? '' : v).slice(0, 2000); }

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
