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

type MaxUser = {
  user_id?: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};

const getUserFromContext = (ctx: Context): MaxUser | undefined => {
  if (ctx.user) {
    return ctx.user;
  }

  const messageSender = ctx.message?.sender;
  if (messageSender) {
    return messageSender;
  }

  const updateUser = (ctx.update as { user?: { user_id: number; name?: string } }).user;
  if (updateUser) {
    return updateUser;
  }

  return undefined;
};

const buildMiniAppUrlForContext = (ctx: Context): string => {
  try {
    const baseUrl = new URL(MINIAPP_URL);
    const user = getUserFromContext(ctx);

    if (user?.user_id) {
      baseUrl.searchParams.set('user_id', String(user.user_id));
    }

    const firstName = user?.first_name ?? null;
    const lastName = user?.last_name ?? null;
    const legacyName = user?.name ?? null;

    const composedName = [firstName, lastName]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .join(' ')
      .trim();

    const nameToUse = composedName || legacyName || null;

    if (nameToUse) {
      baseUrl.searchParams.set('user_name', nameToUse);
    }

    const username = user?.username;
    if (username) {
      baseUrl.searchParams.set('username', username);
    }

    return baseUrl.toString();
  } catch (error) {
    console.error('Failed to build MiniApp URL with user context:', error);
    return MINIAPP_URL;
  }
};

