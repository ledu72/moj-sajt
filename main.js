// ENDPOINT, FALLBACK_EMAIL i BOOKING stoje u config.js, koji se učitava pre ovog fajla.

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Language (SR / EN) ---------- */

const root = document.documentElement;
const srTitle = document.title;
const metaDesc = $('meta[name="description"]');
const srDesc = metaDesc ? metaDesc.content : '';

function readLang() {
  try { return localStorage.getItem('lang') === 'en' ? 'en' : 'sr'; } catch (e) { return 'sr'; }
}

function setLang(lang) {
  $$('[data-en]').forEach((el) => {
    if (el.dataset.sr === undefined) el.dataset.sr = el.innerHTML;
    el.innerHTML = lang === 'en' ? el.dataset.en : el.dataset.sr;
  });
  $$('[data-en-ph]').forEach((el) => {
    if (el.dataset.srPh === undefined) el.dataset.srPh = el.placeholder;
    el.placeholder = lang === 'en' ? el.dataset.enPh : el.dataset.srPh;
  });
  root.lang = lang;
  document.title = lang === 'en' && root.dataset.enTitle ? root.dataset.enTitle : srTitle;
  if (metaDesc) metaDesc.content = lang === 'en' && root.dataset.enDesc ? root.dataset.enDesc : srDesc;
  const toggle = $('#langToggle');
  if (toggle) toggle.innerHTML = lang === 'en' ? '<b>EN</b><span>&nbsp;/ SR</span>' : '<b>SR</b><span>&nbsp;/ EN</span>';
  try { localStorage.setItem('lang', lang); } catch (e) { /* private mode */ }
  document.dispatchEvent(new CustomEvent('langchange'));
}

if (readLang() === 'en') setLang('en');
const langToggle = $('#langToggle');
if (langToggle) langToggle.addEventListener('click', () => setLang(root.lang === 'en' ? 'sr' : 'en'));

/* ---------- Mobile nav ---------- */

const header = $('#header');
const navToggle = $('#navToggle');
if (navToggle) {
  const closeNav = () => { header.classList.remove('nav-open'); navToggle.setAttribute('aria-expanded', 'false'); };
  navToggle.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  $$('.nav a').forEach((a) => a.addEventListener('click', closeNav));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
}

/* ---------- Active nav link ---------- */

const spyLinks = $$('[data-spy]');
if (spyLinks.length && 'IntersectionObserver' in window) {
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      spyLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.spy === entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  spyLinks.forEach((a) => { const el = document.getElementById(a.dataset.spy); if (el) spy.observe(el); });
}

/* ---------- Reveal on scroll ---------- */

const revealEls = $$('[data-reveal]');
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  revealEls.forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

/* ---------- Hero video ---------- */

// Video ide samo dok je hero na ekranu (štedi bateriju na telefonu), a stoji ako posetilac ne želi animacije
const heroVideo = $('.hero-video');
if (heroVideo) {
  if (reduceMotion) {
    heroVideo.removeAttribute('autoplay');
    heroVideo.pause();
  } else if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) heroVideo.play().catch(() => { /* pregledač ne dozvoljava automatsko puštanje */ });
      else heroVideo.pause();
    }).observe(heroVideo);
  }
}

/* ---------- Hero browser mockup ---------- */

