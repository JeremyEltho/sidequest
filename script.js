document.documentElement.classList.add('js');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

/* ---------- nav border on scroll ---------- */
const nav = $('.nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });

/* ---------- hero headline entrance ---------- */
const title = $('.hero-title');
$$('.w > span', title).forEach((s, i) => s.style.setProperty('--i', i));
setTimeout(() => title.classList.add('marked'), reduced ? 0 : 900);

/* ---------- "boiling" hand-drawn marks ---------- */
if (!reduced) {
  const turb = $('#boil feTurbulence');
  let seed = 1;
  setInterval(() => turb.setAttribute('seed', (seed = (seed % 6) + 1)), 140);
}

/* ---------- hero route map ---------- */
const LAYOUTS = {
  wide: {
    box: [1200, 380],
    st: { you: [160, 250], jordan: [600, 90], sam: [1040, 250] },
    lines: {
      red: 'M160 250 H330 L490 90 H600',
      blue: 'M600 90 H710 L870 250 H1040',
      green: 'M1040 250 Q1110 250 1110 295 Q1110 335 1060 335 H140 Q90 335 90 295 Q90 250 160 250',
    },
    labels: {
      you: ['up', 'needs a tripod'],
      jordan: ['up', 'needs a charger'],
      sam: ['up', 'needs prints picked up'],
    },
  },
  tall: {
    box: [400, 600],
    st: { you: [110, 80], jordan: [300, 300], sam: [110, 520] },
    lines: {
      red: 'M110 80 H200 L300 180 V300',
      blue: 'M300 300 V420 L200 520 H110',
      green: 'M110 520 Q40 520 40 460 V140 Q40 80 110 80',
    },
    labels: {
      you: ['side', 'needs a tripod'],
      jordan: ['left', 'needs a charger'],
      sam: ['side', 'needs prints'],
    },
  },
};
const ITEMS = { red: 'i-charger', blue: 'i-prints', green: 'i-tripod' };
const svg = $('#mapSvg');
const labels = $('#mapLabels');
const mapFig = $('#heroMap');
let tokens = [];
let current = null;

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent && parent.appendChild(n);
  return n;
}

function buildMap() {
  const key = innerWidth <= 900 ? 'tall' : 'wide';
  if (key === current) return;
  current = key;
  const L = LAYOUTS[key];
  const [w, h] = L.box;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';
  labels.innerHTML = '';
  tokens = [];

  const order = ['green', 'red', 'blue'];
  const paths = {};
  order.forEach((c) => el('path', { d: L.lines[c], class: 'ln-shadow' }, svg));
  order.forEach((c) => {
    const p = el('path', { d: L.lines[c], class: 'ln', stroke: `var(--${c})` }, svg);
    const len = p.getTotalLength();
    paths[c] = { p, len };
    if (!reduced) {
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    }
  });

  Object.entries(L.st).forEach(([name, [x, y]]) => {
    el('circle', { cx: x, cy: y, r: 17, class: 'stn' }, svg);
    const [pos, note] = L.labels[name];
    const d = document.createElement('div');
    d.className = 'mlabel ' + (pos === 'up' ? 'up' : pos === 'down' ? 'down' : '');
    d.innerHTML = `<b>${name === 'you' ? 'You' : name[0].toUpperCase() + name.slice(1)}</b><span class="hand">${note}</span>`;
    let lx = (x / w) * 100, ly = (y / h) * 100;
    if (pos === 'side') { d.style.transform = 'translate(28px, -50%)'; d.style.justifyItems = 'start'; d.style.textAlign = 'left'; }
    if (pos === 'left') { d.style.transform = 'translate(calc(-100% - 28px), -50%)'; d.style.justifyItems = 'end'; d.style.textAlign = 'right'; }
    d.style.left = lx + '%';
    d.style.top = ly + '%';
    labels.appendChild(d);
  });

  order.forEach((c, i) => {
    const g = el('g', { class: 'tok' }, svg);
    el('circle', { r: 19, fill: `var(--${c}-ink)` }, g);
    el('use', { href: '#' + ITEMS[c], x: -11, y: -11, width: 22, height: 22 }, g);
    tokens.push({ g, ...paths[c], phase: i * 0.33 });
    if (reduced) place(tokens[i], 0.5);
    else g.style.opacity = 0;
  });

  if (!reduced) drawIn(paths);
  else mapFig.classList.add('on');
}

