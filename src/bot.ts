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
  // Логируем callback события для отладки
  if (ctx.updateType === 'message_callback') {
    console.log('🔔 Callback update detected in middleware');
    console.log('🔔 Callback object:', JSON.stringify(ctx.callback, null, 2));
    console.log('🔔 Full update:', JSON.stringify(ctx.update, null, 2));
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

    // Передаём полное имя в user_name
    if (nameToUse) {
      baseUrl.searchParams.set('user_name', nameToUse);
    }
    
    // Также передаём имя и фамилию отдельно для удобства парсинга
    if (firstName) {
      baseUrl.searchParams.set('first_name', firstName);
    }
    if (lastName) {
      baseUrl.searchParams.set('last_name', lastName);
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

    // Отправляем приветственное сообщение без кнопки
    // Пользователь должен использовать встроенную кнопку мини-приложения в мессенджере
      await ctx.reply(
      'Привет! С моей помощью ты сможешь избавиться от прокрастинации!. Ежедневно заполняй свой дневник работы и следи за тем сколько времени тратишь впустую.',
      );
    console.log('✅ Welcome message sent');
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
  // Логируем структуру update для отладки
  console.log('📥 Message callback received');
  console.log('📋 Update type:', ctx.updateType);
  console.log('📋 Callback object:', ctx.callback);
  
  // Получаем данные callback через ctx.callback.payload
  const callback = ctx.callback;
  if (!callback) {
    console.log('⚠️ No callback object found in context');
    console.log('📋 Full update:', JSON.stringify(ctx.update, null, 2));
    return;
  }
  
  // Данные callback находятся в callback.payload
  const callbackData = callback.payload;
  
  console.log('🔍 Extracted callback data (payload):', callbackData);
  
  if (!callbackData) {
    console.log('⚠️ No callback payload found. Callback object:', JSON.stringify(callback, null, 2));
    console.log('📋 Full update:', JSON.stringify(ctx.update, null, 2));
    return;
  }

  const data = callbackData;
  console.log(`📋 Processing callback data: ${data}`);

  if (data.startsWith('bind_')) {
    console.log(`🔗 Processing bind callback`);
    const parts = data.split('_');
    if (parts.length !== 3) {
      console.log(`❌ Invalid bind callback format: expected 3 parts, got ${parts.length}`);
      return;
    }

    const code = parts[1];
    const userId = parts[2];
    console.log(`📋 Extracted code: ${code}, userId: ${userId}`);

    const user = getUserFromContext(ctx);
    console.log(`👤 User from context:`, user);
    
    if (!user?.user_id || String(user.user_id) !== userId) {
      console.log(`❌ User mismatch: context user_id=${user?.user_id}, callback userId=${userId}`);
      try {
        // Отвечаем на callback с уведомлением об ошибке
        await ctx.answerOnCallback({ notification: '❌ Ошибка: неверный пользователь' });
      } catch (answerError) {
        console.error('Failed to answer callback:', answerError);
      }
      await ctx.reply('❌ Ошибка: неверный пользователь');
      return;
    }

    // Получаем имя пользователя из контекста
    const firstName = user?.first_name ?? null;
    const lastName = user?.last_name ?? null;
    const legacyName = user?.name ?? null;
    
    const composedName = [firstName, lastName]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .join(' ')
      .trim();
    
    const userName = composedName || legacyName || null;

    // Сначала выполняем привязку кода
    let bindSuccessful = false;
    let bindError: string | null = null;
    
    console.log(`🔗 Attempting to bind code: ${code} to userId: ${userId}, userName: ${userName}`);
    
    try {
      const apiBase = process.env.MINIAPP_API_BASE || 'http://localhost:3000';
      console.log(`📡 Calling bind API: ${apiBase}/api/auth/bind-code`);
      
      const bindResponse = await fetch(`${apiBase}/api/auth/bind-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, userId, userName }),
      });

      console.log(`📡 Bind API response status: ${bindResponse.status}`);

      if (!bindResponse.ok) {
        const errorData = await bindResponse.json() as { error?: string };
        bindError = errorData.error || 'Ошибка привязки';
        bindSuccessful = false;
        console.log(`❌ Bind failed: ${bindError}`);
      } else {
        // Проверяем, что привязка действительно прошла успешно
        const bindData = await bindResponse.json() as { success?: boolean; userId?: string };
        console.log(`📋 Bind API response data:`, bindData);
        
        if (bindData.success && bindData.userId === userId) {
          bindSuccessful = true;
          console.log(`✅ Bind successful: code ${code} bound to userId ${userId}`);
        } else {
          bindError = 'Ошибка при привязке аккаунта';
          bindSuccessful = false;
          console.log(`❌ Bind response invalid: success=${bindData.success}, userId=${bindData.userId}, expected=${userId}`);
        }
      }
    } catch (bindRequestError) {
      console.error('❌ Error during bind request:', bindRequestError);
      // Проверяем, возможно привязка всё же прошла успешно
      try {
        const apiBase = process.env.MINIAPP_API_BASE || 'http://localhost:3000';
        console.log(`🔍 Verifying bind status for code: ${code}`);
        const checkResponse = await fetch(`${apiBase}/api/auth/check-code/${code}`);
        if (checkResponse.ok) {
          const checkData = await checkResponse.json() as { bound: boolean; userId: string | null };
          console.log(`🔍 Check code response:`, checkData);
          if (checkData.bound && checkData.userId === userId) {
            bindSuccessful = true;
            console.log('✅ Code was bound successfully (verified after error)');
          } else {
            console.log(`❌ Code not bound: bound=${checkData.bound}, userId=${checkData.userId}, expected=${userId}`);
          }
        } else {
          console.log(`❌ Check code failed with status: ${checkResponse.status}`);
        }
      } catch (checkError) {
        console.error('Failed to verify bind status:', checkError);
      }
      
      if (!bindSuccessful) {
        bindError = 'Произошла ошибка при привязке аккаунта';
      }
    }
    
    console.log(`📊 Bind result: successful=${bindSuccessful}, error=${bindError}`);

    // Теперь отправляем ответы пользователю только если уверены в результате
    if (bindSuccessful) {
      // Привязка успешна - отвечаем на callback с уведомлением
      try {
        await ctx.answerOnCallback({ notification: '✅ Аккаунт успешно привязан!' });
      } catch (answerError) {
        console.error('Failed to answer callback (but bind was successful):', answerError);
        // Не критично, продолжаем - привязка прошла успешно
      }
      
      // Пытаемся отредактировать сообщение с подтверждением
      try {
        await ctx.editMessage({
          text: '✅ Аккаунт успешно привязан!\n\n' +
          'Теперь вы можете использовать мини-приложение.',
        });
      } catch (editError) {
        console.log('Could not edit message, sending new message instead');
        // Если не удалось отредактировать, отправляем новое сообщение
        try {
          await ctx.reply('✅ Аккаунт успешно привязан!\n\n' +
            'Теперь вы можете использовать мини-приложение.');
        } catch (replyError) {
          console.error('Failed to send success message:', replyError);
          // Не критично, привязка прошла успешно
        }
      }

      // Привязка успешна, пользователь может использовать мини-приложение через встроенную кнопку
    } else {
      // Привязка не прошла - отправляем ошибку только если уверены
      const errorMessage = bindError || 'Произошла ошибка при привязке аккаунта';
      try {
        // Отвечаем на callback с уведомлением об ошибке
        await ctx.answerOnCallback({ notification: `❌ ${errorMessage}` });
      } catch (answerError) {
        console.error('Failed to answer callback with error:', answerError);
      }
      try {
        await ctx.reply(`❌ ${errorMessage}. Попробуйте позже.`);
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  } else if (data.startsWith('cancel_bind_')) {
    try {
      // Отвечаем на callback с уведомлением
      await ctx.answerOnCallback({ notification: 'Отменено' });
    } catch (answerError) {
      console.error('Failed to answer callback:', answerError);
    }
    
    // Пытаемся отредактировать сообщение
    try {
      await ctx.editMessage({ 
        text: '❌ Привязка отменена.\n\n' +
        'Если вы хотите привязать аккаунт, сгенерируйте новый код в мини-приложении и отправьте его боту.',
      });
    } catch (editError) {
      console.log('Could not edit message, sending new message instead');
      // Если не удалось отредактировать, отправляем новое сообщение
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
