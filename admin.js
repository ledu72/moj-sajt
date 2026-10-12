// Admin stranica: pozivi, upiti i blokiranje termina.
// Podaci stoje u Google tabeli, a čitaju se i menjaju preko Apps Script adrese (ENDPOINT u config.js).

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const DEMO = new URLSearchParams(location.search).has('demo');
const KEY_STORE = 'st-admin-key';
const CANCELLED = 'Otkazan';

let key = '';
try { key = sessionStorage.getItem(KEY_STORE) || ''; } catch (e) { /* private mode */ }

let state = { calls: [], leads: [], blocks: [], callStatuses: [], leadStatuses: [], sheetUrl: '' };
let view = 'calls';
let filter = { calls: 'upcoming', leads: 'open' };
let blockDay = '';

/* ---------- Helpers ---------- */

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (n) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const fmt = (s, opts) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Intl.DateTimeFormat('sr-Latn-RS', opts).format(fromIso(s)) : s);
const longDate = (s) => fmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// 064 123 4567 -> 381641234567 (format koji traže wa.me i Viber)
function intlNumber(phone) {
  const raw = String(phone || '');
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `381${digits.slice(1)}`;
  return digits;
}
const callable = (phone) => String(phone || '').replace(/\D/g, '').length >= 6;
const mailable = (email) => /.+@.+\..+/.test(String(email || ''));

let toastTimer = 0;
function toast(text, bad) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('is-bad', Boolean(bad));
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/* ---------- API ---------- */

function api(action, params = {}) {
  if (DEMO) return demoApi(action, params);
  const query = new URLSearchParams({ action: `admin.${action}`, key, ...params });
  return fetch(`${ENDPOINT}?${query.toString()}`).then((res) => res.json());
}

const ERRORS = {
  auth: 'Pogrešna lozinka.',
  locked: 'Previše pogrešnih pokušaja. Probaj ponovo za 10 minuta.',
  setup: 'U Code.gs još stoji PROMENI-ME. Promeni ADMIN_PASSWORD i objavi novu verziju skripte.',
};
const errorText = (json) => ERRORS[json && json.error] || 'Nešto nije u redu sa serverom. Probaj ponovo.';

/* ---------- Screens ---------- */

function show(id) {
  ['setup', 'login', 'app'].forEach((name) => { $(`#${name}`).hidden = name !== id; });
  $('#topActions').hidden = id !== 'app';
}

function load() {
  document.body.classList.add('is-busy');
  return api('list')
    .then((json) => {
      if (!json.ok) {
        if (['auth', 'locked', 'setup'].includes(json.error)) { logout(errorText(json)); return; }
        throw new Error(json.error);
      }
      state = json;
      show('app');
      render();
    })
    .catch(() => {
      if ($('#app').hidden) { show('login'); $('#loginError').textContent = 'Server se ne javlja. Proveri ENDPOINT u config.js.'; } else toast('Server se ne javlja.', true);
    })
    .finally(() => document.body.classList.remove('is-busy'));
}

function logout(message) {
  key = '';
  try { sessionStorage.removeItem(KEY_STORE); } catch (e) { /* private mode */ }
  show('login');
  $('#loginError').textContent = message || '';
}

$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  key = $('#a-key').value;
  $('#a-key').value = '';
  try { sessionStorage.setItem(KEY_STORE, key); } catch (err) { /* private mode */ }
  $('#loginError').textContent = '';
  load();
});

/* ---------- Render ---------- */

