/**
 * GymTracker — логика приложения: экраны, степпер, скраб, запись, избранное.
 */
(() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTg = !!(tg && tg.initData);

  /* ---------- Telegram init ---------- */
  if (tg) {
    tg.ready();
    tg.expand();
    try { if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes(); } catch (_) {}
  }
  if (inTg) document.body.classList.add('tg');

  const haptic = {
    light()   { try { tg && tg.HapticFeedback.impactOccurred('light'); } catch (_) {} },
    medium()  { try { tg && tg.HapticFeedback.impactOccurred('medium'); } catch (_) {} },
    success() { try { tg && tg.HapticFeedback.notificationOccurred('success'); } catch (_) {} },
  };

  const confirmDialog = (message, cb) => {
    if (inTg && typeof tg.showConfirm === 'function') {
      try { tg.showConfirm(message, cb); return; } catch (_) {}
    }
    cb(window.confirm(message));
  };

  /* ---------- Состояние ---------- */
  let exercises = [];
  let current = null;          // открытое упражнение
  let currentLog = [];         // его история (по возрастанию даты)
  let screen = 'home';

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $('screen-home'),
    exercise: $('screen-exercise'),
    add: $('screen-add'),
  };

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const saveExercises = (debounced = false) => {
    if (debounced) Storage.setDebounced(KEY_EXERCISES, exercises);
    else Storage.set(KEY_EXERCISES, exercises);
  };

  /* ---------- Навигация ---------- */
  function showScreen(name) {
    screen = name;
    for (const [key, node] of Object.entries(screens)) {
      node.classList.toggle('right', key !== name && key !== 'home');
      node.classList.toggle('behind', key === 'home' && name !== 'home');
    }
    if (name === 'home') renderHome();

    if (inTg) {
      try {
        if (name === 'home') tg.BackButton.hide();
        else tg.BackButton.show();
      } catch (_) {}
      updateMainButton();
    }
  }

  function updateMainButton() {
    if (!inTg) return;
    try {
      if (screen === 'exercise') { tg.MainButton.setText('Записать'); tg.MainButton.show(); }
      else if (screen === 'add') { tg.MainButton.setText('Добавить упражнение'); tg.MainButton.show(); }
      else tg.MainButton.hide();
    } catch (_) {}
  }

  const goBack = () => { Storage.flush(); showScreen('home'); };
  if (inTg) {
    try { tg.BackButton.onClick(goBack); } catch (_) {}
    try {
      tg.MainButton.onClick(() => {
        if (screen === 'exercise') recordEntry();
        else if (screen === 'add') createExercise();
      });
    } catch (_) {}
  }
  document.querySelectorAll('.btn-back').forEach((b) => b.addEventListener('click', goBack));

  /* ---------- Главная ---------- */
  function cardHTML(ex) {
    const star = ex.favorite
      ? '<svg class="card-star" viewBox="0 0 24 24" width="14" height="14"><path d="M12 3.5l2.47 5.32 5.83.66-4.32 3.97 1.16 5.75L12 16.3l-5.14 2.9 1.16-5.75-4.32-3.97 5.83-.66z" fill="currentColor"/></svg>'
      : '';
    return `
      <span class="card-icon">${Viz.icon(ex.type)}</span>
      <span class="card-name">${escapeHTML(ex.name)}</span>
      ${star}
      <span class="card-weight">${Viz.fmt(ex.weight)}<span class="u">кг</span></span>`;
  }

  function renderHome() {
    const favs = exercises.filter((e) => e.favorite);
    const rest = exercises.filter((e) => !e.favorite);
    const favList = $('fav-list');
    const allList = $('all-list');
    favList.replaceChildren();
    allList.replaceChildren();

    for (const [list, items] of [[favList, favs], [allList, rest]]) {
      for (const ex of items) {
        const card = document.createElement('button');
        card.className = 'ex-card';
        card.innerHTML = cardHTML(ex);
        card.addEventListener('click', () => openExercise(ex));
        list.appendChild(card);
      }
    }
    $('fav-section').hidden = favs.length === 0;
    $('all-section').hidden = rest.length === 0;
    $('home-empty').hidden = exercises.length > 0;
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Экран упражнения ---------- */
  const vizSvg = $('viz');
  const weightValue = $('weight-value');
  const vizNote = $('viz-note');

  function bounds(ex) {
    const t = VIZ_TYPES[ex.type] || VIZ_TYPES.barbell;
    const min = ex.type === 'barbell' && ex.barWeight != null ? ex.barWeight : t.min;
    return { min, max: t.max };
  }

  let displayed = 0;       // отображаемое число (для твина)
  let tweenRaf = null;

  function renderWeight(animate = true) {
    const target = current.weight;
    vizNote.textContent = Viz.render(vizSvg, current, target);
    if (!animate || Math.abs(target - displayed) < 0.001) {
      displayed = target;
      weightValue.textContent = Viz.fmt(target);
      return;
    }
    cancelAnimationFrame(tweenRaf);
    const from = displayed;
    const start = performance.now();
    const dur = 180;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      displayed = from + (target - from) * eased;
      weightValue.textContent = Viz.fmt(Math.round(displayed * 4) / 4);
      if (t < 1) tweenRaf = requestAnimationFrame(tick);
      else { displayed = target; weightValue.textContent = Viz.fmt(target); }
    };
    tweenRaf = requestAnimationFrame(tick);
  }

  function setWeight(w, { silent = false } = {}) {
    const { min, max } = bounds(current);
    const clamped = Math.min(max, Math.max(min, Math.round(w * 100) / 100));
    if (clamped === current.weight) return false;
    current.weight = clamped;
    renderWeight();
    saveExercises(true);
    if (!silent) haptic.light();
    return true;
  }

  function openExercise(ex) {
    current = ex;
    $('ex-title').textContent = ex.name;
    $('btn-fav').classList.toggle('active', !!ex.favorite);
    $('inp-sets').value = '';
    $('inp-reps').value = '';
    document.querySelector('.scrub-hint').textContent = `тяните число вбок · шаг ${Viz.fmt(ex.step)} кг`;
    vizSvg.__viz = null; // не тянуть анимацию блинов от предыдущего упражнения
    displayed = ex.weight;
    weightValue.textContent = Viz.fmt(ex.weight);
    vizNote.textContent = Viz.render(vizSvg, ex, ex.weight);
    loadLog(ex.id);
    showScreen('exercise');
  }

  async function loadLog(id) {
    currentLog = (await Storage.get(keyLog(id), [])) || [];
    if (current && current.id === id) renderLog();
  }

  function renderLog() {
    const block = $('progress-block');
    if (currentLog.length === 0) { block.hidden = true; return; }
    block.hidden = false;
    Chart.render($('chart'), currentLog);

    const hist = $('history');
    hist.replaceChildren();
    const fmtD = (iso) => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' })
      .format(new Date(iso + 'T00:00:00')).replace('.', '');
    for (const e of currentLog.slice(-8).reverse()) {
      const li = document.createElement('li');
      const sets = e.s && e.r ? `<span class="h-sets">${e.s}×${e.r}</span>` : '<span class="h-sets"></span>';
      li.innerHTML = `<span class="h-date">${fmtD(e.d)}</span>${sets}<span class="h-weight">${Viz.fmt(e.w)} <span class="u">кг</span></span>`;
      hist.appendChild(li);
    }
  }

  function recordEntry() {
    if (!current) return;
    const entry = { d: todayISO(), w: current.weight };
    const s = parseInt($('inp-sets').value, 10);
    const r = parseInt($('inp-reps').value, 10);
    if (s > 0) entry.s = s;
    if (r > 0) entry.r = r;
    currentLog.push(entry);
    if (currentLog.length > LOG_LIMIT) currentLog = currentLog.slice(-LOG_LIMIT);
    Storage.set(keyLog(current.id), currentLog);
    Storage.flush();
    renderLog();
    haptic.success();
    const btn = $('btn-record');
    btn.classList.remove('saved');
    void btn.offsetWidth;
    btn.classList.add('saved');
    const prev = btn.textContent;
    btn.textContent = 'Записано ✓';
    setTimeout(() => { btn.textContent = prev; }, 1200);
  }

  $('btn-record').addEventListener('click', recordEntry);

  /* Избранное */
  $('btn-fav').addEventListener('click', () => {
    if (!current) return;
    current.favorite = !current.favorite;
    const btn = $('btn-fav');
    btn.classList.toggle('active', current.favorite);
    btn.classList.remove('pop');
    void btn.offsetWidth;
    btn.classList.add('pop');
    haptic.medium();
    saveExercises();
  });

  /* Удаление */
  $('btn-delete').addEventListener('click', () => {
    if (!current) return;
    confirmDialog(`Удалить «${current.name}»? История записей тоже удалится.`, (ok) => {
      if (!ok) return;
      exercises = exercises.filter((e) => e.id !== current.id);
      Storage.remove(keyLog(current.id));
      saveExercises();
      current = null;
      goBack();
    });
  });

  /* Степпер с автоповтором и ускорением */
  function bindStepper(btn, dir) {
    let timer = null;
    let count = 0;
    const stepOnce = () => {
      setWeight(current.weight + dir * current.step);
      count++;
    };
    const loop = () => {
      const delay = count > 25 ? 45 : count > 10 ? 80 : 140;
      timer = setTimeout(() => { stepOnce(); loop(); }, delay);
    };
    const stop = () => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      Storage.flush();
    };
    const start = (ev) => {
      ev.preventDefault();
      stop(); // страховка: повторное нажатие не должно оставить «висящий» автоповтор
      try { btn.setPointerCapture(ev.pointerId); } catch (_) {}
      count = 0;
      stepOnce();
      timer = setTimeout(loop, 420);
    };
    btn.addEventListener('pointerdown', start);
    for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(evt, stop);
  }
  bindStepper($('btn-minus'), -1);
  bindStepper($('btn-plus'), +1);

  /* Скраб: горизонтальный драг по числу веса */
  (() => {
    const zone = $('weight-scrub');
    const PX_PER_STEP = 14;
    let startX = 0, startWeight = 0, active = false;

    zone.addEventListener('pointerdown', (ev) => {
      if (!current) return;
      active = true;
      startX = ev.clientX;
      startWeight = current.weight;
      zone.classList.add('scrubbing');
      try { zone.setPointerCapture(ev.pointerId); } catch (_) {}
    });
    zone.addEventListener('pointermove', (ev) => {
      if (!active) return;
      const steps = Math.round((ev.clientX - startX) / PX_PER_STEP);
      setWeight(startWeight + steps * current.step);
    });
    const end = () => {
      if (!active) return;
      active = false;
      zone.classList.remove('scrubbing');
      Storage.flush();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  })();

  /* ---------- Экран добавления ---------- */
  let pickedType = 'barbell';

  function buildTypePicker() {
    const picker = $('type-picker');
    picker.replaceChildren();
    for (const [type, cfg] of Object.entries(VIZ_TYPES)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'type-option' + (type === pickedType ? ' active' : '');
      btn.innerHTML = `${Viz.icon(type)}<span>${cfg.label}</span>`;
      btn.addEventListener('click', () => {
        pickedType = type;
        picker.querySelectorAll('.type-option').forEach((n) => n.classList.remove('active'));
        btn.classList.add('active');
        $('inp-step').value = cfg.defaultStep;
        $('field-bar').hidden = type !== 'barbell';
        haptic.light();
      });
      picker.appendChild(btn);
    }
    $('field-bar').hidden = pickedType !== 'barbell';
  }

  function createExercise() {
    const name = $('inp-name').value.trim();
    if (!name) {
      $('inp-name').focus();
      return;
    }
    const cfg = VIZ_TYPES[pickedType];
    const step = parseFloat($('inp-step').value) || cfg.defaultStep;
    const ex = {
      id: 'x' + Date.now().toString(36),
      name,
      type: pickedType,
      favorite: false,
      step,
      weight: cfg.defaultWeight,
    };
    if (pickedType === 'barbell') {
      ex.barWeight = parseFloat($('inp-bar').value);
      if (!(ex.barWeight >= 0)) ex.barWeight = 20;
      ex.weight = Math.max(ex.weight, ex.barWeight);
    }
    exercises.push(ex);
    saveExercises();
    haptic.success();
    openExercise(ex);
  }

  $('btn-create').addEventListener('click', createExercise);
  $('btn-add').addEventListener('click', () => {
    $('inp-name').value = '';
    pickedType = 'barbell';
    $('inp-step').value = VIZ_TYPES.barbell.defaultStep;
    $('inp-bar').value = 20;
    buildTypePicker();
    showScreen('add');
  });

  /* ---------- Старт ---------- */
  window.addEventListener('beforeunload', () => Storage.flush());

  (async () => {
    const stored = await Storage.get(KEY_EXERCISES);
    if (Array.isArray(stored) && stored.length > 0) {
      exercises = stored;
    } else if (stored === null) {
      exercises = JSON.parse(JSON.stringify(DEFAULT_EXERCISES));
      saveExercises();
    } else {
      exercises = []; // пользователь удалил всё сам — уважаем
    }
    renderHome();
  })();
})();
