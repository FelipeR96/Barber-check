(() => {
  'use strict';

  // ---------- Storage ----------
  const KEY = 'barbercheck:v1';
  const AUTH = 'barbercheck:auth';
  const defaults = () => ({
    pinHash: null,
    shop: '',
    currency: 'CLP',
    prices: [8000, 10000, 12000, 15000],
    cuts: [],
    expenses: [],
    appts: [],
  });

  let db = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
    } catch { return defaults(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch { toast('No se pudo guardar en este navegador'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function hash(text) {
    const salted = 'barbercheck::' + text;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (const c of salted) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
    return 'f' + (h >>> 0).toString(16);
  }

  // ---------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const weekStart = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const money = (n) => {
    try {
      const noDecimals = ['CLP', 'COP', 'ARS'].includes(db.currency);
      const locale = { CLP: 'es-CL', COP: 'es-CO', MXN: 'es-MX', ARS: 'es-AR', PEN: 'es-PE', USD: 'en-US', EUR: 'es-ES' }[db.currency] || 'es';
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency: db.currency, currencyDisplay: 'narrowSymbol', useGrouping: 'always',
        maximumFractionDigits: noDecimals ? 0 : 2, minimumFractionDigits: 0,
      }).format(n || 0);
    } catch { return '$' + Math.round(n || 0).toLocaleString('es'); }
  };
  const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parse(s).toLocaleDateString('es', opts);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const cutTotal = (c) => (Number(c.price) || 0) + (Number(c.tip) || 0);

  function range(period, ref = new Date()) {
    if (period === 'day') { const s = ymd(ref); return [s, s]; }
    if (period === 'week') { const s = weekStart(ref); return [ymd(s), ymd(addDays(s, 6))]; }
    const s = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return [ymd(s), ymd(e)];
  }
  const inRange = (d, [a, b]) => d >= a && d <= b;

  function totals(r) {
    const cuts = db.cuts.filter((c) => inRange(c.date, r));
    const exps = db.expenses.filter((e) => inRange(e.date, r));
    const income = cuts.reduce((s, c) => s + cutTotal(c), 0);
    const expense = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { cuts, exps, income, expense, net: income - expense };
  }

  // ---------- Toasts ----------
  function toast(msg, action) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(msg)}</span>`;
    let timer;
    const close = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 220); };
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { action.run(); close(); };
      t.appendChild(b);
    }
    $('#toaster').appendChild(t);
    const toasts = $$('.toast:not(.out)', $('#toaster'));
    if (toasts.length > 3) toasts[0].classList.add('out');
    timer = setTimeout(close, action ? 5000 : 2600);
  }

  // ---------- Auth ----------
  let loginMode = 'login'; // login | setup
  function showLogin(mode) {
    loginMode = mode;
    $('#app').hidden = true;
    $('#login').hidden = false;
    const setup = mode === 'setup';
    $('#pin2').hidden = !setup;
    $('#pin2').required = setup;
    $('#login-hint').textContent = setup ? 'Crea un PIN de 4 a 8 dígitos' : 'Ingresa tu PIN para continuar';
    $('#login-btn').textContent = setup ? 'Crear PIN' : 'Entrar';
    $('#login-error').textContent = '';
    $('#login-form').reset();
    setTimeout(() => $('#pin').focus(), 50);
  }
  function loginError(msg) {
    $('#login-error').textContent = msg;
    const card = $('.login-card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = $('#pin').value.trim();
    if (!/^\d{4,8}$/.test(pin)) return loginError('El PIN debe tener entre 4 y 8 números');
    if (loginMode === 'setup') {
      if (pin !== $('#pin2').value.trim()) return loginError('Los PIN no coinciden');
      db.pinHash = await hash(pin); save();
      enter(); toast('PIN guardado');
    } else {
      if ((await hash(pin)) !== db.pinHash) { $('#pin').value = ''; return loginError('PIN incorrecto'); }
      enter();
    }
  });
  function enter() {
    try { sessionStorage.setItem(AUTH, db.pinHash); } catch {}
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderAll();
    requestAnimationFrame(moveIndicator);
  }

  // ---------- Navigation ----------
  let currentView = 'resumen';
  function go(view) {
    currentView = view;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
    moveIndicator();
    window.scrollTo({ top: 0 });
  }
  function moveIndicator() {
    const a = $('.tab.is-active');
    if (!a) return;
    const ind = $('#tab-indicator');
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  window.addEventListener('resize', moveIndicator);
  $('#tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) go(t.dataset.view); });
  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (!q) return;
    go(q.dataset.quick);
    if (q.dataset.quick === 'cortes') setTimeout(() => $('#cut-form [name=price]').focus(), 60);
  });

  // ---------- Resumen ----------
  let period = 'day';
  $('#period-switch').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    period = b.dataset.period;
    $$('#period-switch button').forEach((x) => x.classList.toggle('is-active', x === b));
    renderKpis(true);
  });

  function setVal(id, text, animate) {
    const el = $(id);
    if (el.textContent === text) return;
    el.textContent = text;
    if (animate) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
  }

  function renderKpis(animate) {
    const r = range(period);
    const t = totals(r);
    const label = { day: 'hoy', week: 'esta semana', month: 'este mes' }[period];
    setVal('#kpi-net', money(t.net), animate);
    $('#kpi-net').classList.toggle('neg', t.net < 0);
    setVal('#kpi-income', money(t.income), animate);
    setVal('#kpi-expense', money(t.expense), animate);
    const n = t.cuts.length;
    setVal('#kpi-avg', money(n ? t.income / n : 0), animate);
    $('#kpi-cuts').textContent = `${n} ${n === 1 ? 'corte' : 'cortes'} ${label}`;
    $('#kpi-expense-sub').textContent = `${t.exps.length} ${t.exps.length === 1 ? 'registro' : 'registros'}`;
    const tips = t.cuts.reduce((s, c) => s + (Number(c.tip) || 0), 0);
    $('#kpi-avg-sub').textContent = tips ? `Propinas: ${money(tips)}` : 'Por corte';
    const rangeText = period === 'day' ? cap(fmtDate(r[0], { weekday: 'long', day: 'numeric', month: 'long' }))
      : period === 'week' ? `${fmtDate(r[0], { day: 'numeric', month: 'short' })} – ${fmtDate(r[1], { day: 'numeric', month: 'short' })}`
      : cap(parse(r[0]).toLocaleDateString('es', { month: 'long', year: 'numeric' }));
    $('#kpi-net-sub').textContent = rangeText;
  }

  function renderChart() {
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(ymd(addDays(new Date(), -i)));
    const data = days.map((d) => { const t = totals([d, d]); return { d, inc: t.income, out: t.expense }; });
    const max = Math.max(1, ...data.map((x) => Math.max(x.inc, x.out)));
    const t0 = today();
    $('#chart').innerHTML = data.map((x, i) => `
      <div class="bar-col ${x.d === t0 ? 'today' : ''}" title="${esc(fmtDate(x.d))}: ${esc(money(x.inc))} / ${esc(money(x.out))}">
        <div class="bars">
          <div class="bar in" style="height:${Math.max(2, (x.inc / max) * 100)}%;animation-delay:${i * 25}ms"></div>
          <div class="bar out" style="height:${Math.max(2, (x.out / max) * 100)}%;animation-delay:${i * 25 + 15}ms"></div>
        </div>
        <span class="bar-label">${parse(x.d).getDate()}</span>
      </div>`).join('');
  }

  function renderMonths() {
    const map = new Map();
    const add = (date, k, v) => {
      const m = date.slice(0, 7);
      if (!map.has(m)) map.set(m, { cuts: 0, inc: 0, out: 0 });
      const o = map.get(m); o[k] += v;
    };
    db.cuts.forEach((c) => { add(c.date, 'cuts', 1); add(c.date, 'inc', cutTotal(c)); });
    db.expenses.forEach((e) => add(e.date, 'out', Number(e.amount) || 0));
    const rows = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
    $('#months-table tbody').innerHTML = rows.length ? rows.map(([m, o]) => `
      <tr><td>${esc(cap(parse(m + '-01').toLocaleDateString('es', { month: 'long', year: 'numeric' })))}</td>
      <td>${o.cuts}</td><td class="pos">${money(o.inc)}</td><td class="neg">${money(o.out)}</td>
      <td><b class="${o.inc - o.out < 0 ? 'neg' : ''}">${money(o.inc - o.out)}</b></td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">Aún no hay movimientos</td></tr>`;
  }

  function upcomingAppts() {
    const t = today();
    return db.appts.filter((a) => a.status === 'pending' && a.date >= t)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  function apptItem(a, mini) {
    const d = parse(a.date);
    const isToday = a.date === today();
    const tag = a.status === 'done' ? '<span class="tag done">Atendida</span>' : a.status === 'cancel' ? '<span class="tag cancel">Cancelada</span>' : isToday ? '<span class="tag">Hoy</span>' : '';
    const actions = mini ? ''
      : a.status !== 'pending' ? `<div class="item-actions"><button class="icon-btn danger" data-del-appt="${a.id}" title="Eliminar">✕</button></div>`
      : `<div class="item-actions">
          <button class="icon-btn ok" data-done-appt="${a.id}" title="Atendida (registrar corte)">✓</button>
          <button class="icon-btn danger" data-cancel-appt="${a.id}" title="Cancelar">✕</button>
        </div>`;
    return `<li class="item" data-id="${a.id}">
      <div class="item-badge"><span>${esc(d.toLocaleDateString('es', { month: 'short' }).replace('.', ''))}<b>${d.getDate()}</b></span></div>
      <div class="item-main">
        <p class="item-title">${esc(a.client)} ${tag}</p>
        <p class="item-sub">${esc(a.time || '')} · ${esc(cap(d.toLocaleDateString('es', { weekday: 'long' })))}${a.phone ? ' · ' + esc(a.phone) : ''}${a.note ? ' · ' + esc(a.note) : ''}</p>
      </div>
      ${a.price ? `<span class="item-amount">${money(a.price)}</span>` : ''}
      ${actions}
    </li>`;
  }

  function renderUpcomingMini() {
    const list = upcomingAppts().slice(0, 5);
    $('#upcoming-mini').innerHTML = list.length ? list.map((a) => apptItem(a, true)).join('')
      : `<li class="empty">Sin citas próximas</li>`;
  }

  // ---------- Cortes ----------
  const cutForm = $('#cut-form');
  function resetCutForm() {
    cutForm.reset();
    cutForm.date.value = today();
    cutForm.time.value = nowTime();
    $$('#price-chips .chip').forEach((c) => c.classList.remove('is-active'));
  }
  function renderPriceChips() {
    $('#price-chips').innerHTML = db.prices.map((p) => `<button type="button" class="chip" data-price="${p}">${money(p)}</button>`).join('');
  }
  $('#price-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    cutForm.price.value = c.dataset.price;
    $$('#price-chips .chip').forEach((x) => x.classList.toggle('is-active', x === c));
  });
  cutForm.price.addEventListener('input', () => {
    $$('#price-chips .chip').forEach((x) => x.classList.toggle('is-active', x.dataset.price === cutForm.price.value));
  });

  let pendingApptId = null;
  cutForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = cutForm;
    const cut = {
      id: uid(), date: f.date.value, time: f.time.value,
      price: Number(f.price.value) || 0, tip: Number(f.tip.value) || 0,
      method: f.method.value, client: f.client.value.trim(), createdAt: Date.now(),
    };
    db.cuts.push(cut);
    if (pendingApptId) {
      const a = db.appts.find((x) => x.id === pendingApptId);
      if (a) a.status = 'done';
      pendingApptId = null;
    }
    save();
    const keepDate = f.date.value;
    resetCutForm();
    f.date.value = keepDate;
    cutsFilter.value = keepDate;
    renderAll(cut.id);
    toast(`Corte de ${money(cutTotal(cut))} guardado`);
    f.price.focus();
  });

  const cutsFilter = $('#cuts-filter');
  cutsFilter.addEventListener('change', () => renderCuts());

  function renderCuts(newId) {
    const d = cutsFilter.value || today();
    const list = db.cuts.filter((c) => c.date === d).sort((a, b) => (b.time || '').localeCompare(a.time || '') || b.createdAt - a.createdAt);
    $('#cuts-title').textContent = d === today() ? 'Cortes de hoy' : cap(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }));
    const total = list.reduce((s, c) => s + cutTotal(c), 0);
    $('#cuts-total').innerHTML = list.length ? `${list.length} ${list.length === 1 ? 'corte' : 'cortes'} · <b>${money(total)}</b>` : '';
    $('#cuts-list').innerHTML = list.length ? list.map((c, i) => `
      <li class="item ${c.id === newId ? 'enter' : ''}" data-id="${c.id}">
        <div class="item-badge"><span><b>${list.length - i}</b>corte</span></div>
        <div class="item-main">
          <p class="item-title">${esc(c.client || 'Corte')}</p>
          <p class="item-sub">${esc(c.time || '—')} · ${esc(c.method)}${c.tip ? ' · Propina ' + money(c.tip) : ''}</p>
        </div>
        <span class="item-amount">${money(cutTotal(c))}</span>
        <div class="item-actions"><button class="icon-btn danger" data-del-cut="${c.id}" title="Eliminar">✕</button></div>
      </li>`).join('') : `<li class="empty">No hay cortes registrados este día</li>`;
  }

  // ---------- Citas ----------
  const apptForm = $('#appt-form');
  let apptSeg = 'upcoming';
  $('#appt-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    apptSeg = b.dataset.seg;
    $$('#appt-seg button').forEach((x) => x.classList.toggle('is-active', x === b));
    renderAppts();
  });
  apptForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = apptForm;
    const clash = db.appts.find((a) => a.status === 'pending' && a.date === f.date.value && a.time === f.time.value);
    const appt = {
      id: uid(), date: f.date.value, time: f.time.value, client: f.client.value.trim(),
      phone: f.phone.value.trim(), price: Number(f.price.value) || 0, note: f.note.value.trim(), status: 'pending',
    };
    db.appts.push(appt); save();
    f.reset(); f.date.value = today();
    renderAll(appt.id);
    toast(clash ? `Cita agendada (ojo: ya tenías a ${clash.client} a esa hora)` : `Cita con ${appt.client} agendada`);
  });

  function renderAppts(newId) {
    const t = today();
    let list;
    if (apptSeg === 'upcoming') {
      list = db.appts.filter((a) => a.status === 'pending' && a.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    } else {
      list = db.appts.filter((a) => a.status !== 'pending' || a.date < t).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 50);
    }
    if (!list.length) { $('#appts-list').innerHTML = `<li class="empty">${apptSeg === 'upcoming' ? 'No tienes citas próximas' : 'Sin historial'}</li>`; return; }
    let html = '', last = '';
    for (const a of list) {
      if (apptSeg === 'upcoming' && a.date !== last) {
        last = a.date;
        html += `<li class="day-head">${a.date === t ? 'Hoy' : esc(cap(fmtDate(a.date, { weekday: 'long', day: 'numeric', month: 'long' })))}</li>`;
      }
      html += apptItem(a, false).replace('class="item"', `class="item ${a.id === newId ? 'enter' : ''}"`);
    }
    $('#appts-list').innerHTML = html;
  }

  // ---------- Gastos ----------
  const expForm = $('#exp-form');
  const expFilter = $('#exp-filter');
  const CATS = { fijo: 'Costos fijos', insumo: 'Insumos', equipo: 'Equipo', otro: 'Otros' };
  expFilter.addEventListener('change', () => renderExpenses());
  expForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = expForm;
    const exp = { id: uid(), date: f.date.value, concept: f.concept.value.trim(), amount: Number(f.amount.value) || 0, category: f.category.value };
    db.expenses.push(exp); save();
    const keep = f.date.value, cat = f.category.value;
    f.reset(); f.date.value = keep; f.category.value = cat;
    expFilter.value = keep.slice(0, 7);
    renderAll(exp.id);
    toast(`Gasto de ${money(exp.amount)} guardado`);
  });

  function renderExpenses(newId) {
    const m = expFilter.value || today().slice(0, 7);
    const list = db.expenses.filter((e) => e.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date));
    const total = list.reduce((s, e) => s + e.amount, 0);
    const monthName = parse(m + '-01').toLocaleDateString('es', { month: 'long' });
    $('#exp-title').innerHTML = `Gastos de ${esc(monthName)} · <span class="neg">${money(total)}</span>`;
    const byCat = {};
    list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const maxCat = Math.max(1, ...Object.values(byCat));
    $('#cat-bars').innerHTML = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
      <div class="cat-row"><span>${esc(CATS[k] || k)}</span><div class="cat-track"><div class="cat-fill" style="width:${(v / maxCat) * 100}%"></div></div><span>${money(v)}</span></div>`).join('');
    $('#exp-list').innerHTML = list.length ? list.map((e) => {
      const d = parse(e.date);
      return `<li class="item ${e.id === newId ? 'enter' : ''}" data-id="${e.id}">
        <div class="item-badge"><span>${esc(d.toLocaleDateString('es', { month: 'short' }).replace('.', ''))}<b>${d.getDate()}</b></span></div>
        <div class="item-main"><p class="item-title">${esc(e.concept)}</p><p class="item-sub">${esc(CATS[e.category] || e.category)}</p></div>
        <span class="item-amount neg">−${money(e.amount)}</span>
        <div class="item-actions"><button class="icon-btn danger" data-del-exp="${e.id}" title="Eliminar">✕</button></div>
      </li>`;
    }).join('') : `<li class="empty">Sin gastos este mes</li>`;
  }

  // ---------- Delete / actions with undo ----------
  function removeWithUndo(collection, id, label) {
    const idx = db[collection].findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [item] = db[collection].splice(idx, 1);
    save();
    const li = $(`.item[data-id="${id}"]`);
    const finish = () => renderAll();
    if (li) { li.classList.add('leaving'); setTimeout(finish, 180); } else finish();
    toast(`${label} eliminado`, { label: 'Deshacer', run: () => { db[collection].splice(idx, 0, item); save(); renderAll(item.id); } });
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.delCut) removeWithUndo('cuts', b.dataset.delCut, 'Corte');
    else if (b.dataset.delExp) removeWithUndo('expenses', b.dataset.delExp, 'Gasto');
    else if (b.dataset.delAppt) removeWithUndo('appts', b.dataset.delAppt, 'Cita');
    else if (b.dataset.cancelAppt) {
      const a = db.appts.find((x) => x.id === b.dataset.cancelAppt);
      if (!a) return;
      a.status = 'cancel'; save(); renderAll();
      toast(`Cita de ${a.client} cancelada`, { label: 'Deshacer', run: () => { a.status = 'pending'; save(); renderAll(); } });
    } else if (b.dataset.doneAppt) {
      const a = db.appts.find((x) => x.id === b.dataset.doneAppt);
      if (!a) return;
      // Prefill the cut form so the barber confirms what they actually charged.
      go('cortes');
      resetCutForm();
      pendingApptId = a.id;
      cutForm.date.value = a.date;
      cutForm.time.value = a.time || nowTime();
      cutForm.client.value = a.client;
      if (a.price) cutForm.price.value = a.price;
      cutsFilter.value = a.date;
      renderCuts();
      setTimeout(() => { cutForm.price.focus(); cutForm.price.select(); }, 60);
      toast('Confirma el monto cobrado y guarda');
    }
  });

  // ---------- Ajustes ----------
  const setForm = $('#settings-form');
  function fillSettings() {
    setForm.shop.value = db.shop || '';
    setForm.currency.value = db.currency;
    setForm.prices.value = db.prices.join(', ');
  }
  setForm.addEventListener('submit', (e) => {
    e.preventDefault();
    db.shop = setForm.shop.value.trim();
    db.currency = setForm.currency.value;
    db.prices = setForm.prices.value.split(/[,;\s]+/).map(Number).filter((n) => n > 0).slice(0, 8);
    save(); renderAll(); toast('Ajustes guardados');
  });
  $('#export-btn').addEventListener('click', () => {
    const { pinHash, ...data } = db;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `barber-check-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.cuts) || !Array.isArray(data.expenses)) throw new Error();
      if (!confirm('Esto reemplazará los datos actuales por los del respaldo. ¿Continuar?')) return;
      db = { ...defaults(), ...data, pinHash: db.pinHash };
      save(); renderAll(); toast('Respaldo restaurado');
    } catch { toast('Archivo de respaldo no válido'); }
    e.target.value = '';
  });
  $('#logout').addEventListener('click', () => { try { sessionStorage.removeItem(AUTH); } catch {} showLogin('login'); });
  $('#change-pin').addEventListener('click', () => showLogin('setup'));

  // ---------- Render ----------
  function renderAll(newId) {
    const name = db.shop ? esc(db.shop) : 'barbero';
    $('.view[data-view=resumen] h1').innerHTML = `Hola, <em>${name}</em>.`;
    $('#today-label').textContent = cap(new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
    renderKpis(false);
    renderChart();
    renderMonths();
    renderUpcomingMini();
    renderPriceChips();
    renderCuts(newId);
    renderAppts(newId);
    renderExpenses(newId);
    fillSettings();
  }

  // ---------- Boot ----------
  function boot() {
    resetCutForm();
    cutsFilter.value = today();
    apptForm.date.value = today();
    expForm.date.value = today();
    expFilter.value = today().slice(0, 7);
    let authed = false;
    try { authed = db.pinHash && sessionStorage.getItem(AUTH) === db.pinHash; } catch {}
    if (!db.pinHash) showLogin('setup');
    else if (authed) enter();
    else showLogin('login');
  }
  boot();
})();
