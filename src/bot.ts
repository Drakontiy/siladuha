import dotenv from 'dotenv';
import { Bot, Context, Keyboard } from '@maxhub/max-bot-api';

dotenv.config();

const BOT_TOKEN = (process.env.BOT_TOKEN ?? '').trim();
const MINIAPP_URL = (process.env.MINIAPP_URL ?? 'http://localhost:3000').trim();

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required in .env file');
}

const bot = new Bot(BOT_TOKEN);

bot.use(async (ctx, next) => {
  console.log('📥 Received update:', ctx.updateType);
  const text = ctx.message?.body?.text;
  if (text) {
    console.log('💬 Message:', text);
  }
  return next();
});

function isSecureMiniAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname !== 'localhost';
  } catch {
    return false;
  }
}

const createMiniAppKeyboard = (url: string, text = '🚀 Открыть Mini App') => {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.link(text, url)],
  ]);
};

const sendMiniAppLink = async (ctx: Context) => {
  try {
    const isValidUrl = isSecureMiniAppUrl(MINIAPP_URL);
    console.log('🔍 Checking URL:', MINIAPP_URL, 'Valid:', isValidUrl);

    if (isValidUrl) {
      await ctx.reply(
        '👋 Привет! Нажми на кнопку ниже, чтобы открыть мини-приложение:',
        {
          attachments: [createMiniAppKeyboard(MINIAPP_URL)],
        },
      );
      console.log('✅ Message sent with inline keyboard');
    } else {
      await ctx.reply(
        `👋 Привет! Мини-приложение доступно по адресу:\n\n${MINIAPP_URL}\n\nНастройте HTTPS URL в .env, чтобы открывать его прямо внутри MAX.`,
        {
          attachments: [createMiniAppKeyboard(MINIAPP_URL, '🔗 Открыть в браузере')],
        },
      );
      console.log('⚠️ Fallback message sent with regular link');
    }
  } catch (error) {
    console.error('❌ Error while sending mini app link:', error);
    try {
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
};

bot.on('bot_started', sendMiniAppLink);
bot.command('start', sendMiniAppLink);

bot.command('help', async (ctx) => {
  await ctx.reply('Используй /start, чтобы получить ссылку на мини-приложение.');
});

bot.catch(async (err, ctx) => {
  console.error('❌ Bot error:', err);
  console.error('Context:', ctx.update);
  try {
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  } catch (replyError) {
    console.error('Failed to send error message:', replyError);
  }
});

(async () => {
  try {
    await bot.api.setMyCommands([
      { name: 'start', description: 'Получить ссылку на мини-приложение' },
      { name: 'help', description: 'Показать справку' },
    ]);

    const info = await bot.api.getMyInfo().catch(() => undefined);
    console.log('✅ MAX bot is ready to start polling!');
    if (info) {
      console.log('📱 Bot profile:', info.username ?? info.name);
    }
    console.log('🌐 MiniApp URL:', MINIAPP_URL);
    console.log('✅ URL is valid for inline link:', isSecureMiniAppUrl(MINIAPP_URL));
    console.log('🚀 Launching long polling…');

    await bot.start();
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
})();

const gracefulShutdown = (signal: string) => {
  console.log(`🛑 Received ${signal}, stopping bot…`);
  bot.stop();
  process.exit(0);
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

export { bot };