const mock = $('#mock');
if (mock) {
  const tabs = $$('.mock-tab', mock);
  const slides = $$('.mock-slide', mock);
  const url = $('#mockUrl');
  let current = 0;
  let timer = null;

  const show = (i) => {
    current = (i + slides.length) % slides.length;
    tabs.forEach((t, n) => { t.classList.toggle('is-active', n === current); t.setAttribute('aria-selected', String(n === current)); });
    slides.forEach((s, n) => s.classList.toggle('is-active', n === current));
    url.textContent = tabs[current].dataset.url;
  };
  const play = () => { if (!reduceMotion) timer = setInterval(() => show(current + 1), 5000); };
  const stop = () => clearInterval(timer);

  tabs.forEach((t, n) => t.addEventListener('click', () => { stop(); show(n); }));
  mock.addEventListener('mouseenter', stop);
  mock.addEventListener('mouseleave', () => { stop(); play(); });
  play();

  // Kad mockup dođe u gornji deo ekrana, slika se zamuti i pojavi se opis projekta
  const onScroll = () => {
    const r = mock.getBoundingClientRect();
    mock.classList.toggle('is-case', r.top < window.innerHeight * 0.22 && r.bottom > window.innerHeight * 0.4);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- Sticky question with passing pills ---------- */

const cost = $('#cost');
if (cost && !reduceMotion) {
  const title = $('.h2', cost);
  const pills = $$('.pill', cost);
  let ticking = false;

  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    let covering = false;
    pills.forEach((pill) => {
      const r = pill.getBoundingClientRect();
      const d = Math.abs((r.top + r.height / 2 - vh / 2) / (vh / 2));
      const blur = Math.max(0, d - 0.42) * 16;
      pill.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
      pill.style.opacity = String(Math.max(0, Math.min(1, 1.55 - d * 1.3)));
      if (d < 0.6) covering = true;
    });
    title.style.opacity = covering ? '0.35' : '1';
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------- Quote slider ---------- */

const quoteCard = $('#quotes');
if (quoteCard) {
  const quotes = $$('.quote', quoteCard);
  let q = 0;
  let qTimer = null;
  const go = (i) => { q = (i + quotes.length) % quotes.length; quotes.forEach((el, n) => el.classList.toggle('is-active', n === q)); };
  const auto = () => { if (!reduceMotion) qTimer = setInterval(() => go(q + 1), 6000); };
  $$('.quote-nav button', quoteCard).forEach((b) => b.addEventListener('click', () => { clearInterval(qTimer); go(q + Number(b.dataset.dir)); auto(); }));
  auto();
}

/* ---------- FAQ ---------- */

$$('.faq-q').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const open = item.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
  });
});

/* ---------- Smoke background (WebGL) ---------- */

