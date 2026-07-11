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
    // Полноэкранный режим (Bot API 8.0+); отступы под системные зоны — в CSS
    try { if (tg.isVersionAtLeast('8.0') && !tg.isFullscreen) tg.requestFullscreen(); } catch (_) {}
  }
  if (inTg) document.body.classList.add('tg');

  let hapticsOn = true; // настройка «Вибрация», грузится из хранилища на старте
  const haptic = {
    light()   { try { hapticsOn && tg && tg.HapticFeedback.impactOccurred('light'); } catch (_) {} },
    medium()  { try { hapticsOn && tg && tg.HapticFeedback.impactOccurred('medium'); } catch (_) {} },
    success() { try { hapticsOn && tg && tg.HapticFeedback.notificationOccurred('success'); } catch (_) {} },
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
    settings: $('screen-settings'),
  };

  /* Тост-уведомление */
  let toastTimer = null;
  function showToast(text) {
    const t = $('toast');
    clearTimeout(toastTimer);
    t.textContent = text;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => t.classList.add('show'), 50); // страховка без rAF
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 300);
    }, 2600);
  }

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
      else if (screen === 'add') { tg.MainButton.setText(editing ? 'Сохранить' : 'Добавить упражнение'); tg.MainButton.show(); }
      else tg.MainButton.hide();
    } catch (_) {}
  }

  const goBack = () => {
    if (screen === 'exercise') closeWeightEditor(); // применить набранный вес
    Storage.flush();
    if (screen === 'add' && editing) {
      // из редактирования возвращаемся на экран упражнения, а не домой
      const ex = editing;
      editing = null;
      openExercise(ex);
      return;
    }
    showScreen('home');
  };
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

  function buildCard(ex) {
    const card = document.createElement('button');
    card.className = 'ex-card' + (ex.color ? ' colored' : '');
    if (ex.color) card.style.setProperty('--card-accent', ex.color);
    card.innerHTML = cardHTML(ex);
    card.addEventListener('click', () => openExercise(ex));
    return card;
  }

  function renderHome() {
    const wrap = $('home-sections');
    wrap.replaceChildren();

    const favs = exercises.filter((e) => e.favorite);
    const groups = new Map(); // имя группы -> упражнения (в порядке появления)
    const ungrouped = [];
    for (const ex of exercises.filter((e) => !e.favorite)) {
      const g = (ex.group || '').trim();
      if (g) {
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(ex);
      } else {
        ungrouped.push(ex);
      }
    }

    const addSection = (title, items) => {
      if (items.length === 0) return;
      const sec = document.createElement('div');
      sec.className = 'list-section';
      const h = document.createElement('h2');
      h.className = 'section-title';
      h.textContent = title;
      const list = document.createElement('div');
      list.className = 'card-list';
      for (const ex of items) list.appendChild(buildCard(ex));
      sec.appendChild(h);
      sec.appendChild(list);
      wrap.appendChild(sec);
    };

    addSection('Избранное', favs);
    for (const [g, items] of groups) addSection(g, items);
    addSection(groups.size > 0 ? 'Без группы' : 'Все упражнения', ungrouped);
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

  /** Привести вес к допустимому: клэмп по границам, для гирь — ближайший номинал. */
  function snapWeight(ex, w) {
    const { min, max } = bounds(ex);
    w = Math.min(max, Math.max(min, w));
    const noms = (VIZ_TYPES[ex.type] || {}).nominals;
    if (!noms) return Math.round(w * 100) / 100;
    let best = noms[0];
    for (const n of noms) if (Math.abs(n - w) < Math.abs(best - w)) best = n;
    return best;
  }

  /** Вес после steps шагов от base: арифметика или движение по номиналам. */
  function shiftWeight(base, steps) {
    const noms = (VIZ_TYPES[current.type] || {}).nominals;
    if (noms) {
      const idx = noms.indexOf(snapWeight(current, base));
      return noms[Math.min(noms.length - 1, Math.max(0, idx + steps))];
    }
    return base + steps * current.step;
  }

  let displayed = 0;       // отображаемое число (для твина)
  let tweenRaf = null;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function renderWeight(animate = true) {
    const target = current.weight;
    vizNote.textContent = Viz.render(vizSvg, current, target);
    if (reducedMotion && reducedMotion.matches) animate = false;
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
    // Страховка: если rAF приторможен (фоновый WebView), число всё равно доедет
    setTimeout(() => {
      if (current && current.weight === target && displayed !== target) {
        displayed = target;
        weightValue.textContent = Viz.fmt(target);
      }
    }, dur + 80);
  }

  function setWeight(w, { silent = false } = {}) {
    const clamped = snapWeight(current, w);
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
    document.querySelector('.scrub-hint').textContent = (VIZ_TYPES[ex.type] || {}).nominals
      ? 'тап — ввод · свайп по номиналам гирь'
      : `тап — ввод · свайп с шагом ${Viz.fmt(ex.step)} кг`;
    vizSvg.__viz = null; // не тянуть анимацию блинов от предыдущего упражнения
    editIdx = -1;
    // жёсткий сброс редактора веса без применения — значение прошлого
    // упражнения не должно попасть в новое
    weightInput.hidden = true;
    $('weight-scrub').classList.remove('editing');
    displayed = ex.weight;
    weightValue.textContent = Viz.fmt(ex.weight);
    vizNote.textContent = Viz.render(vizSvg, ex, ex.weight);
    currentLog = [];
    renderLog(); // мгновенно спрятать историю прошлого упражнения, пока грузится своя
    loadLog(ex.id);
    showScreen('exercise');
  }

  async function loadLog(id) {
    currentLog = (await Storage.get(keyLog(id), [])) || [];
    if (current && current.id === id) renderLog();
  }

  let editIdx = -1; // индекс редактируемой записи в currentLog

  const fmtD = (iso) => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' })
    .format(new Date(iso + 'T00:00:00')).replace('.', '');

  function saveLog() {
    Storage.set(keyLog(current.id), currentLog);
    Storage.flush();
  }

  function renderLog() {
    const block = $('progress-block');
    if (currentLog.length === 0) { block.hidden = true; editIdx = -1; return; }
    block.hidden = false;
    Chart.render($('chart'), currentLog);

    const hist = $('history');
    hist.replaceChildren();
    const first = Math.max(0, currentLog.length - 8);
    for (let i = currentLog.length - 1; i >= first; i--) {
      hist.appendChild(i === editIdx ? buildEditRow(i) : buildViewRow(i));
    }
  }

  function buildViewRow(i) {
    const e = currentLog[i];
    const li = document.createElement('li');
    const sets = e.s && e.r ? `<span class="h-sets">${e.s}×${e.r}</span>` : '<span class="h-sets"></span>';
    li.innerHTML = `<span class="h-date">${fmtD(e.d)}</span>${sets}` +
      `<span class="h-weight">${Viz.fmt(e.w)} <span class="u">кг</span></span>` +
      `<svg class="h-pen" viewBox="0 0 24 24" width="13" height="13"><path d="M4 20l1-4L16.5 4.5a2.12 2.12 0 013 3L8 19l-4 1z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg>`;
    li.addEventListener('click', () => {
      editIdx = i;
      renderLog();
      haptic.light();
    });
    return li;
  }

  function buildEditRow(i) {
    const e = currentLog[i];
    const li = document.createElement('li');
    li.className = 'edit-row';
    li.innerHTML =
      `<input class="he-w" type="number" inputmode="decimal" enterkeyhint="done" value="${e.w}" aria-label="Вес">` +
      `<input class="he-s" type="number" inputmode="numeric" enterkeyhint="done" value="${e.s || ''}" placeholder="—" aria-label="Подходы">` +
      `<span class="sets-x-sm">×</span>` +
      `<input class="he-r" type="number" inputmode="numeric" enterkeyhint="done" value="${e.r || ''}" placeholder="—" aria-label="Повторы">` +
      `<button class="btn-mini he-del" aria-label="Удалить запись"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12m-6 3v6m4-6v6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` +
      `<button class="btn-mini he-save" aria-label="Сохранить запись"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;

    li.querySelector('.he-save').addEventListener('click', (ev) => {
      ev.stopPropagation();
      const w = parseFloat(li.querySelector('.he-w').value);
      const s = parseInt(li.querySelector('.he-s').value, 10);
      const r = parseInt(li.querySelector('.he-r').value, 10);
      if (w > 0) e.w = Math.round(w * 100) / 100;
      if (s > 0) e.s = s; else delete e.s;
      if (r > 0) e.r = r; else delete e.r;
      editIdx = -1;
      saveLog();
      renderLog();
      haptic.success();
    });

    li.querySelector('.he-del').addEventListener('click', (ev) => {
      ev.stopPropagation();
      confirmDialog(`Удалить запись от ${fmtD(e.d)}?`, (ok) => {
        if (!ok) return;
        currentLog.splice(i, 1);
        editIdx = -1;
        saveLog();
        renderLog();
        haptic.medium();
      });
    });

    return li;
  }

  function recordEntry() {
    if (!current) return;
    closeWeightEditor(); // применяем набранный вес до записи
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const entry = { d: todayISO(), w: current.weight };
    const s = parseInt($('inp-sets').value, 10);
    const r = parseInt($('inp-reps').value, 10);
    if (s > 0) entry.s = s;
    if (r > 0) entry.r = r;
    currentLog.push(entry);
    if (currentLog.length > LOG_LIMIT) currentLog = currentLog.slice(-LOG_LIMIT);
    editIdx = -1;
    saveLog();
    renderLog();
    haptic.success();
    if (currentLog.length >= LOG_LIMIT - 5) {
      showToast(`История заполнена на ${currentLog.length}/${LOG_LIMIT} — старые записи начнут удаляться. Очистка — в настройках.`);
    }
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
      setWeight(shiftWeight(current.weight, dir));
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
      closeWeightEditor(); // применить набранное с клавиатуры и шагать от него
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

  /* Ввод веса с клавиатуры: тап по числу открывает поле, значение
     автоматически ограничивается пределами упражнения (snapWeight). */
  const weightInput = $('weight-input');

  function openWeightEditor() {
    if (!current) return;
    $('weight-scrub').classList.add('editing');
    weightInput.hidden = false;
    weightInput.value = current.weight;
    weightInput.focus();
    try { weightInput.select(); } catch (_) {}
  }

  function closeWeightEditor() {
    if (weightInput.hidden) return;
    const v = parseFloat(String(weightInput.value).replace(',', '.'));
    if (Number.isFinite(v)) setWeight(v, { silent: true }); // клэмп к min/max внутри
    weightInput.hidden = true;
    $('weight-scrub').classList.remove('editing');
    Storage.flush();
  }
  // Закрытие редактора не полагается на одно лишь blur-событие:
  // Enter, тап вне зоны, степпер и запись подхода закрывают его явно.
  weightInput.addEventListener('blur', closeWeightEditor);
  weightInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      closeWeightEditor();
    }
  });

  /* Скраб: горизонтальный драг по числу веса; тап без движения — ввод */
  (() => {
    const zone = $('weight-scrub');
    const PX_PER_STEP = 14;
    let startX = 0, startWeight = 0, active = false, moved = false;

    zone.addEventListener('pointerdown', (ev) => {
      if (!current || ev.target === weightInput) return;
      active = true;
      moved = false;
      startX = ev.clientX;
      startWeight = current.weight;
      zone.classList.add('scrubbing');
      try { zone.setPointerCapture(ev.pointerId); } catch (_) {}
    });
    zone.addEventListener('pointermove', (ev) => {
      if (!active) return;
      if (Math.abs(ev.clientX - startX) > 6) moved = true;
      const steps = Math.round((ev.clientX - startX) / PX_PER_STEP);
      setWeight(shiftWeight(startWeight, steps));
    });
    const end = (ev) => {
      if (!active) return;
      active = false;
      zone.classList.remove('scrubbing');
      Storage.flush();
      if (ev.type === 'pointerup' && !moved) openWeightEditor();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  })();

  /* ---------- Экран добавления / редактирования ---------- */
  let pickedType = 'barbell';
  let pickedColor = null;
  let presetWeight = null; // стартовый вес из выбранного шаблона
  let editing = null; // упражнение в режиме редактирования (null — создание нового)

  function buildColorPicker() {
    const el = $('color-picker');
    el.replaceChildren();
    for (const color of [null, ...CARD_COLORS]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (color === null ? ' none' : '') + (pickedColor === color ? ' active' : '');
      b.setAttribute('aria-label', color === null ? 'Без цвета' : 'Цвет ' + color);
      if (color) b.style.background = color;
      b.addEventListener('click', () => {
        pickedColor = color;
        buildColorPicker();
        haptic.light();
      });
      el.appendChild(b);
    }
  }

  function buildPresets() {
    const row = $('preset-row');
    row.replaceChildren();
    for (const p of EXERCISE_PRESETS) {
      if (exercises.some((e) => e.name === p.name)) continue; // уже в каталоге
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'preset-chip';
      chip.textContent = p.name;
      chip.addEventListener('click', () => {
        $('inp-name').value = p.name;
        pickedType = p.type;
        buildTypePicker();
        $('inp-step').value = p.step;
        if (p.barWeight != null) $('inp-bar').value = p.barWeight;
        presetWeight = p.weight;
        haptic.light();
      });
      row.appendChild(chip);
    }
    $('field-presets').hidden = row.children.length === 0;
  }

  function fillGroupSuggestions() {
    const dl = $('group-list');
    dl.replaceChildren();
    for (const g of new Set(exercises.map((e) => (e.group || '').trim()).filter(Boolean))) {
      const o = document.createElement('option');
      o.value = g;
      dl.appendChild(o);
    }
  }

  function openAddScreen(ex) {
    editing = ex || null;
    presetWeight = null;
    $('add-title').textContent = editing ? 'Изменить упражнение' : 'Новое упражнение';
    $('btn-create').textContent = editing ? 'Сохранить' : 'Добавить упражнение';
    $('inp-name').value = editing ? editing.name : '';
    $('inp-group').value = editing ? editing.group || '' : '';
    pickedType = editing ? editing.type : 'barbell';
    pickedColor = editing ? editing.color || null : null;
    $('inp-step').value = editing ? editing.step : VIZ_TYPES.barbell.defaultStep;
    $('inp-bar').value = editing && editing.barWeight != null ? editing.barWeight : 20;
    buildTypePicker();
    buildColorPicker();
    fillGroupSuggestions();
    if (editing) $('field-presets').hidden = true;
    else buildPresets();
    showScreen('add');
  }

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
        $('field-step').hidden = !!cfg.nominals;
        haptic.light();
      });
      picker.appendChild(btn);
    }
    $('field-bar').hidden = pickedType !== 'barbell';
    $('field-step').hidden = !!(VIZ_TYPES[pickedType] || {}).nominals;
  }

  function createExercise() {
    const name = $('inp-name').value.trim();
    if (!name) {
      $('inp-name').focus();
      return;
    }
    const cfg = VIZ_TYPES[pickedType];
    const step = parseFloat($('inp-step').value) || cfg.defaultStep;

    const group = $('inp-group').value.trim();

    if (editing) {
      editing.name = name;
      editing.type = pickedType;
      editing.step = step;
      if (group) editing.group = group; else delete editing.group;
      if (pickedColor) editing.color = pickedColor; else delete editing.color;
      if (pickedType === 'barbell') {
        editing.barWeight = parseFloat($('inp-bar').value);
        if (!(editing.barWeight >= 0)) editing.barWeight = 20;
      } else {
        delete editing.barWeight;
      }
      editing.weight = snapWeight(editing, editing.weight);
      const ex = editing;
      editing = null;
      saveExercises();
      haptic.success();
      openExercise(ex);
      return;
    }

    const ex = {
      id: 'x' + Date.now().toString(36),
      name,
      type: pickedType,
      favorite: false,
      step,
      weight: presetWeight != null ? presetWeight : cfg.defaultWeight,
    };
    if (group) ex.group = group;
    if (pickedColor) ex.color = pickedColor;
    if (pickedType === 'barbell') {
      ex.barWeight = parseFloat($('inp-bar').value);
      if (!(ex.barWeight >= 0)) ex.barWeight = 20;
    }
    ex.weight = snapWeight(ex, ex.weight);
    exercises.push(ex);
    saveExercises();
    haptic.success();
    openExercise(ex);
  }

  $('btn-create').addEventListener('click', createExercise);
  $('btn-add').addEventListener('click', () => openAddScreen(null));
  $('btn-edit').addEventListener('click', () => { if (current) openAddScreen(current); });

  /* ---------- Настройки ---------- */
  const KEEP_ON_CLEANUP = 20;

  async function allLogs() {
    const logs = await Promise.all(exercises.map((e) => Storage.get(keyLog(e.id), [])));
    return logs.map((l) => l || []);
  }

  async function renderSettings() {
    const logs = await allLogs();
    let total = 0, maxLen = 0, maxName = '';
    logs.forEach((l, i) => {
      total += l.length;
      if (l.length > maxLen) { maxLen = l.length; maxName = exercises[i].name; }
    });
    const pct = Math.min(100, Math.round((maxLen / LOG_LIMIT) * 100));
    $('mem-fill').style.width = pct + '%';
    $('mem-fill').classList.toggle('warn', pct >= 85);
    $('mem-text').textContent = total === 0
      ? 'Записей пока нет'
      : `Всего ${total} записей · больше всего у «${maxName}»: ${maxLen} из ${LOG_LIMIT}`;
    $('about-line').textContent =
      `GymTracker · данные: ${Storage.useCloud ? 'Telegram Cloud (привязаны к аккаунту)' : 'localStorage браузера'}`;
  }

  $('btn-settings').addEventListener('click', () => {
    renderSettings();
    showScreen('settings');
  });

  $('btn-export').addEventListener('click', async () => {
    const logs = await allLogs();
    const dump = { app: 'gymtracker', exported: todayISO(), exercises, logs: {} };
    exercises.forEach((e, i) => { dump.logs[e.id] = logs[i]; });
    const json = JSON.stringify(dump);
    try {
      await navigator.clipboard.writeText(json);
      showToast('Данные скопированы в буфер обмена');
    } catch (_) {
      // fallback для WebView без clipboard API
      const ta = document.createElement('textarea');
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      showToast(ok ? 'Данные скопированы в буфер обмена' : 'Не удалось скопировать');
    }
    haptic.success();
  });

  $('tgl-haptics').addEventListener('change', (ev) => {
    hapticsOn = ev.target.checked;
    Storage.set('haptics', hapticsOn);
    haptic.medium(); // ощутимо только при включении — удобная проверка
  });

  $('btn-clear-old').addEventListener('click', () => {
    confirmDialog(`Оставить только ${KEEP_ON_CLEANUP} последних записей в каждом упражнении?`, async (ok) => {
      if (!ok) return;
      const logs = await allLogs();
      let removed = 0;
      for (let i = 0; i < exercises.length; i++) {
        if (logs[i].length > KEEP_ON_CLEANUP) {
          removed += logs[i].length - KEEP_ON_CLEANUP;
          await Storage.set(keyLog(exercises[i].id), logs[i].slice(-KEEP_ON_CLEANUP));
        }
      }
      showToast(removed > 0 ? `Удалено старых записей: ${removed}` : 'Старых записей нет — всё компактно');
      haptic.success();
      renderSettings();
    });
  });

  $('btn-reset-progress').addEventListener('click', () => {
    confirmDialog('Удалить всю историю записей? Упражнения и текущие веса останутся.', async (ok) => {
      if (!ok) return;
      await Promise.all(exercises.map((e) => Storage.remove(keyLog(e.id))));
      currentLog = [];
      showToast('История очищена');
      haptic.success();
      renderSettings();
    });
  });

  $('btn-reset-all').addEventListener('click', () => {
    confirmDialog('Сбросить всё? Упражнения, история и настройки будут удалены безвозвратно.', async (ok) => {
      if (!ok) return;
      const keys = await Storage.keys();
      await Promise.all(keys.map((k) => Storage.remove(k)));
      showToast('Все данные сброшены');
      haptic.success();
      setTimeout(() => location.reload(), 900);
    });
  });

  /* ---------- Таймер отдыха (не привязан к «Записать») ---------- */
  (() => {
    const MIN = 30, MAX = 600, DEF = 120;
    let duration = DEF;      // выбранная длительность (персистится)
    let total = 0;           // длительность текущего отсчёта
    let endAt = 0;
    let interval = null;
    let doneTimeout = null;

    const label = $('timer-label');
    const fill = $('timer-fill');
    const btn = $('timer-main');
    const running = () => interval !== null;

    const fmtT = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    Storage.get('rest-timer', DEF).then((v) => {
      if (v >= MIN && v <= MAX) duration = v;
      if (!running()) showIdle();
    });

    function showIdle() {
      clearInterval(interval); interval = null;
      clearTimeout(doneTimeout); doneTimeout = null;
      btn.classList.remove('running', 'done');
      fill.style.width = '0';
      label.textContent = '⏱ ' + fmtT(duration);
    }

    function tick() {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      label.textContent = fmtT(left);
      fill.style.width = `${Math.min(100, 100 * (1 - left / total))}%`;
      if (left <= 0) finish();
    }

    function start() {
      clearTimeout(doneTimeout); doneTimeout = null;
      btn.classList.remove('done');
      btn.classList.add('running');
      total = duration;
      endAt = Date.now() + total * 1000;
      interval = setInterval(tick, 250);
      tick();
      haptic.medium();
    }

    function finish() {
      clearInterval(interval); interval = null;
      btn.classList.remove('running');
      btn.classList.add('done');
      fill.style.width = '100%';
      label.textContent = 'Отдых окончен';
      haptic.success();
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (_) {}
      doneTimeout = setTimeout(showIdle, 4000);
    }

    btn.addEventListener('click', () => {
      if (running()) { showIdle(); haptic.light(); } // отмена
      else if (btn.classList.contains('done')) showIdle();
      else start();
    });

    function adjust(delta) {
      if (running()) {
        // на ходу двигаем текущий отсчёт
        endAt += delta * 1000;
        total = Math.max(1, total + delta);
        if (endAt < Date.now()) endAt = Date.now();
        tick();
      } else {
        duration = Math.min(MAX, Math.max(MIN, duration + delta));
        Storage.setDebounced('rest-timer', duration);
        showIdle();
      }
      haptic.light();
    }
    $('timer-minus').addEventListener('click', () => adjust(-30));
    $('timer-plus').addEventListener('click', () => adjust(+30));
  })();

  /* ---------- Клавиатура: снимаем фокус только по ТАПУ вне поля ----------
     Свайп (прокрутка) не должен прятать клавиатуру: отличаем тап от свайпа
     по смещению пальца между pointerdown и pointerup. */
  let tapX = 0, tapY = 0;
  document.addEventListener('pointerdown', (ev) => {
    tapX = ev.clientX;
    tapY = ev.clientY;
  });
  document.addEventListener('pointerup', (ev) => {
    const isTap = Math.hypot(ev.clientX - tapX, ev.clientY - tapY) < 10;
    if (!isTap) return;
    if (!ev.target.closest('#weight-scrub')) closeWeightEditor();
    const focused = document.activeElement;
    if (focused && focused.tagName === 'INPUT' && !ev.target.closest('input, label, #weight-scrub')) {
      focused.blur();
    }
    // тап вне истории закрывает редактируемую запись
    if (editIdx >= 0 && !ev.target.closest('#history')) {
      editIdx = -1;
      renderLog();
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && document.activeElement && document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
    }
  });

  // Поле ввода не должно прятаться под клавиатурой. Клавиатура открывается
  // с анимацией и меняет viewport в непредсказуемый момент, поэтому:
  // несколько попыток прокрутки по таймеру + прокрутка при фактическом
  // изменении видимой области (visualViewport / viewportChanged Telegram).
  let kbFocused = null;
  function ensureFieldVisible(behavior) {
    if (kbFocused && document.activeElement === kbFocused) {
      try { kbFocused.scrollIntoView({ block: 'center', behavior }); } catch (_) {}
    }
  }
  document.addEventListener('focusin', (ev) => {
    if (ev.target.tagName !== 'INPUT') return;
    kbFocused = ev.target;
    setTimeout(() => ensureFieldVisible('smooth'), 120);
    setTimeout(() => ensureFieldVisible('smooth'), 400);
    setTimeout(() => ensureFieldVisible('auto'), 800);
  });
  document.addEventListener('focusout', () => {
    kbFocused = null;
    // Telegram может сдвинуть WebView вверх под клавиатуру и не вернуть назад —
    // после закрытия клавиатуры возвращаем окно на место.
    setTimeout(() => {
      if (!document.activeElement || document.activeElement.tagName !== 'INPUT') {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
      }
    }, 120);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => setTimeout(() => ensureFieldVisible('auto'), 60));
  }
  if (tg) {
    try { tg.onEvent('viewportChanged', () => setTimeout(() => ensureFieldVisible('auto'), 60)); } catch (_) {}
  }

  /* ---------- Старт ---------- */
  window.addEventListener('beforeunload', () => Storage.flush());

  (async () => {
    Storage.get('haptics', true).then((v) => {
      hapticsOn = v !== false;
      $('tgl-haptics').checked = hapticsOn;
    });
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
