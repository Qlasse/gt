/**
 * SVG-визуализации веса: штанга (блины), блочная стопка (пин), гантель.
 * Каждый рендер диффит DOM (не пересоздаёт всё), чтобы работали CSS-transitions.
 */
const Viz = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, cls = '') {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (cls) node.setAttribute('class', cls);
    return node;
  }

  /* ------------------------------------------------------------------ */
  /* Штанга: жадный подбор блинов из стандартного набора (на сторону).   */
  /* ------------------------------------------------------------------ */

  // Приглушённые цвета IPF, читаются и в светлой, и в тёмной теме.
  const PLATES = [
    { kg: 25,   h: 128, w: 15, color: '#c9564f' },
    { kg: 20,   h: 118, w: 14, color: '#4a7dbd' },
    { kg: 15,   h: 100, w: 12, color: '#d3a93c' },
    { kg: 10,   h: 80,  w: 11, color: '#579e60' },
    { kg: 5,    h: 60,  w: 9,  color: '#aeb6c0' },
    { kg: 2.5,  h: 46,  w: 8,  color: '#87909b' },
    { kg: 1.25, h: 38,  w: 7,  color: '#6d757f' },
  ];

  function platesForSide(perSide) {
    const result = [];
    let rest = perSide + 1e-9;
    for (const p of PLATES) {
      while (rest >= p.kg) {
        result.push(p);
        rest -= p.kg;
      }
    }
    return { plates: result, rest: Math.max(0, Math.round(rest * 100) / 100) };
  }

  const BAR = { cy: 80, innerL: 116, innerR: 224, maxStack: 82, gap: 1.5 };

  function buildBarbellStatic(svg) {
    svg.setAttribute('viewBox', '0 0 340 160');
    // Гриф
    svg.appendChild(el('rect', { x: 6, y: 77.5, width: 328, height: 5, rx: 2.5 }, 'metal'));
    // Втулки (утолщения под блины)
    svg.appendChild(el('rect', { x: 22, y: 74.5, width: BAR.innerL - 22, height: 11, rx: 5 }, 'metal'));
    svg.appendChild(el('rect', { x: BAR.innerR, y: 74.5, width: 318 - BAR.innerR, height: 11, rx: 5 }, 'metal'));
    // Упоры у центра
    svg.appendChild(el('rect', { x: BAR.innerL - 1, y: 66, width: 5, height: 28, rx: 2 }, 'metal'));
    svg.appendChild(el('rect', { x: BAR.innerR - 4, y: 66, width: 5, height: 28, rx: 2 }, 'metal'));
    const gL = el('g', {}, 'plates-left');
    const gR = el('g', {}, 'plates-right');
    svg.appendChild(gL);
    svg.appendChild(gR);
    return { gL, gR };
  }

  function animateEnter(node) {
    node.classList.add('enter');
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('enter')));
    // Страховка на случай приторможенного rAF в фоновом WebView
    setTimeout(() => node.classList.remove('enter'), 120);
  }

  function animateExit(node) {
    node.classList.add('enter');
    let done = false;
    const kill = () => { if (!done) { done = true; node.remove(); } };
    node.addEventListener('transitionend', kill, { once: true });
    setTimeout(kill, 300);
  }

  /** Синхронизировать группу блинов одной стороны со списком plates. */
  function syncSide(group, plates, side) {
    // Сжимаем толщину, если стопка не влезает (очень большие веса)
    const natural = plates.reduce((s, p) => s + p.w + BAR.gap, 0);
    const squeeze = natural > BAR.maxStack ? BAR.maxStack / natural : 1;

    const existing = Array.from(group.children).filter((n) => !n.__exiting);
    // Общий префикс по номиналу
    let common = 0;
    while (
      common < existing.length &&
      common < plates.length &&
      existing[common].__kg === plates[common].kg
    ) common++;

    for (let i = existing.length - 1; i >= common; i--) {
      existing[i].__exiting = true;
      animateExit(existing[i]);
    }

    // Пересчёт позиций всех блинов (с учётом сжатия)
    let offset = 0;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      const w = p.w * squeeze;
      const x = side === 'L'
        ? BAR.innerL - 6 - offset - w
        : BAR.innerR + 6 + offset;
      if (i < common) {
        const node = existing[i];
        node.setAttribute('x', x);
        node.setAttribute('width', w);
      } else {
        const node = el('rect', {
          x, width: w,
          y: BAR.cy - p.h / 2, height: p.h,
          rx: 3, fill: p.color,
        }, 'plate');
        node.__kg = p.kg;
        group.appendChild(node);
        animateEnter(node);
      }
      offset += w + BAR.gap * squeeze;
    }
  }

  function renderBarbell(svg, state, exercise, weight) {
    if (!state.built) {
      svg.replaceChildren();
      Object.assign(state, buildBarbellStatic(svg), { built: true });
    }
    const bar = exercise.barWeight != null ? exercise.barWeight : 20;
    const perSide = Math.max(0, (weight - bar) / 2);
    const { plates, rest } = platesForSide(perSide);
    syncSide(state.gL, plates, 'L');
    syncSide(state.gR, plates, 'R');
    if (perSide <= 0) return `пустой гриф — ${fmt(bar)} кг`;
    if (rest > 0) return `гриф ${fmt(bar)} + по ${fmt(perSide - rest)} кг на сторону (остаток ${fmt(rest * 2)} кг)`;
    return `гриф ${fmt(bar)} + по ${fmt(perSide)} кг на сторону`;
  }

  /* ------------------------------------------------------------------ */
  /* Блочная стопка: пин выбирает вес, блоки сверху «подхватываются».     */
  /* ------------------------------------------------------------------ */

  const STACK = { x: 118, w: 104, top: 16, areaH: 196, maxBlocks: 25 };

  /** Один блок = шаг упражнения; если блоков выходит слишком много — укрупняем. */
  function stackLayout(exercise) {
    const max = VIZ_TYPES.stack.max;
    let bw = exercise.step > 0 ? exercise.step : 5;
    let count = Math.ceil(max / bw);
    while (count > STACK.maxBlocks) { bw *= 2; count = Math.ceil(max / bw); }
    const unit = STACK.areaH / count;
    return { bw, count, unit, blockH: unit * 0.8, };
  }

  function buildStackStatic(svg, state) {
    svg.setAttribute('viewBox', '0 0 340 224');
    const { count, unit, blockH } = state.layout;
    const bottom = STACK.top + count * unit + 4;
    // Направляющие
    svg.appendChild(el('rect', { x: STACK.x + 18, y: 6, width: 3, height: bottom, rx: 1.5 }, 'metal'));
    svg.appendChild(el('rect', { x: STACK.x + STACK.w - 21, y: 6, width: 3, height: bottom, rx: 1.5 }, 'metal'));
    // Перекладина сверху
    svg.appendChild(el('rect', { x: STACK.x + 8, y: 4, width: STACK.w - 16, height: 5, rx: 2.5 }, 'metal'));

    state.blocks = [];
    for (let i = 0; i < count; i++) {
      const b = el('rect', {
        x: STACK.x,
        y: STACK.top + i * unit,
        width: STACK.w,
        height: blockH,
        rx: Math.min(4, blockH / 2),
      }, 'stack-block');
      svg.appendChild(b);
      state.blocks.push(b);
    }
    // Пин
    const pin = el('g', {}, 'stack-pin');
    pin.appendChild(el('rect', { x: STACK.x + STACK.w - 6, y: -2.5, width: 40, height: 5, rx: 2.5 }));
    pin.appendChild(el('circle', { cx: STACK.x + STACK.w + 38, cy: 0, r: 7 }));
    svg.appendChild(pin);
    state.pin = pin;
  }

  function renderStack(svg, state, exercise, weight) {
    const layout = stackLayout(exercise);
    if (!state.built || state.layout.count !== layout.count || state.layout.bw !== layout.bw) {
      state.layout = layout;
      svg.replaceChildren();
      buildStackStatic(svg, state);
      state.built = true;
    }
    const { bw, count, unit, blockH } = state.layout;
    const k = Math.min(count, Math.max(1, Math.round(weight / bw)));
    state.blocks.forEach((b, i) => b.classList.toggle('on', i < k));
    const y = STACK.top + (k - 1) * unit + blockH / 2;
    state.pin.style.transform = `translateY(${y}px)`;
    return `${k} × ${fmt(bw)} кг`;
  }

  /* ------------------------------------------------------------------ */
  /* Гантель: диски появляются и растут с весом.                          */
  /* ------------------------------------------------------------------ */

  const DB = { cy: 80, innerL: 132, innerR: 208, discs: [96, 76, 58] };

  function buildDumbbellStatic(svg, state) {
    svg.setAttribute('viewBox', '0 0 340 160');
    svg.appendChild(el('rect', { x: 118, y: 75, width: 104, height: 10, rx: 5 }, 'metal'));
    state.discs = [];
    for (const side of ['L', 'R']) {
      for (let i = 0; i < DB.discs.length; i++) {
        const h = DB.discs[i];
        const w = 13;
        const x = side === 'L' ? DB.innerL - (i + 1) * (w + 2) : DB.innerR + i * (w + 2) + 2;
        const d = el('rect', {
          x, width: w,
          y: DB.cy - h / 2, height: h,
          rx: 4,
        }, 'plate');
        d.setAttribute('fill', 'currentColor');
        d.style.color = 'var(--accent)';
        svg.appendChild(d);
        state.discs.push({ node: d, idx: i });
      }
    }
  }

  function renderDumbbell(svg, state, exercise, weight) {
    if (!state.built) {
      svg.replaceChildren();
      buildDumbbellStatic(svg, state);
      state.built = true;
    }
    const { min, max } = VIZ_TYPES.dumbbell;
    const t = Math.min(1, Math.max(0, (weight - min) / (max - min)));
    const grow = 0.62 + 0.38 * t;
    for (const { node, idx } of state.discs) {
      const p = Math.min(1, Math.max(0, t * 3 - idx));
      node.style.opacity = p === 0 ? 0 : 0.35 + 0.65 * p;
      node.style.transform = `scale(${(grow * (0.35 + 0.65 * p)).toFixed(3)})`;
    }
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* Тренажёр с дисками: наклонный штырь, диски нанизываются целиком.     */
  /* ------------------------------------------------------------------ */

  const PEG = { x0: 27, maxStack: 168, gap: 1.5, hScale: 0.62 };

  function buildPlatesStatic(svg, state) {
    svg.setAttribute('viewBox', '0 0 340 185');
    // Стойка и опора
    svg.appendChild(el('rect', { x: 100, y: 68, width: 9, height: 110, rx: 4 }, 'metal'));
    svg.appendChild(el('rect', { x: 84, y: 174, width: 62, height: 5, rx: 2.5 }, 'metal'));
    // Рычаг с шарниром
    const arm = el('g', { transform: 'translate(104.5,72) rotate(-8)' });
    arm.appendChild(el('rect', { x: 4, y: -3.5, width: 202, height: 7, rx: 3.5 }, 'metal'));
    arm.appendChild(el('rect', { x: 20, y: -21, width: 5, height: 42, rx: 2 }, 'metal'));
    state.gPlates = el('g');
    arm.appendChild(state.gPlates);
    svg.appendChild(arm);
    svg.appendChild(el('circle', { cx: 104.5, cy: 72, r: 6 }, 'metal'));
  }

  /** Диски вдоль штыря (аналог syncSide, но одна стопка и свои размеры). */
  function syncPeg(group, plates) {
    const natural = plates.reduce((s, p) => s + p.w + PEG.gap, 0);
    const squeeze = natural > PEG.maxStack ? PEG.maxStack / natural : 1;

    const existing = Array.from(group.children).filter((n) => !n.__exiting);
    let common = 0;
    while (common < existing.length && common < plates.length &&
           existing[common].__kg === plates[common].kg) common++;
    for (let i = existing.length - 1; i >= common; i--) {
      existing[i].__exiting = true;
      animateExit(existing[i]);
    }

    let offset = 0;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      const w = p.w * squeeze;
      const h = p.h * PEG.hScale;
      const x = PEG.x0 + offset;
      if (i < common) {
        existing[i].setAttribute('x', x);
        existing[i].setAttribute('width', w);
      } else {
        const node = el('rect', { x, width: w, y: -h / 2, height: h, rx: 3, fill: p.color }, 'plate');
        node.__kg = p.kg;
        group.appendChild(node);
        animateEnter(node);
      }
      offset += w + PEG.gap * squeeze;
    }
  }

  function renderPlates(svg, state, exercise, weight) {
    if (!state.built) {
      svg.replaceChildren();
      buildPlatesStatic(svg, state);
      state.built = true;
    }
    const { plates, rest } = platesForSide(Math.max(0, weight));
    syncPeg(state.gPlates, plates);
    if (weight <= 0) return 'без дисков';
    if (rest > 0) return `диски ${fmt(weight - rest)} кг, остаток ${fmt(rest)} кг`;
    return `диски: ${plates.map((p) => fmt(p.kg)).join(' + ')}`;
  }

  /* ------------------------------------------------------------------ */
  /* Свой вес + отягощение: атлет на турнике, груз на поясе растёт.       */
  /* ------------------------------------------------------------------ */

  function buildBodyStatic(svg, state) {
    svg.setAttribute('viewBox', '0 0 340 175');
    // Турник
    svg.appendChild(el('rect', { x: 98, y: 12, width: 144, height: 5, rx: 2.5 }, 'metal'));
    // Силуэт: руки, голова, корпус, ноги
    svg.appendChild(el('path', { d: 'M120 17 L160 52 M220 17 L180 52' }, 'sil'));
    svg.appendChild(el('circle', { cx: 170, cy: 42, r: 10 }, 'sil-fill'));
    svg.appendChild(el('path', { d: 'M170 54 L170 103' }, 'sil sil-torso'));
    svg.appendChild(el('path', { d: 'M170 103 L156 148 M170 103 L184 148' }, 'sil'));
    // Груз на поясе (появляется при весе > 0)
    const g = el('g', {}, 'plate');
    g.appendChild(el('rect', { x: 168.5, y: 96, width: 3, height: 22, rx: 1.5 }, 'metal'));
    const disc = el('circle', { cx: 170, cy: 128, r: 20 });
    disc.style.fill = 'var(--accent)';
    g.appendChild(disc);
    const hole = el('circle', { cx: 170, cy: 128, r: 4 });
    hole.style.fill = 'var(--bg)';
    g.appendChild(hole);
    svg.appendChild(g);
    state.load = g;
  }

  function renderBody(svg, state, exercise, weight) {
    if (!state.built) {
      svg.replaceChildren();
      buildBodyStatic(svg, state);
      state.built = true;
    }
    const { max } = VIZ_TYPES.body;
    const t = Math.min(1, Math.max(0, weight / max));
    if (weight <= 0) {
      state.load.style.opacity = 0;
      state.load.style.transform = 'scale(0.3)';
      return 'собственный вес';
    }
    state.load.style.opacity = 1;
    state.load.style.transform = `scale(${(0.45 + 0.55 * t).toFixed(3)})`;
    return `свой вес + ${fmt(weight)} кг`;
  }

  /* ------------------------------------------------------------------ */
  /* Гиря: размер и цвет по стандартному номиналу.                        */
  /* ------------------------------------------------------------------ */

  const KB_COLORS = { 8: '#c56b8c', 12: '#4a7dbd', 16: '#d3a93c', 20: '#7d6bb5', 24: '#579e60', 28: '#cf8b4a', 32: '#c9564f' };

  function buildKettlebellStatic(svg, state) {
    svg.setAttribute('viewBox', '0 0 340 175');
    const g = el('g', {}, 'plate');
    const handle = el('path', { d: 'M-26 -28 A 26 26 0 0 1 26 -28', 'stroke-width': 9, fill: 'none' });
    handle.style.stroke = 'var(--hint)';
    g.appendChild(handle);
    state.ball = el('circle', { cx: 0, cy: 6, r: 42 });
    g.appendChild(state.ball);
    state.label = el('text', { x: 0, y: 15, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700 });
    state.label.style.fill = 'var(--bg)';
    g.appendChild(state.label);
    // translate — атрибутом на обёртке, масштаб — CSS-transform на внутренней
    // группе (CSS-transform перекрыл бы атрибут, будь они на одном узле)
    const wrap = el('g', { transform: 'translate(170,100)' });
    wrap.appendChild(g);
    svg.appendChild(wrap);
    state.g = g;
  }

  function renderKettlebell(svg, state, exercise, weight) {
    if (!state.built) {
      svg.replaceChildren();
      buildKettlebellStatic(svg, state);
      state.built = true;
    }
    const noms = VIZ_TYPES.kettlebell.nominals;
    let nominal = noms[0];
    for (const n of noms) if (Math.abs(n - weight) < Math.abs(nominal - weight)) nominal = n;
    const t = noms.indexOf(nominal) / (noms.length - 1);
    state.ball.style.fill = KB_COLORS[nominal] || '#87909b';
    state.label.textContent = fmt(nominal);
    state.g.style.transform = `scale(${(0.55 + 0.45 * t).toFixed(3)})`;
    return '';
  }

  /* ------------------------------------------------------------------ */

  function fmt(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
  }

  /** Главная точка входа: рисует вес упражнения, возвращает строку-примечание. */
  function render(svg, exercise, weight) {
    if (!svg.__viz || svg.__viz.type !== exercise.type) {
      svg.__viz = { type: exercise.type, built: false };
    }
    const state = svg.__viz;
    switch (exercise.type) {
      case 'barbell':    return renderBarbell(svg, state, exercise, weight);
      case 'stack':      return renderStack(svg, state, exercise, weight);
      case 'dumbbell':   return renderDumbbell(svg, state, exercise, weight);
      case 'plates':     return renderPlates(svg, state, exercise, weight);
      case 'body':       return renderBody(svg, state, exercise, weight);
      case 'kettlebell': return renderKettlebell(svg, state, exercise, weight);
      default:           return '';
    }
  }

  /** Мини-иконка типа снаряда (для карточек и выбора типа). */
  function icon(type) {
    const icons = {
      barbell: `<rect x="2" y="18" width="60" height="3" rx="1.5" fill="currentColor" opacity=".6"/>
        <rect x="12" y="8" width="5" height="24" rx="2" fill="currentColor"/>
        <rect x="19" y="11" width="4" height="18" rx="2" fill="currentColor" opacity=".7"/>
        <rect x="47" y="8" width="5" height="24" rx="2" fill="currentColor"/>
        <rect x="41" y="11" width="4" height="18" rx="2" fill="currentColor" opacity=".7"/>`,
      stack: `<rect x="18" y="4" width="28" height="7" rx="2.5" fill="currentColor"/>
        <rect x="18" y="13" width="28" height="7" rx="2.5" fill="currentColor"/>
        <rect x="18" y="22" width="28" height="7" rx="2.5" fill="currentColor" opacity=".45"/>
        <rect x="18" y="31" width="28" height="7" rx="2.5" fill="currentColor" opacity=".45"/>
        <rect x="44" y="15" width="12" height="3" rx="1.5" fill="currentColor"/>
        <circle cx="58" cy="16.5" r="3.5" fill="currentColor"/>`,
      dumbbell: `<rect x="20" y="18" width="24" height="4" rx="2" fill="currentColor" opacity=".6"/>
        <rect x="13" y="8" width="6" height="24" rx="2.5" fill="currentColor"/>
        <rect x="6" y="12" width="6" height="16" rx="2.5" fill="currentColor" opacity=".7"/>
        <rect x="45" y="8" width="6" height="24" rx="2.5" fill="currentColor"/>
        <rect x="52" y="12" width="6" height="16" rx="2.5" fill="currentColor" opacity=".7"/>`,
      plates: `<g transform="rotate(-10 32 22)">
        <rect x="8" y="20" width="50" height="3.5" rx="1.75" fill="currentColor" opacity=".6"/>
        <rect x="18" y="7" width="6" height="30" rx="2.5" fill="currentColor"/>
        <rect x="26" y="11" width="5" height="22" rx="2" fill="currentColor" opacity=".8"/>
        <rect x="33" y="14" width="4" height="16" rx="2" fill="currentColor" opacity=".6"/>
      </g>`,
      body: `<rect x="14" y="4" width="36" height="3" rx="1.5" fill="currentColor" opacity=".6"/>
        <path d="M17 7l11 8M47 7L36 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <circle cx="32" cy="13" r="4" fill="currentColor"/>
        <path d="M32 18v9M32 27l-5 8M32 27l5 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
        <circle cx="32" cy="32" r="4.5" fill="currentColor" opacity=".7"/>`,
      kettlebell: `<path d="M25 15a7 7 0 0114 0" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>
        <circle cx="32" cy="26" r="11" fill="currentColor"/>`,
    };
    return `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">${icons[type] || ''}</svg>`;
  }

  return { render, icon, fmt };
})();
