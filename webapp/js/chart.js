/**
 * Минималистичный график прогресса: одна серия (вес по записям), SVG.
 * Ось X — порядковая (по записям), подписи — первая и последняя дата.
 * Цвета — токены темы: линия в акценте, текст в hint/text, никакого текста цветом серии.
 */
const Chart = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const W = 340, H = 120;
  const PAD = { l: 8, r: 44, t: 14, b: 22 };

  const fmtDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(d).replace('.', '');
  };

  function el(tag, attrs = {}) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  /**
   * entries — по возрастанию даты: [{d:'YYYY-MM-DD', w:число}, ...]
   * Рисует, только если точек ≥ 2.
   */
  function render(container, entries) {
    container.replaceChildren();
    if (!entries || entries.length < 2) return;

    const ws = entries.map((e) => e.w);
    let lo = Math.min(...ws), hi = Math.max(...ws);
    if (hi === lo) { hi += 1; lo -= 1; }
    const span = hi - lo;
    lo -= span * 0.12; hi += span * 0.12;

    const x = (i) => PAD.l + (i / (entries.length - 1)) * (W - PAD.l - PAD.r);
    const y = (w) => PAD.t + (1 - (w - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}` });
    svg.style.touchAction = 'pan-y';

    // Рекессивная сетка: только min и max значения серии
    const wMin = Math.min(...ws), wMax = Math.max(...ws);
    for (const gv of wMax === wMin ? [wMin] : [wMin, wMax]) {
      const gy = y(gv);
      const line = el('line', { x1: PAD.l, x2: W - PAD.r, y1: gy, y2: gy, stroke: 'var(--separator)', 'stroke-width': 1 });
      svg.appendChild(line);
      const lbl = el('text', { x: W - PAD.r + 6, y: gy + 3.5, 'font-size': 10, fill: 'var(--hint)' });
      lbl.textContent = Viz.fmt(gv);
      svg.appendChild(lbl);
    }

    // Заливка под линией — едва заметная
    const pts = entries.map((e, i) => `${x(i)},${y(e.w)}`);
    const area = el('path', {
      d: `M${x(0)},${y(entries[0].w)} L${pts.join(' L')} L${x(entries.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`,
      fill: 'var(--accent)', opacity: 0.07,
    });
    svg.appendChild(area);

    // Линия серии
    const path = el('path', {
      d: 'M' + pts.join(' L'),
      fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    });
    svg.appendChild(path);

    // Последняя точка: маркер с кольцом цвета фона
    const li = entries.length - 1;
    svg.appendChild(el('circle', { cx: x(li), cy: y(entries[li].w), r: 5.5, fill: 'var(--bg)' }));
    svg.appendChild(el('circle', { cx: x(li), cy: y(entries[li].w), r: 3.5, fill: 'var(--accent)' }));

    // Подписи дат: первая и последняя
    const d0 = el('text', { x: PAD.l, y: H - 6, 'font-size': 10, fill: 'var(--hint)' });
    d0.textContent = fmtDate(entries[0].d);
    svg.appendChild(d0);
    const d1 = el('text', { x: W - PAD.r, y: H - 6, 'font-size': 10, fill: 'var(--hint)', 'text-anchor': 'end' });
    d1.textContent = fmtDate(entries[li].d);
    svg.appendChild(d1);

    // Hover/touch-слой: ближайшая точка → тултип
    const hoverDot = el('circle', { r: 4, fill: 'var(--accent)', stroke: 'var(--bg)', 'stroke-width': 2, opacity: 0 });
    svg.appendChild(hoverDot);

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    container.style.position = 'relative';

    const hide = () => { tip.hidden = true; hoverDot.setAttribute('opacity', 0); };
    svg.addEventListener('pointermove', (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(entries.length - 1,
        Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (entries.length - 1))));
      const e = entries[i];
      hoverDot.setAttribute('cx', x(i));
      hoverDot.setAttribute('cy', y(e.w));
      hoverDot.setAttribute('opacity', 1);
      tip.textContent = `${fmtDate(e.d)} · ${Viz.fmt(e.w)} кг`;
      tip.hidden = false;
      const tx = Math.max(6, Math.min(rect.width - 90, (x(i) / W) * rect.width - 40));
      tip.style.left = tx + 'px';
      tip.style.top = Math.max(0, (y(e.w) / H) * rect.height - 30) + 'px';
    });
    svg.addEventListener('pointerleave', hide);

    container.appendChild(svg);
    container.appendChild(tip);
  }

  return { render };
})();