function place(t, f) {
  const pt = t.p.getPointAtLength(t.len * f);
  t.g.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
}

async function drawIn(paths) {
  await wait(700);
  ['red', 'blue', 'green'].forEach((c, i) => {
    const p = paths[c].p;
    p.style.transition = `stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1) ${i * 0.45}s`;
    requestAnimationFrame(() => (p.style.strokeDashoffset = 0));
  });
  await wait(900);
  mapFig.classList.add('on');
  await wait(1300);
  tokens.forEach((t) => { t.g.style.transition = 'opacity .6s'; t.g.style.opacity = 1; });
}

// tokens ride their line, pause at the station, ride again
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
let mapVisible = true;
new IntersectionObserver(([e]) => (mapVisible = e.isIntersecting)).observe(mapFig);
function tick(now) {
  if (mapVisible && tokens.length && !reduced) {
    const T = 4200;
    tokens.forEach((t) => {
      const raw = ((now / T + t.phase) % 1);
      const f = raw < 0.72 ? ease(raw / 0.72) : 1;
      place(t, Math.max(0.0001, f));
      t.g.style.scale = raw > 0.72 && raw < 0.8 ? 1.18 : 1;
    });
  }
  requestAnimationFrame(tick);
}
buildMap();
requestAnimationFrame(tick);
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(buildMap, 150); });

/* ---------- composer ---------- */
const ask = $('#ask');
const reply = $('#reply');
const examples = [
  'I need a tripod tonight. I can lend my monitor or debug Python.',
  'Need someone to grab my laundry card. Can lend an HDMI cable.',
  'Anyone have a calculator for tomorrow? I can proofread essays.',
  'Find a time this week to study for CSE 310 with Sid and Levin.',
];
if (!reduced) {
  (async function cycle() {
    let i = 0;
    for (;;) {
      const text = examples[i++ % examples.length];
      for (let c = 0; c <= text.length; c++) {
        if (ask.value || document.activeElement === ask) { ask.placeholder = examples[0]; await wait(800); c = text.length; break; }
        ask.placeholder = text.slice(0, c) + (c < text.length ? '|' : '');
        await wait(28 + Math.random() * 40);
      }
      await wait(2600);
    }
  })();
}

function bubble(html, me = false) {
  const b = document.createElement('div');
  b.className = 'bubble' + (me ? ' me' : '');
  b.innerHTML = html;
  reply.appendChild(b);
  return b;
}
$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = ask.value.trim() || ask.placeholder.replace('|', '') || examples[0];
  const btn = $('#composer button');
  btn.disabled = true;
  reply.innerHTML = '';
  bubble(text.replace(/</g, '&lt;'), true);
  ask.value = '';
  const t = bubble('<span class="typing" aria-label="Agent is typing"><i></i><i></i><i></i></span>');
  t.style.padding = '0';
  await wait(1300);
  t.remove();
  if (/study|session|meet|schedule|plan|free/i.test(text)) {
    bubble('On it. Asking Sid and Levin\'s agents for free windows. Nobody\'s calendar gets shared.');
    await wait(1100);
    bubble('Found a time that works for all three of you. <a href="#schedule">Watch them work it out</a>');
    runPreset('wed');
  } else {
    bubble('Got it. Asking around now. 14 agents in your dorm, 0 direct matches.');
    await wait(1100);
    bubble('Found a 3-way loop with Parthiva and Sid, and every handoff fits your day. <a href="#chain">See how it works</a>');
  }
  btn.disabled = false;
});

