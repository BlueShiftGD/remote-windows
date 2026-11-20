'use strict';

/* ================= Мелочи ================= */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 8);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') continue;
    else if (k.startsWith('aria-')) el.setAttribute(k, String(v));
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  if ('value' in props) el.value = props.value;
  return el;
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
const buzz = () => { if (state.vib && navigator.vibrate) navigator.vibrate(8); };

const dlg = $('#dlg');
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
function modal(title, body, actions = []) {
  dlg.replaceChildren(h('h2', {}, title), body, h('div', { class: 'actions' }, actions));
  if (!dlg.open) dlg.showModal();
}
const closeBtn = (text = 'Отмена') => h('button', { class: 'ghost', onclick: () => dlg.close() }, text);

/* ================= Данные ================= */
const KEY = 'pc-remote-state';
const PAD_DEFAULT = {
  up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
  a: 'K', b: 'J', x: 'I', y: 'U', l: 'Q', r: 'E', z: 'Z', start: 'ENTER',
  s1: 'W,A,S,D', s2: 'T,F,G,H'            // стики: вверх, влево, вниз, вправо
};
const COLORS = ['#2c313b', '#e5484d', '#f2a93b', '#46a758', '#3e8ef7', '#8e4ec6', '#e93d82'];

function defaults() {
  const remote = {
    id: uid(), type: 'remote', name: 'Пульт', cols: 3, buttons: [
      { id: uid(), icon: '▶', label: 'YouTube', color: '#e5484d', type: 'url', arg: 'youtube.com' },
      { id: uid(), icon: '🔴', label: 'Twitch', color: '#8e4ec6', type: 'url', arg: 'twitch.tv' },
      { id: uid(), icon: '⏯', label: 'Пауза', color: '#3e8ef7', type: 'media', arg: 'play' },
      { id: uid(), icon: '🔉', label: 'Тише', type: 'media', arg: 'vol_down' },
      { id: uid(), icon: '🔊', label: 'Громче', type: 'media', arg: 'vol_up' },
      { id: uid(), icon: '🔇', label: 'Без звука', type: 'media', arg: 'mute' },
      { id: uid(), icon: '🪟', label: 'Alt+Tab', type: 'hotkey', arg: 'alt+tab' },
      { id: uid(), icon: '🔒', label: 'Блокировка', color: '#f2a93b', type: 'system', arg: 'lock' },
      { id: uid(), icon: '⏻', label: 'Выключить', color: '#e5484d', type: 'system', arg: 'shutdown', min: 0, hold: true },
    ]
  };
  const pad = { id: uid(), type: 'pad', name: 'Геймпад', map: { ...PAD_DEFAULT } };
  return { pages: [remote, pad], active: remote.id, theme: 'dark', vib: true };
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.pages && s.pages.length) return s; } catch (e) { }
  return defaults();
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } };
let state = load();
let editMode = false;
const page = () => state.pages.find(p => p.id === state.active) || state.pages[0];

/* ================= Связь с ПК ================= */
let ws, retry, fails = 0, connected = false;
const PIN_KEY = 'pc-remote-pin';

function setStatus(ok) {
  connected = ok;
  const s = $('#status');
  s.classList.toggle('ok', ok);
  s.textContent = ok ? 'ПК' : 'Нет связи';
}
function connect() {
  clearTimeout(retry);
  if (ws && ws.readyState <= 1) return;
  const pin = localStorage.getItem(PIN_KEY);
  if (!pin) { pinDialog(); return; }
  let opened = false;
  try { ws = new WebSocket(`ws://${location.host}/ws?pin=${encodeURIComponent(pin)}`); } catch (e) { return; }
  ws.onopen = () => { opened = true; fails = 0; setStatus(true); };
  ws.onclose = () => {
    setStatus(false);
    if (!opened && ++fails >= 3) { fails = 0; pinDialog('Не удалось подключиться. Проверьте PIN и что сервер запущен.'); return; }
    retry = setTimeout(connect, 1500);
  };
  ws.onmessage = e => {
    const [cmd, ...rest] = e.data.split('|');
    const val = rest.join('|');
    if (cmd === 'err') toast('Ошибка: ' + val);
    else if (cmd === 'clip') gotClipboard(val);
  };
}
function send(msg) {
  if (ws && ws.readyState === 1) { ws.send(msg); return true; }
  toast('Нет связи с ПК');
  return false;
}
function pinDialog(msg) {
  const input = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'PIN из консоли сервера', value: localStorage.getItem(PIN_KEY) || '' });
  modal('PIN-код', h('div', {}, h('p', { class: 'hint' }, msg || 'Введите PIN, который показал сервер на ПК.'), input), [
    closeBtn(),
    h('button', { class: 'primary', onclick: () => { localStorage.setItem(PIN_KEY, input.value.trim()); dlg.close(); fails = 0; connect(); } }, 'Подключиться')
  ]);
}
function gotClipboard(text) {
  const done = () => toast('Текст с ПК скопирован');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => showClip(text));
  else showClip(text);
}
function showClip(text) {
  modal('Текст с ПК', h('textarea', { rows: 5, readonly: true }, text), [closeBtn('Закрыть')]);
}

