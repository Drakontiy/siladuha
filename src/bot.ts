import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MINIAPP_URL = process.env.MINIAPP_URL || 'http://localhost:3000';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required in .env file');
}

const bot = new Telegraf(BOT_TOKEN);

// Логирование входящих обновлений для отладки (должно быть ПЕРЕД обработчиками)
bot.use((ctx, next) => {
  console.log('📥 Received update:', ctx.updateType);
  if (ctx.message && 'text' in ctx.message) {
    console.log('💬 Message:', ctx.message.text);
  }
  return next();
});

// Проверка валидности URL для web_app (только HTTPS)
function isValidWebAppUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:' && urlObj.hostname !== 'localhost';
  } catch {
    return false;
  }
}

// Команда /start
bot.start(async (ctx) => {
  try {
    const isValidUrl = isValidWebAppUrl(MINIAPP_URL);
    console.log('🔍 Checking URL:', MINIAPP_URL, 'Valid:', isValidUrl);
    
    if (isValidUrl) {
      // Используем web_app кнопку только для HTTPS URL
      try {
        await ctx.reply(
          '👋 Привет! Нажми на кнопку ниже, чтобы открыть мини-приложение:',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🚀 Открыть Mini App',
                    web_app: { url: MINIAPP_URL }
                  }
                ]
              ]
            }
          }
        );
        console.log('✅ Message sent with web_app button');
      } catch (error: any) {
        console.error('❌ Error sending web_app button:', error.message);
        // Fallback: отправляем без кнопки или с обычной кнопкой
        await ctx.reply(
          `👋 Привет! Мини-приложение доступно по адресу:\n\n${MINIAPP_URL}\n\nНажмите на ссылку, чтобы открыть.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🔗 Открыть в браузере',
                    url: MINIAPP_URL
                  }
                ]
              ]
            }
          }
        );
      }
    } else {
      // Для невалидного URL показываем обычную кнопку или просто текст
      await ctx.reply(
        `👋 Привет! Мини-приложение доступно по адресу:\n\n${MINIAPP_URL}\n\nДля работы в Telegram настройте HTTPS URL в .env файле.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔗 Открыть в браузере',
                  url: MINIAPP_URL
                }
              ]
            ]
          }
        }
      );
      console.log('✅ Message sent with regular button');
    }
  } catch (error: any) {
    console.error('❌ Error in /start handler:', error);
    try {
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
});

// Команда /help
bot.help((ctx) => {
  ctx.reply('Используй /start для начала работы');
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
  console.error('Context:', ctx);
  try {
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  } catch (e) {
    console.error('Failed to send error message:', e);
  }
});

// Запуск бота
bot.launch()
  .then(() => {
    console.log('✅ Bot started successfully!');
    console.log('📱 Bot token:', BOT_TOKEN.substring(0, 10) + '...');
    console.log('🌐 MiniApp URL:', MINIAPP_URL);
    console.log('✅ URL is valid for web_app:', isValidWebAppUrl(MINIAPP_URL));
  })
  .catch((err) => {
    console.error('❌ Failed to start bot:', err);
    process.exit(1);
  });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

export { bot };