function render() {
  const t = today();
  const live = state.calls.filter((c) => c.status !== CANCELLED);
  const fresh = state.calls.filter((c) => c.status === 'Novo' && c.date >= t).length + state.leads.filter((l) => l.status === 'Novo').length;
  const stats = [
    [fresh, 'novih zahteva', fresh > 0],
    [live.filter((c) => c.date === t).length, 'poziva danas', false],
    [live.filter((c) => c.date > t && c.date <= addDays(7)).length, 'u narednih 7 dana', false],
  ];
  $('#stats').innerHTML = stats.map(([n, label, hot]) => `<div class="a-stat${hot ? ' is-hot' : ''}"><b>${n}</b><span>${label}</span></div>`).join('');

  $('#countCalls').textContent = state.calls.filter((c) => c.status === 'Novo' && c.date >= t).length || '';
  $('#countLeads').textContent = state.leads.filter((l) => l.status === 'Novo').length || '';
  $$('.a-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === view));
  $('#demoNote').hidden = !DEMO;
  const sheet = $('#sheetLink');
  sheet.hidden = !state.sheetUrl;
  if (state.sheetUrl) sheet.href = state.sheetUrl;

  if (view === 'calls') renderCalls();
  else if (view === 'leads') renderLeads();
  else renderBlocks();
}

function chips(group, options) {
  $('#filters').innerHTML = options.map(([value, label]) => `<button class="chip${filter[group] === value ? ' is-picked' : ''}" type="button" data-filter="${value}">${label}</button>`).join('');
}

const badge = (status) => `<span class="a-badge" data-s="${esc(status)}">${esc(status || 'Novo')}</span>`;

function noteBlock(item) {
  return `<details class="a-note"${item.note ? ' open' : ''}>
    <summary>${item.note ? 'Beleška' : 'Dodaj belešku'}</summary>
    <textarea class="input" aria-label="Beleška">${esc(item.note)}</textarea>
    <button class="btn" type="button" data-act="note">Sačuvaj belešku</button>
  </details>`;
}

function contactButtons(item, message) {
  const out = [];
  const num = intlNumber(item.phone);
  if (callable(item.phone)) {
    out.push(`<a class="btn" href="tel:${esc(String(item.phone).replace(/[^\d+]/g, ''))}">Pozovi</a>`);
    out.push(`<a class="btn" href="https://wa.me/${num}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">WhatsApp</a>`);
    out.push(`<a class="btn" href="viber://chat?number=%2B${num}">Viber</a>`);
  }
  if (mailable(item.email)) out.push(`<a class="btn" href="mailto:${esc(item.email)}?subject=${encodeURIComponent('SeventyTwo')}&body=${encodeURIComponent(message)}">Email</a>`);
  return out.join('');
}

function statusButtons(item, statuses) {
  const labels = { Novo: 'Vrati na novo', 'Potvrđen': 'Potvrdi', Obavljen: 'Obavljen', Otkazan: 'Otkaži', Odgovoreno: 'Odgovoreno', Zatvoreno: 'Zatvori' };
  return statuses.filter((s) => s !== item.status).map((s) => {
    const cls = s === 'Potvrđen' || (s === 'Odgovoreno' && item.status === 'Novo') ? 'btn btn--primary' : 'btn btn--quiet';
    return `<button class="${cls}" type="button" data-act="status" data-status="${esc(s)}">${labels[s] || esc(s)}</button>`;
  }).join('');
}

function renderCalls() {
  chips('calls', [['upcoming', 'Predstojeći'], ['new', 'Novi'], ['past', 'Prošli'], ['all', 'Svi']]);
  const t = today();
  const f = filter.calls;
  const list = state.calls
    .filter((c) => (f === 'all') || (f === 'past' ? c.date < t : c.date >= t && (f !== 'new' || c.status === 'Novo')))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) * (f === 'past' ? -1 : 1));

  if (!list.length) { $('#view').innerHTML = '<p class="a-empty">Nema poziva za ovaj prikaz.</p>'; return; }

  let html = '';
  let lastDate = '';
  list.forEach((c) => {
    if (c.date !== lastDate) {
      lastDate = c.date;
      const mark = c.date === t ? '<small>danas</small>' : c.date === addDays(1) ? '<small>sutra</small>' : '';
      html += `<h2 class="a-day">${esc(longDate(c.date))}${mark}</h2>`;
    }
    const first = String(c.name || '').split(' ')[0];
    const message = `Zdravo${first ? ` ${first}` : ''}, potvrđujem poziv: ${longDate(c.date)} u ${c.time}. SeventyTwo`;
    const meta = [c.channel, c.business, c.phone, c.email].filter(Boolean).map(esc).join(' · ');
    html += `<article class="a-card${c.status === 'Novo' ? ' is-new' : ''}${c.status === CANCELLED ? ' is-off' : ''}" data-tab="calls" data-id="${esc(c.id)}">
      <div class="a-card-head"><span class="a-time">${esc(c.time)}</span><span class="a-name">${esc(c.name || 'Bez imena')}</span>${badge(c.status)}</div>
      <p class="a-meta">${meta}</p>
      <div class="a-row">${contactButtons(c, message)}</div>
      <div class="a-row">${statusButtons(c, state.callStatuses)}</div>
      ${noteBlock(c)}
    </article>`;
  });
  $('#view').innerHTML = html;
}