/* ================= Действия кнопок ================= */
const TYPES = [
  ['url', 'Открыть сайт или трансляцию'],
  ['run', 'Запустить программу или команду'],
  ['hotkey', 'Сочетание клавиш'],
  ['text', 'Напечатать текст на ПК'],
  ['sendclip', 'Отправить буфер телефона на ПК'],
  ['getclip', 'Забрать буфер с ПК'],
  ['media', 'Звук и плеер'],
  ['system', 'Питание ПК'],
  ['http', 'Веб-запрос (умный дом)']
];
const MEDIA = [['vol_up', 'Громче'], ['vol_down', 'Тише'], ['mute', 'Без звука'], ['play', 'Пауза / плей'], ['next', 'Следующий трек'], ['prev', 'Предыдущий трек']];
const SYSTEM = [['lock', 'Заблокировать'], ['sleep', 'Сон'], ['restart', 'Перезагрузить'], ['shutdown', 'Выключить'], ['cancel', 'Отменить выключение']];

function runAction(b) {
  switch (b.type) {
    case 'url': { let u = (b.arg || '').trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return send('url|' + u); }
    case 'run': return send('run|' + b.arg);
    case 'hotkey': return send('hot|' + b.arg);
    case 'text': return send('txt|' + b.arg);
    case 'media': return send('media|' + b.arg);
    case 'system': return send('sys|' + (b.arg === 'shutdown' ? 'shutdown:' + (parseInt(b.min, 10) || 0) : b.arg));
    case 'http': return send(`http|${b.method || 'GET'}|${b.arg}|${b.body || ''}`);
    case 'getclip': return send('getclip');
    case 'sendclip':
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.readText().then(t => send('txt|' + t), () => toast('Нет доступа к буферу телефона'));
      } else {
        const t = prompt('Текст для отправки на ПК:');
        if (t) send('txt|' + t);
      }
      return;
  }
}

