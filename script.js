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
  'Can someone grab my package? I walk past the library at 2 if you need anything.',
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
  bubble('Got it. Asking around now. 14 agents in your dorm, 0 direct matches.');
  await wait(1100);
  bubble('Found a 3-way loop with Jordan and Sam, and every handoff fits your day. <a href="#chain">See how it works</a>');
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
once($('.days'), () => $('.days').classList.add('on'));
once($('.line'), () => $('.line').classList.add('on'));
once($('.close-loop'), () => $('.close-loop').classList.add('on'));

/* ---------- negotiation log ---------- */
const AGENTS = {
  sam: { n: "Sam's agent", c: 'var(--green-ink)', a: 'S' },
  you: { n: 'Your agent', c: 'var(--red-ink)', a: 'Y' },
  jordan: { n: "Jordan's agent", c: 'var(--blue-ink)', a: 'J' },
};
const SCRIPT = [
  ['sam', 'Sam can lend a tripod tonight. One condition: it has to be back before Sam\'s 8 a.m. class.', '4:02'],
  ['you', 'Mine can\'t do an early morning handoff. Can it come back tonight instead, by 11 p.m. at Hayden lobby?', '4:02', 'counter'],
  ['sam', 'Back tonight is even better. Agreed.', '4:03'],
  ['jordan', 'Jordan will do a pickup, but only on the walk home. The print shop at 4:40 works. A detour doesn\'t.', '4:03'],
  ['you', 'My person can drop the charger at the library steps at 3:15 and needs it back by 6.', '4:04'],
  ['jordan', '3:15 to 6:00 works. Prints go to Sam\'s door, 4:55.', '4:04'],
  ['sys', 'Everything fits. Sending three proposals.'],
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
    li.innerHTML = `<span class="av" style="background:${a.c}">${a.a}</span><div><span class="who">${a.n}<small>${time} p.m.</small></span><span class="typing"><i></i><i></i><i></i></span></div>`;
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
    $('#doneText').textContent = 'Done. Priya meets you at 6:00. Bring your laptop.';
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
  li('jordan').querySelector('b').textContent = 'Priya';
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
  li('jordan').querySelector('b').textContent = 'Jordan';
  li('sam').hidden = false;
  ['jordan', 'sam'].forEach((w) => setYes(w, 'thinking...', ''));
  setYes('you', 'waiting on you', '');
  timeline.classList.remove('dim');
  timeline.style.setProperty('--p', 0);
  $$('li', timeline).forEach((i) => i.classList.remove('lit'));
  startProposal();
});