function renderLeads() {
  chips('leads', [['open', 'Otvoreni'], ['all', 'Svi']]);
  const list = state.leads
    .filter((l) => filter.leads === 'all' || l.status !== 'Zatvoreno')
    .sort((a, b) => b.received.localeCompare(a.received));

  if (!list.length) { $('#view').innerHTML = '<p class="a-empty">Nema upita za ovaj prikaz.</p>'; return; }

  $('#view').innerHTML = list.map((l) => {
    const first = String(l.name || '').split(' ')[0];
    const message = `Zdravo${first ? ` ${first}` : ''}, hvala na upitu preko sajta. `;
    const meta = [l.service, l.business, l.timing, l.phone, l.email].filter(Boolean).map(esc).join(' · ');
    return `<article class="a-card${l.status === 'Novo' ? ' is-new' : ''}${l.status === 'Zatvoreno' ? ' is-off' : ''}" data-tab="leads" data-id="${esc(l.id)}">
      <div class="a-card-head"><span class="a-name">${esc(l.name || 'Bez imena')}</span>${badge(l.status)}</div>
      <p class="a-meta">${meta}</p>
      <p class="a-meta">Primljeno: ${esc(l.received)}</p>
      ${l.message ? `<p class="a-msg">${esc(l.message)}</p>` : ''}
      <div class="a-row">${contactButtons(l, message)}</div>
      <div class="a-row">${statusButtons(l, state.leadStatuses)}</div>
      ${noteBlock(l)}
    </article>`;
  }).join('');
}

// Isti dani i vremena koje sajt nudi posetiocima (BOOKING iz config.js)
function bookingDays() {
  const out = [];
  for (let i = 0; i <= BOOKING.daysAhead; i++) {
    const d = fromIso(addDays(i));
    if (BOOKING.weekdays.includes(d.getDay())) out.push(iso(d));
  }
  return out;
}
function bookingTimes() {
  const out = [];
  for (let m = toMin(BOOKING.from); m < toMin(BOOKING.to); m += BOOKING.stepMin) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}
const isBlocked = (date, time) => state.blocks.some((b) => b.date === date && b.time === (time || ''));

function renderBlocks() {
  $('#filters').innerHTML = '';
  const days = bookingDays();
  if (!days.includes(blockDay)) blockDay = days[0];
  const live = state.calls.filter((c) => c.status !== CANCELLED);
  const part = (s, opts) => fmt(s, opts).replace('.', '');

  const dayButtons = days.map((d) => {
    const booked = live.some((c) => c.date === d);
    return `<button class="bk-day${d === blockDay ? ' is-picked' : ''}${isBlocked(d) ? ' is-blocked' : ''}" type="button" data-day="${d}">
      <span>${part(d, { weekday: 'short' })}</span><b>${fromIso(d).getDate()}</b><span>${part(d, { month: 'short' })}</span>${booked ? '<i></i>' : ''}
    </button>`;
  }).join('');

  const dayOff = isBlocked(blockDay);
  const timeButtons = bookingTimes().map((time) => {
    const call = live.find((c) => c.date === blockDay && c.time === time);
    if (call) return `<button class="bk-time is-booked" type="button" disabled title="${esc(call.name)}">${time}</button>`;
    return `<button class="bk-time${isBlocked(blockDay, time) ? ' is-blocked' : ''}" type="button" data-time="${time}"${dayOff ? ' disabled' : ''}>${time}</button>`;
  }).join('');

  $('#view').innerHTML = `<p class="a-help">Izaberi dan, pa dodirni vreme koje ne želiš da nudiš na sajtu. Još jedan dodir ga vraća.</p>
    <div class="bk-days">${dayButtons}</div>
    <div class="a-blockday"><b>${esc(longDate(blockDay))}</b>
      <button class="btn${dayOff ? '' : ' btn--primary'}" type="button" data-act="blockday">${dayOff ? 'Vrati ceo dan' : 'Blokiraj ceo dan'}</button>
    </div>
    <div class="bk-times" style="margin-top:14px">${timeButtons}</div>
    <p class="a-legend"><span>slobodno</span><span class="l-booked">zakazan poziv</span><span class="l-blocked">blokirano</span></p>`;
}

/* ---------- Actions ---------- */

