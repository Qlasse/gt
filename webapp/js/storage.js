/**
 * Хранилище: Telegram CloudStorage с прозрачным fallback на localStorage.
 * CloudStorage доступен только внутри Telegram (initData не пуст) с Bot API 6.9+.
 * Все значения — JSON-строки. Лимиты CloudStorage: 1024 ключа, 4096 символов на значение.
 */
const Storage = (() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  const useCloud = !!(
    tg &&
    tg.initData &&
    tg.CloudStorage &&
    typeof tg.isVersionAtLeast === 'function' &&
    tg.isVersionAtLeast('6.9')
  );

  const LS_PREFIX = 'gymtracker:';

  // Обёртка: облачный вызов не должен ни бросить исключение, ни зависнуть
  // (например, из-за невалидного ключа) — через 3 c промис резолвится сам.
  function cloudCall(fn) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      setTimeout(() => done(null), 3000);
      try { fn(done); } catch (_) { done(null); }
    });
  }

  function cloudGet(key) {
    return cloudCall((done) =>
      tg.CloudStorage.getItem(key, (err, value) => done(err ? null : value || null)));
  }

  function cloudSet(key, value) {
    return cloudCall((done) =>
      tg.CloudStorage.setItem(key, value, () => done()));
  }

  function cloudRemove(key) {
    return cloudCall((done) =>
      tg.CloudStorage.removeItem(key, () => done()));
  }

  async function getRaw(key) {
    if (useCloud) return cloudGet(key);
    return localStorage.getItem(LS_PREFIX + key);
  }

  async function setRaw(key, value) {
    if (useCloud) return cloudSet(key, value);
    localStorage.setItem(LS_PREFIX + key, value);
  }

  async function get(key, fallback = null) {
    const raw = await getRaw(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  async function set(key, value) {
    return setRaw(key, JSON.stringify(value));
  }

  async function remove(key) {
    if (useCloud) return cloudRemove(key);
    localStorage.removeItem(LS_PREFIX + key);
  }

  // Отложенная запись: при скрабе веса не спамим CloudStorage — пишем не чаще
  // чем раз в 800 мс на ключ, последнее значение всегда доезжает.
  const pending = new Map();
  function setDebounced(key, value, delay = 800) {
    const entry = pending.get(key);
    if (entry) clearTimeout(entry.timer);
    const timer = setTimeout(() => {
      pending.delete(key);
      set(key, value);
    }, delay);
    pending.set(key, { timer, value });
  }

  /** Немедленно записать всё отложенное (перед закрытием/записью подхода). */
  function flush() {
    for (const [key, entry] of pending) {
      clearTimeout(entry.timer);
      set(key, entry.value);
    }
    pending.clear();
  }

  return { get, set, remove, setDebounced, flush, useCloud };
})();