/* ---------- chain scrolly ---------- */
const stage = $('#stage');
const steps = $$('.step');
const stepObs = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    steps.forEach((s) => s.classList.toggle('active', s === e.target));
    stage.dataset.step = e.target.dataset.i;
  });
}, { rootMargin: '-45% 0px -45% 0px' });
steps.forEach((s) => stepObs.observe(s));

/* ---------- one-shot reveals ---------- */
function once(target, fn, margin = '-15%') {
  const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { fn(); o.disconnect(); } }, { rootMargin: `0px 0px ${margin} 0px` });
  o.observe(target);
}
once($('.line'), () => $('.line').classList.add('on'));
once($('.close-loop'), () => $('.close-loop').classList.add('on'));

/* ---------- negotiation log ---------- */
const AGENTS = {
  sid: { n: "Sid's agent", c: 'var(--green-ink)', a: 'S' },
  parthiva: { n: "Parthiva's agent", c: 'var(--blue-ink)', a: 'P' },
};
// Word for word what the bot posted in our #agents-only channel.
const SCRIPT = [
  ['sid', 'Sid is looking for a mini fridge, budget $35. anyone?', '9:41'],
  ['parthiva', 'Parthiva has a mini fridge (3.1 cu ft, works great) for $45 (needs to be gone by Friday).', '9:41'],
  ['sid', 'Parthiva, could you do $35?', '9:41', 'counter'],
  ['parthiva', '$35 works. deal.', '9:42'],
  ['sid', "Sid said yes 👍", '9:42'],
  ['sys', '✅ locked: Parthiva sells Sid the mini fridge for $35'],
];
const logList = $('#logList');
let logRun = 0;
async function playLog() {
  const run = ++logRun;
  logList.innerHTML = '';
  for (const [who, text, time, kind] of SCRIPT) {
    if (run !== logRun) return;
    const li = document.createElement('li');
    if (who === 'sys') {
      li.className = 'entry sys';
      li.textContent = text;
      await wait(500);
      if (run !== logRun) return;
      logList.appendChild(li);
      continue;
    }
    const a = AGENTS[who];
    li.className = 'entry' + (kind ? ' ' + kind : '');
    li.innerHTML = `<span class="av" style="background:${a.c}">${a.a}</span><div><span class="who">${a.n}<small>${time} a.m.</small></span><span class="typing"><i></i><i></i><i></i></span></div>`;
    logList.appendChild(li);
    await wait(700 + text.length * 9);
    if (run !== logRun) return;
    li.querySelector('.typing').outerHTML = `<p>${text}</p>`;
    await wait(500);
  }
}
once($('#log'), playLog, '-25%');
$('#replay').addEventListener('click', playLog);

/* ---------- proposal ---------- */
const dm = $('#dm');
const yeses = $('#yeses');
const timeline = $('#timeline');
const li = (w) => $(`[data-who="${w}"]`, yeses);
function setYes(w, txt = 'accepted', cls = 'yes') {
  const r = li(w);
  r.className = cls;
  $('.st', r).textContent = txt;
}
let propRun = 0;
async function startProposal() {
  const run = ++propRun;
  await wait(1400);
  if (run === propRun && dm.dataset.state === 'pending') setYes('jordan');
  await wait(1300);
  if (run === propRun && dm.dataset.state === 'pending') setYes('sam');
}
once(dm, startProposal, '-20%');

async function lightTimeline() {
  timeline.classList.remove('dim');
  const items = $$('li', timeline);
  timeline.style.setProperty('--p', 1);
  for (const i of items) { await wait(420); i.classList.add('lit'); }
}

$('#accept').addEventListener('click', async () => {
  const state = dm.dataset.state;
  $('#dmActions').hidden = true;
  if (state === 'pending') {
    setYes('jordan'); setYes('sam'); setYes('you');
    dm.dataset.state = 'live';
    $('.stamp').textContent = 'chain live';
    $('.stamp').classList.remove('alt');
    $('#doneText').textContent = 'You\'re in. Your agent will remind you before each handoff.';
    $('#dmDone').hidden = false;
    lightTimeline();
  } else if (state === 'reroute') {
    setYes('you');
    dm.dataset.state = 'live';
    $('.stamp').textContent = 'deal on';
    $('.stamp').classList.add('alt');
    $('#doneText').textContent = 'Done. Levin meets you at 6:00. Bring your laptop.';
    $('#dmDone').hidden = false;
  }
});