/* ================= Шапка и вкладки ================= */
function renderTabs() {
  const tabs = $('#tabs');
  tabs.replaceChildren(...state.pages.map(p => h('button', {
    class: 'tab', role: 'tab', 'aria-selected': p.id === state.active,
    onclick: () => { releaseAll(); state.active = p.id; save(); render(); }
  }, p.name)));
  const sel = $('.tab[aria-selected="true"]', tabs);
  if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function renderEditBar() {
  const bar = $('#editbar');
  const p = page();
  const name = h('input', { type: 'text', value: p.name, 'aria-label': 'Название страницы',
    oninput: e => { p.name = e.target.value || ' '; save(); renderTabs(); } });
  const items = [name];
  if (p.type === 'remote') {
    items.push(
      h('button', { class: 'chip', onclick: () => { p.cols = Math.max(1, (p.cols || 3) - 1); save(); render(); } }, 'Колонки −'),
      h('button', { class: 'chip', onclick: () => { p.cols = Math.min(6, (p.cols || 3) + 1); save(); render(); } }, 'Колонки +'));
  }
  if (p.type === 'pad') items.push(h('button', { class: 'chip', onclick: () => mapDialog(p) }, 'Раскладка клавиш'));
  if (p.type === 'touch') items.push(h('button', { class: 'chip', onclick: () => { p.speed = ((p.speed || 1.8) % 3.6) + 0.9; save(); toast('Скорость курсора: ' + p.speed.toFixed(1)); } }, 'Скорость'));
  items.push(h('button', { class: 'chip danger', onclick: () => {
    if (!confirm(`Удалить страницу «${p.name}»?`)) return;
    state.pages = state.pages.filter(x => x.id !== p.id);
    if (!state.pages.length) state.pages.push({ id: uid(), type: 'remote', name: 'Пульт', cols: 3, buttons: [] });
    state.active = state.pages[0].id; save(); render();
  } }, 'Удалить страницу'));
  bar.replaceChildren(...items);
}
function render() {
  releaseAll();
  document.body.classList.toggle('editing', editMode);
  document.body.classList.toggle('amoled', state.theme === 'amoled');
  $('#editToggle').classList.toggle('on', editMode);
  renderTabs();
  renderEditBar();
  const view = $('#view');
  const p = page();
  view.replaceChildren(p.type === 'remote' ? renderRemote(p) : p.type === 'pad' ? renderPad(p) : renderTouch(p));
}

$('#editToggle').onclick = () => { editMode = !editMode; render(); };
$('#status').onclick = () => { if (!connected) pinDialog(); };
$('#addPage').onclick = () => {
  const name = h('input', { type: 'text', placeholder: 'Название страницы' });
  const make = (type, def, title) => () => {
    state.pages.push({ id: uid(), type, name: name.value.trim() || title, ...def });
    state.active = state.pages[state.pages.length - 1].id; save(); dlg.close(); render();
  };
  const choice = (icon, title, text, fn) => h('button', { class: 'choice', onclick: fn },
    h('span', { class: 'big' }, icon), h('span', {}, h('b', {}, title), h('span', {}, text)));
  modal('Новая страница', h('div', {}, h('label', {}, 'Название (необязательно)'), name,
    choice('🎛', 'Пульт', 'Кнопки: сайты, программы, звук, питание', make('remote', { cols: 3, buttons: [] }, 'Пульт')),
    choice('🎮', 'Геймпад', 'Стики и кнопки для эмуляторов', make('pad', { map: { ...PAD_DEFAULT } }, 'Геймпад')),
    choice('🖱', 'Тачпад', 'Мышь и клавиатура с телефона', make('touch', { speed: 1.8 }, 'Тачпад'))
  ), [closeBtn()]);
};

/* ================= Страница «Пульт» ================= */
function renderRemote(p) {
  const grid = h('div', { class: 'grid', style: `--cols:${p.cols || 3}` });
  p.buttons.forEach(b => grid.append(makeKey(p, b)));
  if (editMode) grid.append(h('button', { class: 'key add', onclick: () => buttonDialog(p, null) }, h('span', { class: 'ico' }, '＋'), h('span', { class: 'lbl' }, 'Кнопка')));
  else if (!p.buttons.length) grid.append(h('p', { style: 'grid-column:1/-1;color:var(--dim);text-align:center;padding:40px 10px' }, 'Здесь пока пусто. Нажмите ✎ вверху, чтобы добавить кнопки.'));
  return grid;
}
function makeKey(p, b) {
  const el = h('button', { class: 'key' + (b.hold ? ' hold' : ''), style: `${b.color ? `--c:${b.color};` : ''}${b.wide ? 'grid-column:span 2;' : ''}` },
    b.icon ? h('span', { class: 'ico' }, b.icon) : null, b.label ? h('span', { class: 'lbl' }, b.label) : null);
  const fire = () => { buzz(); el.classList.remove('fired'); void el.offsetWidth; el.classList.add('fired'); runAction(b); };
  if (b.hold) {
    let timer, fired = false;
    const cancel = () => { clearTimeout(timer); el.classList.remove('holding'); };
    el.addEventListener('pointerdown', () => {
      if (editMode) return;
      el.classList.add('holding');
      timer = setTimeout(() => { cancel(); fired = true; fire(); }, 700);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, cancel));
    el.addEventListener('click', () => {
      if (fired) { fired = false; return; }
      if (editMode) buttonDialog(p, b); else toast('Удерживайте кнопку, чтобы выполнить');
    });
  } else {
    el.addEventListener('click', () => (editMode ? buttonDialog(p, b) : fire()));
  }
  return el;
}

const TEMPLATES = [
  { icon: '▶', label: 'YouTube', color: '#e5484d', type: 'url', arg: 'youtube.com' },
  { icon: '🔴', label: 'Twitch', color: '#8e4ec6', type: 'url', arg: 'twitch.tv' },
  { icon: '🎬', label: 'Netflix', color: '#e5484d', type: 'url', arg: 'netflix.com' },
  { icon: '🎵', label: 'Музыка', color: '#46a758', type: 'url', arg: 'music.yandex.ru' },
  { icon: '🔊', label: 'Громче', type: 'media', arg: 'vol_up' },
  { icon: '🔉', label: 'Тише', type: 'media', arg: 'vol_down' },
  { icon: '⏯', label: 'Пауза', color: '#3e8ef7', type: 'media', arg: 'play' },
  { icon: '⏭', label: 'Дальше', type: 'media', arg: 'next' },
  { icon: '🖥', label: 'Рабочий стол', type: 'hotkey', arg: 'win+d' },
  { icon: '📸', label: 'Скриншот', type: 'hotkey', arg: 'win+shift+s' },
  { icon: '🔒', label: 'Блокировка', color: '#f2a93b', type: 'system', arg: 'lock' },
  { icon: '🌙', label: 'Сон', type: 'system', arg: 'sleep' },
  { icon: '⏱', label: 'Выкл. через 45 мин', color: '#e5484d', type: 'system', arg: 'shutdown', min: 45, hold: true },
  { icon: '📋', label: 'Буфер → ПК', type: 'sendclip' },
  { icon: '📥', label: 'Буфер ← ПК', type: 'getclip' },
  { icon: '💡', label: 'Лампа', type: 'http', method: 'GET', arg: 'http://192.168.1.50/toggle' }
];

function buttonDialog(p, b) {
  const isNew = !b;
  const d = b ? { ...b } : { id: uid(), type: 'url', arg: '', icon: '', label: '', color: COLORS[0] };
  const form = h('div');
  const label = h('input', { type: 'text', placeholder: 'Подпись', value: d.label || '', oninput: e => d.label = e.target.value });
  const icon = h('input', { type: 'text', placeholder: 'Эмодзи или символ', value: d.icon || '', oninput: e => d.icon = e.target.value });
  const typeSel = h('select', { onchange: e => { d.type = e.target.value; d.arg = ''; fillArg(); } },
    TYPES.map(([v, t]) => h('option', { value: v }, t)));
  typeSel.value = d.type;
  const argBox = h('div');
  const swatches = h('div', { class: 'swatches' });
  const drawSw = () => swatches.replaceChildren(...COLORS.map(c => h('button', { class: 'sw', style: `--c:${c}`, 'aria-label': 'Цвет ' + c, 'aria-pressed': d.color === c,
    onclick: () => { d.color = c; drawSw(); } })));
  drawSw();

  function fillArg() {
    const t = d.type;
    const input = (ph, hint, multiline) => [
      multiline ? h('textarea', { rows: 3, placeholder: ph, value: d.arg || '', oninput: e => d.arg = e.target.value })
        : h('input', { type: 'text', placeholder: ph, value: d.arg || '', oninput: e => d.arg = e.target.value }),
      hint ? h('p', { class: 'hint' }, hint) : null];
    let nodes = [];
    if (t === 'url') nodes = [h('label', {}, 'Адрес'), ...input('twitch.tv/имя_канала', 'Откроется в браузере по умолчанию на ПК. Для прямой трансляции вставьте ссылку на канал или видео.')];
    else if (t === 'run') nodes = [h('label', {}, 'Команда'), ...input('notepad', 'Windows: notepad   или   start "" "C:\\Games\\game.exe"   или   taskkill /im game.exe /f (закрыть зависшую программу).')];
    else if (t === 'hotkey') nodes = [h('label', {}, 'Клавиши через +'), ...input('ctrl+shift+t', 'Доступно: ctrl, shift, alt, win, буквы, цифры, f1–f12, enter, esc, tab, space, стрелки (up/down/left/right), home, end, pgup, pgdn.')];
    else if (t === 'text') nodes = [h('label', {}, 'Текст'), ...input('Текст, который вставится там, где стоит курсор', '', true)];
    else if (t === 'media') { if (!d.arg) d.arg = 'play'; const s = h('select', { onchange: e => d.arg = e.target.value }, MEDIA.map(([v, n]) => h('option', { value: v }, n))); s.value = d.arg; nodes = [h('label', {}, 'Действие'), s]; }
    else if (t === 'system') {
      if (!d.arg) d.arg = 'lock';
      const mins = h('input', { type: 'number', min: 0, value: d.min || 0, oninput: e => d.min = e.target.value });
      const minBox = h('div', {}, h('label', {}, 'Через сколько минут (0 — сразу)'), mins);
      const s = h('select', { onchange: e => { d.arg = e.target.value; minBox.style.display = d.arg === 'shutdown' ? '' : 'none'; } }, SYSTEM.map(([v, n]) => h('option', { value: v }, n)));
      s.value = d.arg; minBox.style.display = d.arg === 'shutdown' ? '' : 'none';
      nodes = [h('label', {}, 'Действие'), s, minBox];
    } else if (t === 'http') {
      const m = h('select', { onchange: e => d.method = e.target.value }, ['GET', 'POST'].map(x => h('option', {}, x))); m.value = d.method || 'GET';
      nodes = [h('label', {}, 'Метод'), m, h('label', {}, 'Адрес'), ...input('http://192.168.1.50/api/toggle', 'Запрос отправляет ПК, поэтому подойдут и адреса внутри домашней сети (Home Assistant, умные лампы).'),
        h('label', {}, 'Тело запроса (для POST)'), h('textarea', { rows: 2, value: d.body || '', oninput: e => d.body = e.target.value })];
    } else nodes = [h('p', { class: 'hint' }, t === 'sendclip' ? 'Текст из буфера телефона вставится на ПК туда, где стоит курсор. Браузер может спросить разрешение.' : 'Текст из буфера ПК скопируется на телефон.')];
    argBox.replaceChildren(...nodes);
  }
  fillArg();

  const hold = h('input', { type: 'checkbox', style: 'width:auto', checked: !!d.hold, onchange: e => d.hold = e.target.checked });
  const wide = h('input', { type: 'checkbox', style: 'width:auto', checked: !!d.wide, onchange: e => d.wide = e.target.checked });
  const tpl = h('div', { class: 'chips' }, TEMPLATES.map(t => h('button', { class: 'chip', onclick: () => {
    Object.assign(d, { hold: false, min: 0, method: 'GET' }, t); label.value = d.label; icon.value = d.icon || '';
    typeSel.value = d.type; hold.checked = !!d.hold; drawSw(); fillArg();
  } }, (t.icon || '') + ' ' + t.label)));

  form.append(
    isNew ? h('div', {}, h('label', {}, 'Быстрые шаблоны'), tpl) : null,
    h('label', {}, 'Подпись'), label, h('label', {}, 'Значок'), icon,
    h('label', {}, 'Цвет'), swatches,
    h('label', {}, 'Что делает кнопка'), typeSel, argBox,
    h('label', { style: 'display:flex;gap:10px;align-items:center;color:var(--text)' }, hold, 'Нажимать с удержанием (защита от случайного нажатия)'),
    h('label', { style: 'display:flex;gap:10px;align-items:center;color:var(--text)' }, wide, 'Широкая кнопка (две колонки)'));
  form.style.cssText = 'max-height:60dvh;overflow-y:auto;padding-right:2px';

  const idx = b ? p.buttons.findIndex(x => x.id === b.id) : -1;
  const move = dir => () => {
    const j = idx + dir;
    if (j < 0 || j >= p.buttons.length) return;
    [p.buttons[idx], p.buttons[j]] = [p.buttons[j], p.buttons[idx]];
    save(); dlg.close(); render();
  };
  const actions = [];
  if (!isNew) actions.push(
    h('button', { class: 'ghost', 'aria-label': 'Сдвинуть влево', onclick: move(-1) }, '◀'),
    h('button', { class: 'ghost', 'aria-label': 'Сдвинуть вправо', onclick: move(1) }, '▶'),
    h('button', { class: 'ghost', style: 'color:var(--danger)', onclick: () => { p.buttons.splice(idx, 1); save(); dlg.close(); render(); } }, 'Удалить'));
  actions.push(closeBtn(), h('button', { class: 'primary', onclick: () => {
    if (!d.label && !d.icon) { toast('Добавьте подпись или значок'); return; }
    if (isNew) p.buttons.push(d); else p.buttons[idx] = d;
    save(); dlg.close(); render();
  } }, 'Сохранить'));
  modal(isNew ? 'Новая кнопка' : 'Кнопка', form, actions);
}

/* ================= Страница «Геймпад» ================= */
const held = new Set();
function keyDown(k) { if (!k || held.has(k)) return; held.add(k); buzz(); send('kd|' + k); }
function keyUp(k) { if (!k || !held.has(k)) return; held.delete(k); send('ku|' + k); }
function releaseAll() { [...held].forEach(keyUp); }
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); else if (!connected) connect(); });