function setBlock(date, time, on) {
  api(on ? 'block' : 'unblock', { date, time }).then((json) => {
    if (!json.ok) { toast(errorText(json), true); return; }
    state.blocks = state.blocks.filter((b) => !(b.date === date && b.time === time));
    if (on) state.blocks.push({ date, time });
    render();
    toast(on ? 'Blokirano.' : 'Vraćeno u ponudu.');
  }).catch(() => toast('Server se ne javlja.', true));
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.a-tab');
  if (tab) { view = tab.dataset.view; render(); return; }

  const chip = e.target.closest('[data-filter]');
  if (chip) { filter[view] = chip.dataset.filter; render(); return; }

  const day = e.target.closest('[data-day]');
  if (day) { blockDay = day.dataset.day; render(); return; }

  const time = e.target.closest('[data-time]');
  if (time) { setBlock(blockDay, time.dataset.time, !isBlocked(blockDay, time.dataset.time)); return; }

  const act = e.target.closest('[data-act]');
  if (!act) return;
  const name = act.dataset.act;
  if (name === 'refresh') { load().then(() => toast('Osveženo.')); return; }
  if (name === 'logout') { logout(); return; }
  if (name === 'blockday') { setBlock(blockDay, '', !isBlocked(blockDay)); return; }

  const card = act.closest('.a-card');
  if (!card) return;
  const tabName = card.dataset.tab;
  const item = state[tabName].find((x) => x.id === card.dataset.id);
  const change = name === 'status' ? { status: act.dataset.status } : { note: $('textarea', card).value };
  card.classList.add('is-busy');
  api('update', { tab: tabName, id: item.id, ...change }).then((json) => {
    if (!json.ok) { card.classList.remove('is-busy'); toast(errorText(json), true); return; }
    Object.assign(item, change);
    render();
    toast(name === 'status' ? `Status: ${change.status}.` : 'Beleška je sačuvana.');
  }).catch(() => { card.classList.remove('is-busy'); toast('Server se ne javlja.', true); });
});

/* ---------- Demo (admin.html?demo): probni podaci u memoriji, bez servera ---------- */

let demoData = null;
function demoApi(action, p) {
  if (!demoData) {
    const days = bookingDays();
    const d = (n) => days[Math.min(n, days.length - 1)];
    demoData = {
      ok: true,
      callStatuses: ['Novo', 'Potvrđen', 'Obavljen', 'Otkazan'],
      leadStatuses: ['Novo', 'Odgovoreno', 'Zatvoreno'],
      sheetUrl: '',
      calls: [
        { id: 'd1', received: '', date: d(0), time: '11:00', channel: 'WhatsApp', name: 'Marko Marković', phone: '064 123 4567', email: '', business: 'frizerski salon, Beograd', status: 'Potvrđen', note: 'Hoće onlajn zakazivanje.', lang: 'sr' },
        { id: 'd2', received: '', date: d(1), time: '14:30', channel: 'Telefon', name: 'Jelena Jović', phone: '063 555 010', email: '', business: 'kozmetički salon', status: 'Novo', note: '', lang: 'sr' },
        { id: 'd3', received: '', date: d(3), time: '10:00', channel: 'Google Meet', name: 'John Smith', phone: '', email: 'john@example.com', business: 'coffee shop, Vienna', status: 'Novo', note: '', lang: 'en' },
        { id: 'd4', received: '', date: addDays(-3), time: '12:00', channel: 'Viber', name: 'Petar Petrović', phone: '065 222 333', email: '', business: 'auto servis', status: 'Obavljen', note: '', lang: 'sr' },
      ],
      leads: [
        { id: 'u1', received: `${addDays(-1)} 18:42`, name: 'Ana Anić', email: 'ana@primer.rs', phone: '', service: 'Sajt sa zakazivanjem', business: 'studio za nokte, Novi Sad', timing: 'U narednih mesec dana', message: 'Zanima me koliko traje izrada i da li mogu sama da menjam cenovnik.', status: 'Novo', note: '', lang: 'sr' },
      ],
      blocks: [{ date: d(2), time: '' }, { date: d(1), time: '10:00' }],
    };
  }
  if (action === 'update') {
    const item = demoData[p.tab].find((x) => x.id === p.id);
    if (p.status !== undefined) item.status = p.status;
    if (p.note !== undefined) item.note = p.note;
  }
  if (action === 'list') return Promise.resolve(JSON.parse(JSON.stringify(demoData)));
  return Promise.resolve({ ok: true });
}

/* ---------- Start ---------- */

if (DEMO) load();
else if (!ENDPOINT) show('setup');
else if (key) load();
else show('login');