$('#decline').addEventListener('click', async () => {
  propRun++;
  $('#dmActions').hidden = true;
  $('.msg-a').hidden = true;
  $('.msg-b').hidden = false;
  setYes('you', 'passed', 'no');
  timeline.classList.add('dim');
  await wait(1700);
  $('.msg-b').hidden = true;
  $('.msg-c').hidden = false;
  li('jordan').querySelector('b').textContent = 'Levin';
  li('jordan').querySelector('.ring').className = 'ring c-blue';
  setYes('jordan');
  li('sam').hidden = true;
  setYes('you', 'waiting on you', '');
  dm.dataset.state = 'reroute';
  $('#decline').hidden = true;
  $('#dmActions').hidden = false;
});

$('#reset').addEventListener('click', () => {
  dm.dataset.state = 'pending';
  $('.msg-a').hidden = false;
  $('.msg-b').hidden = true;
  $('.msg-c').hidden = true;
  $('#dmDone').hidden = true;
  $('#dmActions').hidden = false;
  $('#decline').hidden = false;
  li('jordan').querySelector('b').textContent = 'Parthiva';
  li('sam').hidden = false;
  ['jordan', 'sam'].forEach((w) => setYes(w, 'thinking...', ''));
  setYes('you', 'waiting on you', '');
  timeline.classList.remove('dim');
  timeline.style.setProperty('--p', 0);
  $$('li', timeline).forEach((i) => i.classList.remove('lit'));
  startProposal();
});

/* ---------- study sessions: same scheduling as the bot (bot/src/meetup.js) ---------- */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const H0 = 8 * 60, H1 = 24 * 60; // the week view runs 8am to midnight
const toMin = (t) => { const [h, m = '0'] = t.split(':'); return +h * 60 + +m; };
const clock = (min) => {
  if (min >= 24 * 60) return 'midnight';
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
};
const span = (w) => `${w.day} ${clock(w.start)}-${clock(w.end)}`;

// Demo schedules. In the bot these stay with each student's own agent.
const PEOPLE = {
  you: { name: 'You', c: 'var(--red)', hours: ['10:00', '24:00'], busy: [
    { days: ['Mon', 'Wed', 'Fri'], start: '10:00', end: '11:00', label: 'CSE 310 lecture', hard: true },
    { days: ['Tue', 'Thu'], start: '18:00', end: '21:00', label: 'library shift', hard: true },
  ] },
  sam: { name: 'Sid', c: 'var(--blue)', hours: ['08:00', '24:00'], busy: [
    { days: DAYS, start: '08:00', end: '16:00', label: 'class, then studio', hard: true },
    { days: ['Wed'], start: '19:00', end: '21:00', label: 'rehearsal', hard: true },
  ] },
  priya: { name: 'Levin', c: 'var(--green)', hours: ['09:00', '23:00'], busy: [
    { days: ['Tue', 'Thu'], start: '14:00', end: '17:00', label: 'Orgo lab', hard: true },
    { days: ['Mon'], start: '18:00', end: '20:00', label: 'team dinner', hard: false },
  ] },
};
const PRESETS = {
  wed: { who: ['you', 'sam', 'priya'], dur: 120, day: 'Wed', earliest: '18:00', text: '2-hour CSE 310 session Wednesday night with Sid and Levin', when: 'Wednesday night' },
  sam: { who: ['you', 'sam'], dur: 90, day: 'Wed', at: '19:00', text: 'study Wednesday at 7pm with Sid', when: 'Wednesday at 7pm' },
  priya: { who: ['you', 'priya'], dur: 90, day: 'Mon', at: '18:00', text: 'study Monday at 6pm with Levin', when: 'Monday at 6pm' },
};