const sendMiniAppLink = async (ctx: Context) => {
  try {
    const urlWithContext = buildMiniAppUrlForContext(ctx);
    const isValidUrl = isSecureMiniAppUrl(urlWithContext);
    console.log('🔍 Checking URL:', urlWithContext, 'Valid:', isValidUrl);

    if (isValidUrl) {
      await ctx.reply(
        '👋 Привет! Нажми на кнопку ниже, чтобы открыть мини-приложение:',
        {
          attachments: [createMiniAppKeyboard(urlWithContext)],
        },
      );
      console.log('✅ Message sent with inline keyboard');
    } else {
      await ctx.reply(
        `👋 Привет! Мини-приложение доступно по адресу:\n\n${urlWithContext}\n\nНастройте HTTPS URL в .env, чтобы открывать его прямо внутри MAX.`,
        {
          attachments: [createMiniAppKeyboard(urlWithContext, '🔗 Открыть в браузере')],
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

// Обработка кодов привязки аккаунта
const CODE_REGEX = /^[A-F0-9]{8}$/;

bot.on('message_created', async (ctx) => {
  const text = ctx.message?.body?.text?.trim();
  if (!text) {
    return;
  }

  // Проверяем, является ли сообщение кодом
  if (!CODE_REGEX.test(text)) {
    return;
  }

  const user = getUserFromContext(ctx);
  if (!user?.user_id) {
    await ctx.reply('❌ Не удалось определить ваш аккаунт. Попробуйте позже.');
    return;
  }

  const userId = String(user.user_id);
  const code = text.toUpperCase();

  try {
    // Проверяем код через API
    const apiBase = process.env.MINIAPP_API_BASE || 'http://localhost:3000';
    const checkResponse = await fetch(`${apiBase}/api/auth/check-code/${code}`);
    
    if (!checkResponse.ok) {
      if (checkResponse.status === 404) {
        await ctx.reply('❌ Код не найден или истёк. Пожалуйста, сгенерируйте новый код в мини-приложении.');
      } else {
        await ctx.reply('❌ Произошла ошибка при проверке кода. Попробуйте позже.');
      }
      return;
    }

    const checkData = await checkResponse.json() as { bound: boolean; userId: string | null };
    
    if (checkData.bound) {
      if (checkData.userId === userId) {
        await ctx.reply('✅ Этот код уже привязан к вашему аккаунту. Вы можете использовать мини-приложение.');
      } else {
        await ctx.reply('❌ Этот код уже привязан к другому аккаунту. Пожалуйста, сгенерируйте новый код.');
      }
      return;
    }

    // Показываем подтверждение
    const confirmKeyboard = Keyboard.inlineKeyboard([
      [
        Keyboard.button.callback('✅ Привязать', `bind_${code}_${userId}`),
        Keyboard.button.callback('❌ Отмена', `cancel_bind_${code}`),
      ],
    ]);

    await ctx.reply(
      '⚠️ Вы собираетесь привязать свой аккаунт Макс к мини приложению.\n\n' +
      'Не используйте чужие коды и не передавайте их никому.',
      {
        attachments: [confirmKeyboard],
      },
    );
  } catch (error) {
    console.error('❌ Error processing auth code:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Обработка подтверждения привязки
bot.on('message_callback', async (ctx) => {
  // Получаем payload из callback
  const callbackPayload = (ctx.update as { callback?: { payload?: string } })?.callback?.payload;
  
  if (!callbackPayload) {
    console.log('⚠️ No callback payload found in update:', JSON.stringify(ctx.update, null, 2));
    return;
  }

  const data = callbackPayload;
  console.log('📥 Callback payload received:', data);

  if (data.startsWith('bind_')) {
    const parts = data.split('_');
    if (parts.length !== 3) {
      await ctx.answerOnCallback({});
      await ctx.reply('❌ Ошибка: неверный формат данных');
      return;
    }

    const code = parts[1];
    const userId = parts[2];

    // Получаем пользователя из callback или из контекста
    const callbackUser = (ctx.update as { callback?: { user?: { user_id?: number } } })?.callback?.user;
    const user = callbackUser || getUserFromContext(ctx);
    
    if (!user?.user_id || String(user.user_id) !== userId) {
      await ctx.answerOnCallback({});
      await ctx.reply('❌ Ошибка: неверный пользователь');
      return;
    }

    try {
      const apiBase = process.env.MINIAPP_API_BASE || 'http://localhost:3000';
      const bindResponse = await fetch(`${apiBase}/api/auth/bind-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, userId }),
      });

      if (!bindResponse.ok) {
        const errorData = await bindResponse.json() as { error?: string };
        await ctx.answerOnCallback({});
        await ctx.reply(`❌ Ошибка привязки: ${errorData.error || 'Неизвестная ошибка'}`);
        return;
      }

      await ctx.answerOnCallback({});
      
      // Обновляем сообщение с подтверждением
      try {
        await ctx.editMessage({
          text: '✅ Аккаунт успешно привязан!\n\n' +
          'Теперь вы можете использовать мини-приложение. Обновите страницу в мини-приложении или откройте его по ссылке ниже.',
        });
      } catch (editError) {
        console.error('Failed to edit message:', editError);
        // Если не удалось отредактировать, отправляем новое сообщение
        await ctx.reply('✅ Аккаунт успешно привязан!\n\n' +
          'Теперь вы можете использовать мини-приложение. Обновите страницу в мини-приложении или откройте его по ссылке ниже.');
      }

      // Отправляем ссылку на мини-приложение с user_id
      const urlWithContext = buildMiniAppUrlForContext(ctx);
      await ctx.reply(
        '🚀 Откройте мини-приложение:',
        {
          attachments: [createMiniAppKeyboard(urlWithContext)],
        },
      );
    } catch (error) {
      console.error('❌ Error binding code:', error);
      await ctx.answerOnCallback({});
      await ctx.reply('❌ Произошла ошибка при привязке аккаунта. Попробуйте позже.');
    }
  } else if (data.startsWith('cancel_bind_')) {
    await ctx.answerOnCallback({});
    try {
      await ctx.editMessage({
        text: '❌ Привязка отменена.\n\n' +
        'Если вы хотите привязать аккаунт, сгенерируйте новый код в мини-приложении и отправьте его боту.',
      });
    } catch (editError) {
      console.error('Failed to edit message:', editError);
      await ctx.reply('❌ Привязка отменена.\n\n' +
        'Если вы хотите привязать аккаунт, сгенерируйте новый код в мини-приложении и отправьте его боту.');
    }
  }
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
