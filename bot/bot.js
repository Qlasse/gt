/**
 * GymTracker bot — отдаёт кнопку запуска mini-app.
 * Вся память приложения хранится в Telegram CloudStorage на стороне пользователя,
 * поэтому перезапуск бота ничего не теряет.
 */
require('dotenv').config();
const { Bot, InlineKeyboard } = require('grammy');

const token = process.env.BOT_TOKEN;
const webappUrl = process.env.WEBAPP_URL;

if (!token || !webappUrl) {
  console.error('Заполните BOT_TOKEN и WEBAPP_URL в файле .env (см. .env.example)');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('start', (ctx) =>
  ctx.reply('Привет! Это трекер рабочих весов.\nОткрывай приложение и записывай прогресс 💪', {
    reply_markup: new InlineKeyboard().webApp('Открыть GymTracker', webappUrl),
  })
);

bot.catch((err) => console.error('Ошибка бота:', err));

bot.start();
console.log('Бот запущен. Mini-app:', webappUrl);
