/**
 * Типы визуализаций и дефолтный каталог упражнений.
 */
const VIZ_TYPES = {
  barbell: {
    label: 'Штанга',
    defaultStep: 2.5,
    min: 20,
    max: 500,
    defaultWeight: 60,
  },
  stack: {
    label: 'Блок',
    defaultStep: 5,
    min: 5,
    max: 150,
    defaultWeight: 40,
  },
  dumbbell: {
    label: 'Гантель',
    defaultStep: 2,
    min: 1,
    max: 100,
    defaultWeight: 14,
  },
  plates: {
    label: 'Тренажёр',
    defaultStep: 5,
    min: 0,
    max: 600,
    defaultWeight: 40,
  },
  body: {
    label: 'Свой вес',
    defaultStep: 2.5,
    min: 0,
    max: 150,
    defaultWeight: 0,
  },
  kettlebell: {
    label: 'Гиря',
    defaultStep: 4,
    min: 4,
    max: 48,
    defaultWeight: 16,
    // Вес шагает по стандартным номиналам гирь, а не арифметически
    nominals: [4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48],
  },
};

const DEFAULT_EXERCISES = [
  { id: 'bench',   name: 'Жим лёжа',            type: 'barbell',  favorite: false, step: 2.5, barWeight: 20, weight: 60 },
  { id: 'dbpress', name: 'Жим гантелей',        type: 'dumbbell', favorite: false, step: 2,   weight: 16 },
  { id: 'latpull', name: 'Тяга верхнего блока', type: 'stack',    favorite: false, step: 5,   weight: 50 },
];

/** Шаблоны для быстрого добавления через «+» (уже добавленные не показываются). */
const EXERCISE_PRESETS = [
  { name: 'Присед',                     type: 'barbell',    step: 2.5, barWeight: 20, weight: 80 },
  { name: 'Становая тяга',              type: 'barbell',    step: 2.5, barWeight: 20, weight: 100 },
  { name: 'Тяга горизонтального блока', type: 'stack',      step: 5,   weight: 45 },
  { name: 'Жим ногами',                 type: 'plates',     step: 5,   weight: 80 },
  { name: 'Подтягивания с весом',       type: 'body',       step: 2.5, weight: 0 },
  { name: 'Свинг гирей',                type: 'kettlebell', step: 4,   weight: 16 },
];

/** Цвета карточек — та же приглушённая палитра, что у блинов на штанге. */
const CARD_COLORS = ['#4a7dbd', '#c9564f', '#d3a93c', '#579e60', '#7d6bb5', '#cf8b4a', '#87909b'];

/** Сколько записей истории храним на упражнение (лимит CloudStorage — 4096 символов на ключ). */
const LOG_LIMIT = 60;

/** Ключи хранилища. CloudStorage допускает только A-Z, a-z, 0-9, _ и - (двоеточие нельзя!). */
const KEY_EXERCISES = 'exercises';
const keyLog = (exerciseId) => 'log_' + exerciseId;