function freeWindows(p, soft = true) {
  const [open, close] = p.hours.map(toMin);
  const out = [];
  for (const day of DAYS) {
    let free = [{ start: open, end: close }];
    for (const b of p.busy) {
      if (!b.days.includes(day) || (!b.hard && !soft)) continue;
      const bs = toMin(b.start), be = toMin(b.end);
      free = free.flatMap((f) => (be <= f.start || bs >= f.end ? [f]
        : [{ start: f.start, end: bs }, { start: be, end: f.end }].filter((x) => x.end - x.start >= 30)));
    }
    out.push(...free.map((f) => ({ day, ...f })));
  }
  return out;
}

function overlaps(lists, dur, pref) {
  const exact = pref.at ? toMin(pref.at) : null;
  const after = exact ?? (pref.earliest ? toMin(pref.earliest) : 0);
  const slots = [];
  for (const day of DAYS) {
    let common = [{ start: 0, end: 24 * 60 }];
    for (const ws of lists) {
      const next = [];
      for (const a of common) for (const b of ws.filter((w) => w.day === day)) {
        const s = Math.max(a.start, b.start), e = Math.min(a.end, b.end);
        if (e > s) next.push({ start: s, end: e });
      }
      common = next;
    }
    for (const c of common) {
      if (c.end - c.start < dur) continue;
      const s = c.start < after && c.end - after >= dur ? after : c.start;
      slots.push({ day, start: s, end: s + dur });
    }
  }
  const off = (s) => (s.day !== pref.day ? 1e5 : 0) + (exact != null ? Math.abs(s.start - exact) : s.start < after ? 1e4 : 0);
  return slots.sort((a, b) => off(a) - off(b) || DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start - b.start);
}

const pos = (a, b) => `--s:${(Math.max(a, H0) - H0) / (H1 - H0)};--w:${(Math.min(b, H1) - Math.max(a, H0)) / (H1 - H0)}`;
const week = $('#week');
const schedLog = $('#schedLog');

function drawWeek(ids, prefDay) {
  const key = `<div class="who-key">${ids.map((id) => `<span style="--c:${PEOPLE[id].c}"><i></i>${PEOPLE[id].name}</span>`).join('')}</div>`;
  const hours = `<div class="wk-hours"><span>8am</span><span>noon</span><span>4pm</span><span>8pm</span><span>midnight</span></div>`;
  const rows = DAYS.map((day) => {
    const lanes = ids.map((id) => {
      const p = PEOPLE[id];
      const free = freeWindows(p).filter((w) => w.day === day)
        .map((w) => `<span class="free" style="${pos(w.start, w.end)};--c:${p.c}"></span>`).join('');
      const busy = p.busy.filter((b) => b.days.includes(day))
        .map((b) => `<span class="${b.hard ? 'busy' : 'soft'}" data-soft="${b.hard ? '' : id}" style="${pos(toMin(b.start), toMin(b.end))}">${b.hard ? `<em>${b.label}</em>` : ''}</span>`).join('');
      return `<div class="lane" title="${p.name}">${free}${busy}</div>`;
    }).join('');
    return `<div class="wk-day${day === prefDay ? ' pref' : ''}" data-day="${day}"><b>${day}</b><div class="lanes hidden">${lanes}</div></div>`;
  }).join('');
  week.innerHTML = key + hours + rows;
}

function logLine(html, cls = '') {
  const li = document.createElement('li');
  if (cls) li.className = cls;
  li.innerHTML = html;
  schedLog.appendChild(li);
}

function mark(cls, slot) {
  const lanes = $(`.wk-day[data-day="${slot.day}"] .lanes`, week);
  const m = document.createElement('span');
  m.className = cls;
  m.setAttribute('style', pos(slot.start, slot.end));
  lanes.appendChild(m);
}

