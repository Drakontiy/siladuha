import { bot } from '../bot';

const toNumericUserId = (userId: string): number | null => {
  if (!userId) {
    return null;
  }
  const numeric = Number(userId);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
};

const withErrorLogging = async (action: () => Promise<void>, context: string) => {
  try {
    await action();
  } catch (error) {
    console.warn(`⚠️ Failed to send notification (${context}):`, error);
  }
};

const sendDirectMessage = async (rawUserId: string, text: string) => {
  const userId = toNumericUserId(rawUserId);
  if (userId === null) {
    console.warn(`⚠️ Unable to send notification, userId "${rawUserId}" is not numeric.`);
    return;
  }
  if (!bot?.api) {
    console.warn('⚠️ Bot API is not available to send notifications.');
    return;
  }
  await bot.api.sendMessageToUser(userId, text);
};

const fallbackName = (name?: string | null, fallbackId?: string): string => {
  const trimmed = name?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  if (fallbackId) {
    return `пользователь ${fallbackId}`;
  }
  return 'пользователь';
};

export const notifyFriendRequestCreated = async (
  targetUserId: string,
  requesterId: string,
  requesterName?: string | null,
) => {
  await withErrorLogging(
    () =>
      sendDirectMessage(
        targetUserId,
        `👋 ${fallbackName(requesterName, requesterId)} хочет добавить вас в друзья.\n` +
          'Откройте вкладку «Люди» в мини-приложении, чтобы принять или отклонить заявку.',
      ),
    'friend_request_created',
  );
};

export const notifyFriendRequestAccepted = async (
  requesterUserId: string,
  responderId: string,
  responderName?: string | null,
) => {
  await withErrorLogging(
    () =>
      sendDirectMessage(
        requesterUserId,
        `✅ ${fallbackName(responderName, responderId)} принял(а) вашу заявку в друзья.\n` +
          'Теперь вы можете видеть его статистику во вкладке «Статистика», если доступ предоставлен.',
      ),
    'friend_request_accepted',
  );
};

export const notifyFriendRequestDeclined = async (
  requesterUserId: string,
  responderId: string,
  responderName?: string | null,
) => {
  await withErrorLogging(
    () =>
      sendDirectMessage(
        requesterUserId,
        `ℹ️ ${fallbackName(responderName, responderId)} отклонил(а) вашу заявку в друзья.`,
      ),
    'friend_request_declined',
  );
};