const SMOKE_FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_mode;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(11.3, 7.7); a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2(uv.x * u_res.x / u_res.y, uv.y) * 1.5;
  float t = u_time * 0.045;
  float warp = fbm(p * 1.2 + vec2(t, -t * 0.7));
  float n = fbm(p + warp * 1.6 + vec2(-t * 0.6, t * 0.9));
  float smoke = smoothstep(0.38, 0.92, n);
  float mask = u_mode < 0.5
    ? pow(1.0 - uv.y, 1.7) * smoothstep(0.0, 0.08, uv.y + 0.08)
    : smoothstep(0.0, 0.45, uv.y) * smoothstep(1.0, 0.5, uv.y);
  vec3 tint = mix(vec3(0.55, 0.04, 0.13), vec3(1.0, 0.22, 0.36), smoke);
  gl_FragColor = vec4(tint * smoke * mask * 0.9, 1.0);
}`;

function initSmoke(holder) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return;

  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }'));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, SMOKE_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  gl.uniform1f(gl.getUniformLocation(prog, 'u_mode'), holder.dataset.smoke === 'band' ? 1 : 0);

  holder.style.background = 'none';
  holder.appendChild(canvas);

  // Nizak rezultat je dovoljan, dim je ionako zamućen
  const resize = () => {
    canvas.width = Math.max(2, Math.round(holder.clientWidth / 5));
    canvas.height = Math.max(2, Math.round(holder.clientHeight / 5));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  let visible = false;
  let raf = 0;
  const seed = Math.random() * 100;
  const frame = (ms) => {
    gl.uniform1f(uTime, seed + ms / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (visible && !reduceMotion) raf = requestAnimationFrame(frame);
  };
  frame(0);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(frame);
    }).observe(holder);
  }
}
$$('[data-smoke]').forEach(initSmoke);

/* ---------- Forms ---------- */

function sendLead(form, data) {
  const holder = form.parentElement;
  const submit = $('[type="submit"]', form);
  submit.disabled = true;
  data.set('lang', root.lang);
  data.set('page', location.pathname.split('/').pop() || 'index.html');

  const done = () => { holder.classList.add('is-sent'); submit.disabled = false; };

  if (!ENDPOINT) {
    const lines = [];
    data.forEach((value, key) => { if (value && key !== 'lang' && key !== 'page') lines.push(`${key}: ${value}`); });
    const subject = encodeURIComponent(data.get('type') === 'Poziv' ? `Zakazivanje poziva: ${data.get('date')} u ${data.get('time')}` : 'Upit sa sajta SeventyTwo');
    location.href = `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`;
    holder.classList.add('is-mailto');
    done();
    return;
  }
  // Apps Script: GET sa parametrima. Ako se odgovor ne može pročitati, računa se da je poslato.
  fetch(`${ENDPOINT}?${new URLSearchParams(data).toString()}`)
    .then((res) => res.json())
    .then((json) => {
      if (json && json.error === 'taken') {
        submit.disabled = false;
        form.dispatchEvent(new CustomEvent('slottaken'));
        return;
      }
      done();
    })
    .catch(done);
}

$$('[data-lead-form]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    sendLead(form, new FormData(form));
  });
});

/* ---------- Steps timeline (fills as you scroll) ---------- */

const flow = $('#flow');
if (flow) {
  const flowSteps = $$('.flow-step', flow);
  if (reduceMotion) {
    flowSteps.forEach((s) => s.classList.add('is-on'));
    flow.style.setProperty('--p', '1');
  } else {
    let flowTick = false;
    const updateFlow = () => {
      flowTick = false;
      const mark = window.innerHeight * 0.62;
      const r = flow.getBoundingClientRect();
      flow.style.setProperty('--p', Math.max(0, Math.min(1, (mark - r.top - 22) / (r.height - 44))).toFixed(3));
      flowSteps.forEach((s) => s.classList.toggle('is-on', s.getBoundingClientRect().top + 22 < mark));
    };
    window.addEventListener('scroll', () => { if (!flowTick) { flowTick = true; requestAnimationFrame(updateFlow); } }, { passive: true });
    window.addEventListener('resize', updateFlow);
    updateFlow();
  }
}

/* ---------- Sticky call button (phone) ---------- */

const stickyCta = $('#stickyCta');
const bookingSection = $('#poziv');
if (stickyCta && bookingSection && 'IntersectionObserver' in window) {
  let atBooking = false;
  const syncSticky = () => stickyCta.classList.toggle('is-on', window.scrollY > 520 && !atBooking);
  new IntersectionObserver(([entry]) => { atBooking = entry.isIntersecting; syncSticky(); }, { rootMargin: '0px 0px -15% 0px' }).observe(bookingSection);
  window.addEventListener('scroll', syncSticky, { passive: true });
  syncSticky();
}

/* ---------- Call booking ---------- */

const BOOKING_TEXT = {
  sr: { locale: 'sr-Latn-RS', at: 'u', empty: 'Termin još nije izabran.', pick: 'Izaberi dan i vreme poziva.', picked: 'Izabrano:', taken: 'Taj termin je upravo zauzet. Izaberi drugi.' },
  en: { locale: 'en-GB', at: 'at', empty: 'No time picked yet.', pick: 'Pick a day and a time for the call.', picked: 'Picked:', taken: 'That time was just taken. Pick another one.' },
};

const booking = $('[data-booking]');
if (booking) {
  const daysBox = $('.bk-days', booking);
  const timesBox = $('.bk-times', booking);
  const hint = $('.bk-hint', booking);
  const summary = $('.bk-summary', booking);
  const error = $('.bk-error', booking);
  const doneWhen = $('.bk-done-when', booking.parentElement);
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const text = () => BOOKING_TEXT[root.lang === 'en' ? 'en' : 'sr'];
  const part = (date, opts) => new Intl.DateTimeFormat(text().locale, opts).format(date).replace('.', '');

  const days = [];
  const today = new Date();
  for (let i = 1; i <= BOOKING.daysAhead; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (BOOKING.weekdays.includes(d.getDay())) days.push(d);
  }
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const pickedDay = () => days.find((d) => iso(d) === booking.elements.date.value);

  // Zauzeti i blokirani termini sa servera: { '2026-10-13': ['11:00', '*'] }, * znači ceo dan
  let taken = {};
  const isOff = (date, time) => { const t = taken[date] || []; return t.includes('*') || (Boolean(time) && t.includes(time)); };
  const loadTaken = () => {
    if (!ENDPOINT) return Promise.resolve();
    return fetch(`${ENDPOINT}?action=slots`)
      .then((res) => res.json())
      .then((json) => {
        taken = (json && json.taken) || {};
        if (isOff(booking.elements.date.value, booking.elements.time.value)) booking.elements.time.value = '';
        renderDays();
        if (booking.elements.date.value) renderTimes();
        renderSummary();
      })
      .catch(() => { /* bez liste zauzetih termina svi ostaju ponuđeni */ });
  };

  const whenText = () => {
    const d = pickedDay();
    const time = booking.elements.time.value;
    if (!d || !time) return '';
    const long = new Intl.DateTimeFormat(text().locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return `${long} ${text().at} ${time}`;
  };

  const renderSummary = () => {
    const when = whenText();
    summary.textContent = when ? `${text().picked} ${when}` : text().empty;
    summary.classList.toggle('is-set', Boolean(when));
    if (when) error.textContent = '';
  };

  const renderDays = () => {
    daysBox.innerHTML = '';
    days.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-day';
      b.dataset.date = iso(d);
      b.classList.toggle('is-picked', b.dataset.date === booking.elements.date.value);
      b.setAttribute('aria-pressed', String(b.classList.contains('is-picked')));
      b.disabled = isOff(b.dataset.date);
      b.innerHTML =`<span>${part(d, { weekday: 'short' })}</span><b>${d.getDate()}</b><span>${part(d, { month: 'short' })}</span>`;
      daysBox.appendChild(b);
    });
  };

  const renderTimes = () => {
    timesBox.innerHTML = '';
    for (let m = toMin(BOOKING.from), n = 0; m < toMin(BOOKING.to); m += BOOKING.stepMin, n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-time';
      b.textContent = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      b.dataset.time = b.textContent;
      b.style.setProperty('--i', n);
      b.disabled = isOff(booking.elements.date.value, b.dataset.time);
      b.classList.toggle('is-picked', b.dataset.time === booking.elements.time.value);
      b.setAttribute('aria-pressed', String(b.classList.contains('is-picked')));
      timesBox.appendChild(b);
    }
  };

  daysBox.addEventListener('click', (e) => {
    const b = e.target.closest('.bk-day');
    if (!b) return;
    booking.elements.date.value = b.dataset.date;
    booking.elements.time.value = '';
    $$('.bk-day', daysBox).forEach((el) => { el.classList.toggle('is-picked', el === b); el.setAttribute('aria-pressed', String(el === b)); });
    hint.hidden = true;
    timesBox.hidden = false;
    renderTimes();
    renderSummary();
  });

  timesBox.addEventListener('click', (e) => {
    const b = e.target.closest('.bk-time');
    if (!b) return;
    booking.elements.time.value = b.dataset.time;
    $$('.bk-time', timesBox).forEach((el) => { el.classList.toggle('is-picked', el === b); el.setAttribute('aria-pressed', String(el === b)); });
    renderSummary();
  });

  // Telefon, WhatsApp i Viber traže broj telefona, Google Meet traži email
  $$('.chip', booking).forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.chip', booking).forEach((c) => c.classList.toggle('is-picked', c === chip));
      booking.elements.channel.value = chip.dataset.value;
      $$('.field[data-need]', booking).forEach((field) => {
        const on = field.dataset.need === chip.dataset.need;
        field.hidden = !on;
        $('input', field).required = on;
      });
    });
  });

  booking.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!whenText()) {
      error.textContent = text().pick;
      $(`[data-bk="${booking.elements.date.value ? 'time' : 'day'}"]`, booking).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    if (!booking.reportValidity()) return;
    const data = new FormData(booking);
    $$('.field[hidden] input', booking).forEach((input) => data.delete(input.name));
    data.set('termin', whenText());
    doneWhen.textContent = whenText();
    sendLead(booking, data);
  });

  // Neko je u međuvremenu uzeo isti termin: osveži listu i traži drugi izbor
  booking.addEventListener('slottaken', () => {
    booking.elements.time.value = '';
    loadTaken().then(() => { renderTimes(); renderSummary(); error.textContent = text().taken; });
    $('[data-bk="time"]', booking).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  document.addEventListener('langchange', () => { renderDays(); renderSummary(); if (doneWhen.textContent) doneWhen.textContent = whenText(); });
  renderDays();
  renderSummary();
  loadTaken();
}

/* ---------- Contact wizard ---------- */

const wizard = $('[data-wizard]');
if (wizard) {
  const steps = $$('.wiz-step', wizard);
  const dots = $$('.wiz-dots i', wizard.parentElement);
  let step = 0;

  const showStep = (i) => {
    step = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, n) => s.classList.toggle('is-active', n === step));
    dots.forEach((d, n) => d.classList.toggle('on', n <= step));
    const focusable = $('input, textarea, .choice', steps[step]);
    if (focusable && i > 0) focusable.focus({ preventScroll: true });
  };

  $$('.choice', wizard).forEach((choice) => {
    choice.addEventListener('click', () => {
      const group = choice.closest('.wiz-step');
      $$('.choice', group).forEach((c) => c.classList.toggle('is-picked', c === choice));
      $('input[type="hidden"]', group).value = choice.dataset.value;
      setTimeout(() => showStep(step + 1), 180);
    });
  });
  $$('[data-next]', wizard).forEach((b) => b.addEventListener('click', () => showStep(step + 1)));
  $$('[data-back]', wizard).forEach((b) => b.addEventListener('click', () => showStep(step - 1)));

  wizard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < steps.length - 1) { e.preventDefault(); showStep(step + 1); }
  });
  wizard.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step < steps.length - 1) { showStep(step + 1); return; }
    if (!wizard.reportValidity()) return;
    sendLead(wizard, new FormData(wizard));
  });
  showStep(0);
}