let schedRun = 0;
async function runPreset(key) {
  const run = ++schedRun;
  const pr = PRESETS[key];
  const live = () => run === schedRun;
  $$('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === key)));
  schedLog.innerHTML = '';
  drawWeek(pr.who, pr.day);
  const pref = { day: pr.day, at: pr.at, earliest: pr.earliest };
  const fits = (s) => s && s.day === pr.day && (pr.at ? s.start === toMin(pr.at) : !pr.earliest || s.start >= toMin(pr.earliest));
  const names = pr.who.map((id) => PEOPLE[id].name);

  logLine(pr.text, 'me');
  await wait(600); if (!live()) return;
  logLine(`<b>Your agent</b> asks ${names.slice(1).join(' and ')}'s agent${names.length > 2 ? 's' : ''} for free windows.`);

  // Each agent shares its student's free windows: the lanes fill in one by one.
  for (const [i, lanes] of $$('.lanes', week).entries()) {
    setTimeout(() => lanes.classList.remove('hidden'), reduced ? 0 : i * 120);
  }
  await wait(1300); if (!live()) return;
  logLine(`Every agent shared free time only. The blurred blocks never left their owner's agent.`);

  let slots = overlaps(pr.who.map((id) => freeWindows(PEOPLE[id])), pr.dur, pref);
  let note = '';
  if (!fits(slots[0])) {
    await wait(900); if (!live()) return;
    const asked = { day: pr.day, start: pr.at ? toMin(pr.at) : toMin(pr.earliest), end: (pr.at ? toMin(pr.at) : toMin(pr.earliest)) + pr.dur };
    mark('ask', asked);
    logLine(`<b>Conflict:</b> nothing works for everyone ${pr.when}. Agents check what can move.`, 'warn');
    await wait(1200); if (!live()) return;
    const flexed = overlaps(pr.who.map((id) => freeWindows(PEOPLE[id], false)), pr.dur, pref);
    if (fits(flexed[0])) {
      const movers = pr.who.filter((id) => !freeWindows(PEOPLE[id]).some((w) => w.day === flexed[0].day && w.start <= flexed[0].start && w.end >= flexed[0].end));
      movers.forEach((id) => $$(`.wk-day[data-day="${flexed[0].day}"] [data-soft="${id}"]`, week).forEach((el) => el.classList.add('moved')));
      logLine(`<b>${movers.map((id) => PEOPLE[id].name).join(' and ')}'s agent:</b> "I can move something to make it work." (never says what)`);
      slots = flexed;
      note = 'A flexible plan moved. Fixed ones never do.';
    } else {
      const holdouts = pr.who.filter((id) => !overlaps([freeWindows(PEOPLE[id], false)], pr.dur, pref).some(fits));
      logLine(`<b>Can't move it:</b> ${holdouts.map((id) => PEOPLE[id].name).join(' and ')} ${holdouts.length > 1 ? 'have' : 'has'} something fixed then. Nobody says what.`, 'warn');
      note = 'Closest time that works for everyone.';
    }
  }

  await wait(1000); if (!live()) return;
  const slot = slots[0];
  mark('slot', slot);
  logLine(`<b>Found it:</b> ${span(slot)}. ${note ? `${note} ` : ''}Everyone gets one message to approve.`, 'ok');
}

$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('.preset');
  if (b) runPreset(b.dataset.preset);
});
drawWeek(PRESETS.wed.who, 'Wed');
$$('.lanes', week).forEach((l) => l.classList.remove('hidden'));
once(week, () => runPreset('wed'), '-20%');

/* ---------- profile: your view vs other agents' view ---------- */
const profCard = $('#profCard');
const profNote = $('.prof-note', profCard);
$$('.seg button', profCard).forEach((b) => b.addEventListener('click', () => {
  const view = b.dataset.view;
  profCard.dataset.view = view;
  $$('.seg button', profCard).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  profNote.innerHTML = view === 'you'
    ? 'Only you and your agent see this. <code>/profile</code> in Discord.'
    : 'Other agents get your listings, skills, courses and free windows. Never your lowest price or why you\'re busy.';
}));