function bindKey(el, getKey) {
  let key = null;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); key = getKey(); el.classList.add('down'); keyDown(key); });
  const up = () => { el.classList.remove('down'); keyUp(key); key = null; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
function makeStick(getKeys, small) {   // getKeys() -> [вверх, влево, вниз, вправо]
  const knob = h('div', { class: 'knob' });
  const base = h('div', { class: 'stick' + (small ? ' small' : '') }, knob);
  let id = null, on = [false, false, false, false], keys = [];
  const apply = want => want.forEach((w, i) => { if (w !== on[i]) { w ? keyDown(keys[i]) : keyUp(keys[i]); on[i] = w; } });
  const move = e => {
    const r = base.getBoundingClientRect();
    let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * r.width * 0.28}px, ${dy * r.height * 0.28}px)`;
    apply([dy < -0.3, dx < -0.3, dy > 0.3, dx > 0.3]);
  };
  base.addEventListener('pointerdown', e => { e.preventDefault(); id = e.pointerId; base.setPointerCapture(id); keys = getKeys(); move(e); });
  base.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; apply([false, false, false, false]); };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
  return base;
}
function renderPad(p) {
  const m = () => ({ ...PAD_DEFAULT, ...p.map });
  const btn = (cls, text, k, style) => { const el = h('div', { class: 'pbtn ' + cls, style: style || '' }, text); bindKey(el, () => m()[k]); return el; };
  const dpad = h('div', { class: 'dpad' }, [
    h('div'), btn('', '▲', 'up'), h('div'),
    btn('', '◀', 'left'), h('div'), btn('', '▶', 'right'),
    h('div'), btn('', '▼', 'down'), h('div')]);
  const abxy = h('div', { class: 'abxy' }, [
    h('div'), btn('', 'X', 'x'), h('div'),
    btn('', 'Y', 'y'), h('div'), btn('', 'A', 'a', 'background:#2f7d3f'),
    h('div'), btn('', 'B', 'b', 'background:#a8332f'), h('div')]);
  const full = h('button', { class: 'pbtn', onclick: () => document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { }) }, '⛶');
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => { });
  return h('div', { class: 'pad-wrap', style: 'height:100%;position:relative' },
    h('div', { class: 'pad' },
      h('div', { class: 'col' }, btn('', 'L', 'l'), makeStick(() => m().s1.split(','), false), dpad),
      h('div', { class: 'center' }, btn('', 'START', 'start'), btn('', 'Z', 'z'), full),
      h('div', { class: 'col' }, btn('', 'R', 'r'), abxy, makeStick(() => m().s2.split(','), true))),
    h('div', { class: 'rotate' }, 'Поверните телефон горизонтально, чтобы играть'));
}
function mapDialog(p) {
  const cur = { ...PAD_DEFAULT, ...p.map };
  const names = { up: 'Крестовина ▲', down: 'Крестовина ▼', left: 'Крестовина ◀', right: 'Крестовина ▶', a: 'A', b: 'B', x: 'X', y: 'Y', l: 'L', r: 'R', z: 'Z', start: 'Start', s1: 'Левый стик (вверх,влево,вниз,вправо)', s2: 'Правый стик (вверх,влево,вниз,вправо)' };
  const inputs = {};
  const grid = h('div', { class: 'map' }, Object.keys(names).flatMap(k => {
    inputs[k] = h('input', { type: 'text', value: cur[k] });
    return [h('span', { style: 'font-size:13px' }, names[k]), inputs[k]];
  }));
  grid.style.cssText += ';max-height:55dvh;overflow-y:auto';
  modal('Раскладка клавиш', h('div', {}, h('p', { class: 'hint' }, 'Это клавиши клавиатуры ПК. Их же нужно привязать к кнопкам в настройках эмулятора (например, Dolphin → Controllers).'), grid), [
    closeBtn(),
    h('button', { class: 'ghost', onclick: () => { p.map = { ...PAD_DEFAULT }; save(); dlg.close(); } }, 'По умолчанию'),
    h('button', { class: 'primary', onclick: () => {
      for (const k in inputs) p.map[k] = inputs[k].value.trim().toUpperCase().replace(/\s/g, '');
      save(); dlg.close(); toast('Раскладка сохранена');
    } }, 'Сохранить')]);
}

/* ================= Страница «Тачпад» ================= */
function renderTouch(p) {
  const pad = h('div', { class: 'touchpad' }, 'Проведите пальцем — курсор двигается. Касание — клик, два пальца — прокрутка, касание двумя пальцами — правый клик.');
  const ptrs = new Map();
  let t0 = 0, moved = 0, maxP = 0, ax = 0, ay = 0, sc = 0, raf = 0;
  const flush = () => {
    raf = 0;
    const x = Math.trunc(ax), y = Math.trunc(ay);
    if (x || y) { ax -= x; ay -= y; send(`mv|${x}|${y}`); }
  };
  pad.addEventListener('pointerdown', e => {
    pad.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { t0 = performance.now(); moved = 0; maxP = 1; } else maxP = Math.max(maxP, ptrs.size);
  });
  pad.addEventListener('pointermove', e => {
    const q = ptrs.get(e.pointerId); if (!q) return;
    const dx = e.clientX - q.x, dy = e.clientY - q.y;
    q.x = e.clientX; q.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size >= 2) {
      sc += dy / 2;
      const n = Math.trunc(sc / 6);
      if (n) { sc -= n * 6; send('scr|' + (-n)); }
    } else {
      const k = p.speed || 1.8;
      ax += dx * k; ay += dy * k;
      if (!raf) raf = requestAnimationFrame(flush);
    }
  });
  const up = e => {
    if (!ptrs.delete(e.pointerId)) return;
    if (ptrs.size === 0 && performance.now() - t0 < 250 && moved < 8) send('clk|' + (maxP >= 2 ? 'right' : 'left'));
  };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);

  const k = (icon, label, fn) => h('button', { class: 'key', onclick: () => { buzz(); fn(); } }, h('span', { class: 'ico', style: 'font-size:20px' }, icon), h('span', { class: 'lbl' }, label));
  const text = h('input', { type: 'text', placeholder: 'Текст для ввода на ПК' });
  const sendText = () => { if (text.value) { send('txt|' + text.value); text.value = ''; } };
  text.addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
  return h('div', { class: 'tp' }, pad,
    h('div', { class: 'row' }, k('🖱', 'Левый', () => send('clk|left')), k('⧉', 'Двойной', () => send('clk|double')), k('☰', 'Правый', () => send('clk|right'))),
    h('div', { class: 'row' }, text, h('button', { class: 'chip', onclick: sendText }, 'Ввести'),
      h('button', { class: 'chip', 'aria-label': 'Backspace', onclick: () => send('hot|backspace') }, '⌫'),
      h('button', { class: 'chip', 'aria-label': 'Enter', onclick: () => send('hot|enter') }, '↵')));
}

/* ================= Настройки ================= */
$('#settings').onclick = () => {
  const theme = h('select', { onchange: e => { state.theme = e.target.value; save(); render(); } },
    h('option', { value: 'dark' }, 'Тёмная'), h('option', { value: 'amoled' }, 'Чёрная (AMOLED)'));
  theme.value = state.theme;
  const vib = h('input', { type: 'checkbox', style: 'width:auto', checked: state.vib, onchange: e => { state.vib = e.target.checked; save(); } });
  const backup = h('textarea', { rows: 3, placeholder: 'Вставьте сюда сохранённую конфигурацию' });
  modal('Настройки', h('div', {},
    h('label', {}, 'Тема'), theme,
    h('label', { style: 'display:flex;gap:10px;align-items:center;color:var(--text)' }, vib, 'Вибрация при нажатии'),
    h('label', {}, 'Резервная копия: кнопки и страницы'), backup,
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'chip', onclick: () => { backup.value = JSON.stringify(state); backup.select(); toast('Скопируйте текст и сохраните'); } }, 'Показать копию'),
      h('button', { class: 'chip', onclick: () => {
        try { const s = JSON.parse(backup.value); if (!s.pages || !s.pages.length) throw 0; state = s; save(); dlg.close(); render(); toast('Загружено'); }
        catch (e) { toast('Не удалось прочитать конфигурацию'); }
      } }, 'Загрузить')),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'chip', onclick: () => pinDialog() }, 'Сменить PIN'),
      h('button', { class: 'chip danger', onclick: () => { if (confirm('Сбросить все страницы и кнопки?')) { state = defaults(); save(); dlg.close(); render(); } } }, 'Сбросить всё'))
  ), [closeBtn('Закрыть')]);
};

/* ================= Старт ================= */
setStatus(false);
render();
connect();
