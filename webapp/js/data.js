/**
 * Типы визуализаций и дефолтный каталог упражнений.
 */
const VIZ_TYPES = {
  barbell: {
    label: 'Штанга',
    defaultStep: 2.5,
    min: 20,
    max: 400,
    defaultWeight: 60,
  },
  stack: {
    label: 'Блок',
    defaultStep: 5,
    min: 5,
    max: 125,
    defaultWeight: 40,
  },
  dumbbell: {
    label: 'Гантель',
    defaultStep: 2,
    min: 1,
    max: 80,
    defaultWeight: 14,
  },
};

const DEFAULT_EXERCISES = [
  { id: 'bench',    name: 'Жим лёжа',                  type: 'barbell',  favorite: true,  step: 2.5, barWeight: 20, weight: 60 },
  { id: 'squat',    name: 'Присед',                    type: 'barbell',  favorite: false, step: 2.5, barWeight: 20, weight: 80 },
  { id: 'deadlift', name: 'Становая тяга',             type: 'barbell',  favorite: false, step: 2.5, barWeight: 20, weight: 100 },
  { id: 'latpull',  name: 'Тяга верхнего блока',       type: 'stack',    favorite: true,  step: 5,   weight: 50 },
  { id: 'row',      name: 'Тяга горизонтального блока', type: 'stack',   favorite: false, step: 5,   weight: 45 },
  { id: 'dbpress',  name: 'Жим гантелей',              type: 'dumbbell', favorite: false, step: 2,   weight: 16 },
];

/** Сколько записей истории храним на упражнение (лимит CloudStorage — 4096 символов на ключ). */
const LOG_LIMIT = 60;

/** Ключи хранилища. */
const KEY_EXERCISES = 'exercises';
const keyLog = (exerciseId) => 'log:' + exerciseId;
