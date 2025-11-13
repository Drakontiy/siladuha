import { randomBytes, randomUUID } from 'crypto';
import cors from 'cors';
import express from 'express';
import path from 'path';
import {
  DEFAULT_USER_STATE,
  initUserStateStore,
  readUserState,
  writeUserState,
  StoredFriend,
  StoredFriendRequest,
  StoredNotification,
  StoredSocialState,
  StoredDailyGoalState,
  StoredAchievementsState,
  StoredAchievementFlag,
  StoredCosmeticCategoryState,
  StoredCosmeticThemeProgress,
  StoredHomeCosmeticsState,
  StoredHomeState,
  StoredUserState,
  DEFAULT_HOME_STATE,
} from './storage/userStateStore';
import {
  notifyFriendRequestAccepted,
  notifyFriendRequestCreated,
  notifyFriendRequestDeclined,
} from './services/notifications';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const API_BASE_PATH = '/api';
const USER_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

// Хранилище временных кодов для привязки аккаунтов
interface AuthCode {
  code: string;
  expiresAt: number;
  userId: string | null;
}

const authCodes = new Map<string, AuthCode>();

// Очистка истекших кодов каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes.entries()) {
    if (data.expiresAt < now) {
      authCodes.delete(code);
    }
  }
}, 5 * 60 * 1000);

void initUserStateStore().catch((error) => {
  console.error('❌ Failed to initialize user state store:', error);
  process.exit(1);
});

// Разрешаем все хосты (для работы через прокси/туннель)
app.set('trust proxy', true);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: '1mb',
  }),
);

const sanitizeUserId = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || !USER_ID_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const cloneStoredAchievementFlag = (flag: StoredAchievementFlag): StoredAchievementFlag => ({
  unlocked: flag.unlocked,
  unlockedAt: flag.unlockedAt,
});

const cloneStoredAchievements = (achievements: StoredAchievementsState): StoredAchievementsState => ({
  firstGoalCompleted: cloneStoredAchievementFlag(achievements.firstGoalCompleted),
  focusEightHours: cloneStoredAchievementFlag(achievements.focusEightHours),
  sleepSevenNights: cloneStoredAchievementFlag(achievements.sleepSevenNights),
});

const cloneStoredGoals = (goals: Record<string, StoredDailyGoalState>): Record<string, StoredDailyGoalState> => {
  const result: Record<string, StoredDailyGoalState> = {};
  Object.entries(goals ?? {}).forEach(([key, goal]) => {
    if (!goal) {
      return;
    }
    result[key] = { ...goal };
  });
  return result;
};

const cloneStoredCosmeticThemeProgress = (
  progress: StoredCosmeticThemeProgress | undefined,
): StoredCosmeticThemeProgress => ({
  levelsUnlocked: progress?.levelsUnlocked ?? 0,
  currentLevel: progress?.currentLevel ?? 0,
});

const cloneStoredCosmeticCategory = (
  category: StoredCosmeticCategoryState | undefined,
): StoredCosmeticCategoryState => {
  const source = category ?? { byAchievement: {}, activeSelection: null };
  const clonedByAchievement: Record<string, StoredCosmeticThemeProgress> = {};
  Object.entries(source.byAchievement ?? {}).forEach(([key, value]) => {
    clonedByAchievement[key] = cloneStoredCosmeticThemeProgress(value);
  });
  const active = source.activeSelection;
  const activeSelection =
    active && typeof active.source === 'string' && typeof active.level === 'number'
      ? { source: active.source, level: active.level }
      : null;
  return {
    byAchievement: clonedByAchievement,
    activeSelection,
  };
};

const cloneStoredCosmetics = (cosmetics: StoredHomeCosmeticsState | undefined): StoredHomeCosmeticsState => {
  const source =
    cosmetics ??
    {
      backgrounds: DEFAULT_HOME_STATE.cosmetics.backgrounds,
      hats: DEFAULT_HOME_STATE.cosmetics.hats,
    };
  const backgroundsSource =
    (source as { backgrounds?: StoredCosmeticCategoryState; homeBackground?: StoredCosmeticCategoryState })
      .backgrounds ??
    (source as { homeBackground?: StoredCosmeticCategoryState }).homeBackground ??
    DEFAULT_HOME_STATE.cosmetics.backgrounds;
  const hatsSource =
    (source as { hats?: StoredCosmeticCategoryState; homeHat?: StoredCosmeticCategoryState }).hats ??
    (source as { homeHat?: StoredCosmeticCategoryState }).homeHat ??
    DEFAULT_HOME_STATE.cosmetics.hats;
  return {
    backgrounds: cloneStoredCosmeticCategory(backgroundsSource),
    hats: cloneStoredCosmeticCategory(hatsSource),
  };
};

const cloneStoredHomeState = (state: StoredHomeState): StoredHomeState => ({
  currentStreak: state.currentStreak,
  lastProcessedDate: state.lastProcessedDate,
  currency: state.currency,
  goals: cloneStoredGoals(state.goals),
  achievements: cloneStoredAchievements(state.achievements),
  cosmetics: cloneStoredCosmetics(state.cosmetics),
});

const cloneDefaultHomeState = () => cloneStoredHomeState(DEFAULT_USER_STATE.homeState);

const cloneSocialState = (state: StoredSocialState): StoredSocialState => ({
  friends: state.friends.map((friend) => ({ ...friend })),
  friendRequests: state.friendRequests.map((request) => ({ ...request })),
  notifications: state.notifications.map((notification) => ({
    ...notification,
    payload: notification.payload ? { ...notification.payload } : undefined,
  })),
});

const cloneDefaultSocialState = () => cloneSocialState(DEFAULT_USER_STATE.social);

const upsertFriend = (friends: StoredFriend[], friend: StoredFriend): StoredFriend[] => {
  const next = friends.filter((existing) => existing.userId !== friend.userId);
  next.push(friend);
  return next;
};

const markRequestById = (
  requests: StoredFriendRequest[],
  requestId: string,
  status: StoredFriendRequest['status'],
): StoredFriendRequest[] =>
  requests.map((request) => {
    if (request.id !== requestId) {
      return request;
    }
    return {
      ...request,
      status,
      respondedAt: new Date().toISOString(),
    };
  });

const removeFriendById = (friends: StoredFriend[], friendId: string): StoredFriend[] =>
  friends.filter((friend) => friend.userId !== friendId);

const extractPublicHomeState = (homeState: StoredUserState['homeState'] | undefined) => ({
  currentStreak: homeState?.currentStreak ?? 0,
});

const removeRequestById = (requests: StoredFriendRequest[], requestId: string): StoredFriendRequest[] =>
  requests.filter((request) => request.id !== requestId);

app.get(`${API_BASE_PATH}/health`, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok' });
});

// Генерация временного кода для привязки аккаунта
app.post(`${API_BASE_PATH}/auth/generate-code`, (_req, res) => {
  try {
    // Генерируем 8-символьный код
    const code = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = Date.now() + 2 * 60 * 1000; // 2 минуты

    authCodes.set(code, {
      code,
      expiresAt,
      userId: null,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ code, expiresAt });
  } catch (error) {
    console.error('❌ Failed to generate auth code:', error);
    res.status(500).json({ error: 'Failed to generate code' });
  }
});

// Привязка кода к user_id
app.post(`${API_BASE_PATH}/auth/bind-code`, async (req, res) => {
  try {
    const { code, userId } = req.body as { code?: string; userId?: string };

    console.log(`🔗 Bind request: code=${code}, userId=${userId}`);

    if (!code || typeof code !== 'string') {
      console.log(`❌ Bind failed: Code is required`);
      res.status(400).json({ error: 'Code is required' });
      return;
    }

    if (!userId || typeof userId !== 'string') {
      console.log(`❌ Bind failed: User ID is required`);
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const sanitizedUserId = sanitizeUserId(userId);
    if (!sanitizedUserId) {
      console.log(`❌ Bind failed: Invalid user ID: ${userId}`);
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const codeUpper = code.toUpperCase();
    const authData = authCodes.get(codeUpper);
    if (!authData) {
      console.log(`❌ Bind failed: Code not found: ${codeUpper}`);
      res.status(404).json({ error: 'Code not found or expired' });
      return;
    }

    console.log(`📋 Code data before bind:`, {
      code: authData.code,
      expiresAt: authData.expiresAt,
      expiresIn: authData.expiresAt - Date.now(),
      userId: authData.userId,
    });

    if (authData.expiresAt < Date.now()) {
      console.log(`❌ Bind failed: Code expired: ${codeUpper}`);
      authCodes.delete(codeUpper);
      res.status(404).json({ error: 'Code expired' });
      return;
    }

    if (authData.userId) {
      console.log(`❌ Bind failed: Code already used: ${codeUpper}, current userId: ${authData.userId}, requested userId: ${sanitizedUserId}`);
      // Если код уже привязан к тому же пользователю, возвращаем успех
      if (authData.userId === sanitizedUserId) {
        console.log(`✅ Code already bound to same user, returning success`);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, userId: sanitizedUserId });
        return;
      }
      res.status(409).json({ error: 'Code already used' });
      return;
    }

    // Привязываем код к user_id
    authData.userId = sanitizedUserId;
    authCodes.set(codeUpper, authData);

    console.log(`✅ Code bound successfully: ${codeUpper} -> ${sanitizedUserId}`);
    console.log(`📋 Code data after bind:`, {
      code: authData.code,
      expiresAt: authData.expiresAt,
      userId: authData.userId,
      bound: authData.userId !== null,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, userId: sanitizedUserId });
  } catch (error) {
    console.error('❌ Failed to bind auth code:', error);
    res.status(500).json({ error: 'Failed to bind code' });
  }
});

// Получение user_id по коду (для проверки привязки)
app.get(`${API_BASE_PATH}/auth/check-code/:code`, (req, res) => {
  try {
    const code = req.params.code?.toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Code is required' });
      return;
    }

    const authData = authCodes.get(code);
    if (!authData) {
      console.log(`🔍 Check code: ${code} - not found`);
      res.status(404).json({ error: 'Code not found' });
      return;
    }

    if (authData.expiresAt < Date.now()) {
      console.log(`🔍 Check code: ${code} - expired`);
      authCodes.delete(code);
      res.status(404).json({ error: 'Code expired' });
      return;
    }

    const result = {
      code: authData.code,
      expiresAt: authData.expiresAt,
      userId: authData.userId,
      bound: authData.userId !== null,
    };

    console.log(`🔍 Check code: ${code} -`, result);

    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error) {
    console.error('❌ Failed to check auth code:', error);
    res.status(500).json({ error: 'Failed to check code' });
  }
});

// Отвязка аккаунта (удаление user_id из localStorage на клиенте)
// Это просто подтверждающий endpoint, реальная очистка происходит на клиенте
app.post(`${API_BASE_PATH}/auth/unbind-account`, async (req, res) => {
  try {
    const { userId } = req.body as { userId?: string };

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const sanitizedUserId = sanitizeUserId(userId);
    if (!sanitizedUserId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Удаляем все коды, связанные с этим user_id
    for (const [code, authData] of authCodes.entries()) {
      if (authData.userId === sanitizedUserId) {
        authCodes.delete(code);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, message: 'Account unbound' });
  } catch (error) {
    console.error('❌ Failed to unbind account:', error);
    res.status(500).json({ error: 'Failed to unbind account' });
  }
});

app.get(`${API_BASE_PATH}/user/:userId/state`, async (req, res) => {
  const userId = sanitizeUserId(req.params.userId);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const state = await readUserState(userId);
    res.setHeader('Cache-Control', 'no-store');
    res.json(state);
  } catch (error) {
    console.error('❌ Failed to read user state:', error);
    res.status(500).json({ error: 'Failed to read user state' });
  }
});

app.post(`${API_BASE_PATH}/user/:userId/state`, async (req, res) => {
  const userId = sanitizeUserId(req.params.userId);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const payload = (req.body ?? {}) as Partial<StoredUserState>;

  try {
    const existingState = await readUserState(userId);
    const nextState = await writeUserState(userId, {
      activityData: payload.activityData ?? existingState.activityData,
      homeState: payload.homeState ?? existingState.homeState ?? cloneDefaultHomeState(),
      social: payload.social ?? existingState.social ?? cloneDefaultSocialState(),
      updatedAt: existingState.updatedAt,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json(nextState);
  } catch (error) {
    console.error('❌ Failed to write user state:', error);
    res.status(500).json({ error: 'Failed to write user state' });
  }
});

app.post(`${API_BASE_PATH}/user/:userId/friends/request`, async (req, res) => {
  const userId = sanitizeUserId(req.params.userId);
  const targetUserId = sanitizeUserId(req.body?.targetUserId);

  const requesterNameRaw = typeof req.body?.requesterName === 'string' ? req.body.requesterName.trim() : '';
  const requesterName = requesterNameRaw.length > 0 ? requesterNameRaw : null;
  const targetNameRaw = typeof req.body?.targetName === 'string' ? req.body.targetName.trim() : '';
  const targetName = targetNameRaw.length > 0 ? targetNameRaw : null;

  if (!userId || !targetUserId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  if (userId === targetUserId) {
    res.status(400).json({ error: 'Cannot add yourself as a friend' });
    return;
  }

  try {
    const [requesterState, targetState] = await Promise.all([readUserState(userId), readUserState(targetUserId)]);

    const requesterSocial = cloneSocialState(requesterState.social ?? cloneDefaultSocialState());
    const targetSocial = cloneSocialState(targetState.social ?? cloneDefaultSocialState());

    const alreadyFriends = requesterSocial.friends.some((friend) => friend.userId === targetUserId);
    if (alreadyFriends) {
      res.status(409).json({ error: 'Users are already friends' });
      return;
    }

    const pendingRequestExists = requesterSocial.friendRequests.some(
      (request) => request.counterpartId === targetUserId && request.status === 'pending',
    );
    if (pendingRequestExists) {
      res.status(409).json({ error: 'Friend request already sent' });
      return;
    }

    const incomingPendingExists = targetSocial.friendRequests.some(
      (request) => request.counterpartId === userId && request.status === 'pending',
    );
    if (incomingPendingExists) {
      res.status(409).json({ error: 'Friend request already pending with this user' });
      return;
    }

    const now = new Date().toISOString();
    const requestId = randomUUID();

    const outgoingRequest: StoredFriendRequest = {
      id: requestId,
      counterpartId: targetUserId,
      counterpartName: targetName,
      direction: 'outgoing',
      status: 'pending',
      createdAt: now,
      respondedAt: null,
    };

    const incomingRequest: StoredFriendRequest = {
      id: requestId,
      counterpartId: userId,
      counterpartName: requesterName,
      direction: 'incoming',
      status: 'pending',
      createdAt: now,
      respondedAt: null,
    };

    requesterSocial.friendRequests = [
      ...requesterSocial.friendRequests.filter((request) => request.id !== requestId),
      outgoingRequest,
    ];

    targetSocial.friendRequests = [
      ...targetSocial.friendRequests.filter((request) => request.id !== requestId),
      incomingRequest,
    ];

    const notification: StoredNotification = {
      id: randomUUID(),
      type: 'friend_request',
      message: `Новая заявка в друзья от ${requesterName ?? userId}`,
      createdAt: now,
      read: false,
      payload: {
        requestId,
        fromUserId: userId,
        fromName: requesterName,
      },
    };

    targetSocial.notifications = [notification, ...targetSocial.notifications].slice(0, 50);

    const nextRequesterState: StoredUserState = {
      ...requesterState,
      social: requesterSocial,
    };
    const nextTargetState: StoredUserState = {
      ...targetState,
      social: targetSocial,
    };

    await Promise.all([writeUserState(userId, nextRequesterState), writeUserState(targetUserId, nextTargetState)]);

    await notifyFriendRequestCreated(targetUserId, userId, requesterName);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      social: cloneSocialState(requesterSocial),
    });
  } catch (error) {
    console.error('❌ Failed to create friend request:', error);
    res.status(500).json({ error: 'Failed to create friend request' });
  }
});

app.post(`${API_BASE_PATH}/user/:userId/friends/request/:requestId/respond`, async (req, res) => {
  const userId = sanitizeUserId(req.params.userId);
  const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : '';
  const actionRaw = typeof req.body?.action === 'string' ? req.body.action.trim().toLowerCase() : '';
  const responderNameRaw = typeof req.body?.responderName === 'string' ? req.body.responderName.trim() : '';
  const responderName = responderNameRaw.length > 0 ? responderNameRaw : null;

  if (!userId || requestId.length === 0) {
    res.status(400).json({ error: 'Invalid request data' });
    return;
  }

  if (actionRaw !== 'accept' && actionRaw !== 'decline') {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }

  try {
    const userState = await readUserState(userId);
    const social = cloneSocialState(userState.social ?? cloneDefaultSocialState());
    const request = social.friendRequests.find(
      (candidate) => candidate.id === requestId && candidate.direction === 'incoming',
    );

    if (!request) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    if (request.status !== 'pending') {
      res.status(409).json({ error: 'Friend request already processed' });
      return;
    }

    const counterpartId = request.counterpartId;
    const counterpartState = await readUserState(counterpartId);
    const counterpartSocial = cloneSocialState(counterpartState.social ?? cloneDefaultSocialState());
    const now = new Date().toISOString();

    let updatedUserSocial = social;
    let updatedCounterpartSocial = counterpartSocial;

    if (actionRaw === 'accept') {
      const counterpartFriendExisting = counterpartSocial.friends.find((friend) => friend.userId === userId);
      const userFriendExisting = social.friends.find((friend) => friend.userId === counterpartId);

      const userFriend: StoredFriend = {
        userId: counterpartId,
        displayName: request.counterpartName ?? null,
        shareMyStatsWith: userFriendExisting?.shareMyStatsWith ?? false,
        shareTheirStatsWithMe: counterpartFriendExisting?.shareMyStatsWith ?? false,
        createdAt: userFriendExisting?.createdAt ?? now,
        updatedAt: now,
      };

      const counterpartFriend: StoredFriend = {
        userId,
        displayName: responderName ?? null,
        shareMyStatsWith: counterpartFriendExisting?.shareMyStatsWith ?? false,
        shareTheirStatsWithMe: userFriend.shareMyStatsWith,
        createdAt: counterpartFriendExisting?.createdAt ?? now,
        updatedAt: now,
      };

      updatedUserSocial = {
        ...social,
        friends: upsertFriend(social.friends, userFriend),
        friendRequests: removeRequestById(social.friendRequests, requestId),
      };

      updatedCounterpartSocial = {
        ...counterpartSocial,
        friends: upsertFriend(counterpartSocial.friends, counterpartFriend),
        friendRequests: removeRequestById(counterpartSocial.friendRequests, requestId),
      };

      const notification: StoredNotification = {
        id: randomUUID(),
        type: 'friend_request_accepted',
        message: `${responderName ?? userId} принял(а) вашу заявку в друзья`,
        createdAt: now,
        read: false,
        payload: {
          requestId,
          userId,
          responderName,
        },
      };

      updatedCounterpartSocial.notifications = [notification, ...updatedCounterpartSocial.notifications].slice(0, 50);
    } else {
      updatedUserSocial = {
        ...social,
        friendRequests: removeRequestById(social.friendRequests, requestId),
      };
      updatedCounterpartSocial = {
        ...counterpartSocial,
        friendRequests: removeRequestById(counterpartSocial.friendRequests, requestId),
      };

      const notification: StoredNotification = {
        id: randomUUID(),
        type: 'friend_request_declined',
        message: `${responderName ?? userId} отклонил(а) вашу заявку в друзья`,
        createdAt: now,
        read: false,
        payload: {
          requestId,
          userId,
          responderName,
        },
      };

      updatedCounterpartSocial.notifications = [notification, ...updatedCounterpartSocial.notifications].slice(0, 50);
    }

    const nextUserState: StoredUserState = {
      ...userState,
      social: updatedUserSocial,
    };
    const nextCounterpartState: StoredUserState = {
      ...counterpartState,
      social: updatedCounterpartSocial,
    };

    await Promise.all([writeUserState(userId, nextUserState), writeUserState(counterpartId, nextCounterpartState)]);

    if (actionRaw === 'accept') {
      await notifyFriendRequestAccepted(counterpartId, userId, responderName ?? null);
    } else {
      await notifyFriendRequestDeclined(counterpartId, userId, responderName ?? null);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      social: cloneSocialState(updatedUserSocial),
    });
  } catch (error) {
    console.error('❌ Failed to respond to friend request:', error);
    res.status(500).json({ error: 'Failed to respond to friend request' });
  }
});

app.post(`${API_BASE_PATH}/user/:userId/friends/:friendId/sharing`, async (req, res) => {
  const userId = sanitizeUserId(req.params.userId);
  const friendId = sanitizeUserId(req.params.friendId);
  const shareMyStatsWith = typeof req.body?.shareMyStatsWith === 'boolean' ? req.body.shareMyStatsWith : null;

  if (!userId || !friendId || shareMyStatsWith === null) {
    res.status(400).json({ error: 'Invalid sharing payload' });
    return;
  }

  try {
    const [userState, friendState] = await Promise.all([readUserState(userId), readUserState(friendId)]);
    const userSocial = cloneSocialState(userState.social ?? cloneDefaultSocialState());
    const friendSocial = cloneSocialState(friendState.social ?? cloneDefaultSocialState());

    const friendRecord = userSocial.friends.find((friend) => friend.userId === friendId);
    const reciprocalRecord = friendSocial.friends.find((friend) => friend.userId === userId);

    if (!friendRecord || !reciprocalRecord) {
      res.status(404).json({ error: 'Friend relationship not found' });
      return;
    }

    const now = new Date().toISOString();

    const updatedFriendRecord: StoredFriend = {
      ...friendRecord,
      shareMyStatsWith,
      updatedAt: now,
    };

    const updatedReciprocalRecord: StoredFriend = {
      ...reciprocalRecord,
      shareTheirStatsWithMe: shareMyStatsWith,
      updatedAt: now,
    };

    const updatedUserSocial: StoredSocialState = {
      ...userSocial,
      friends: upsertFriend(userSocial.friends, updatedFriendRecord),
    };

    const updatedFriendSocial: StoredSocialState = {
      ...friendSocial,
      friends: upsertFriend(friendSocial.friends, updatedReciprocalRecord),
    };

    const nextUserState: StoredUserState = {
      ...userState,
      social: updatedUserSocial,
    };
    const nextFriendState: StoredUserState = {
      ...friendState,
      social: updatedFriendSocial,
    };

    await Promise.all([writeUserState(userId, nextUserState), writeUserState(friendId, nextFriendState)]);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      social: cloneSocialState(updatedUserSocial),
    });
  } catch (error) {
    console.error('❌ Failed to update sharing preferences:', error);
    res.status(500).json({ error: 'Failed to update sharing preferences' });
  }
});

app.delete(`${API_BASE_PATH}/user/:userId/friends/:friendId`, async (req, res) => {
  const userId = sanitizeUserId(req.params.userId);
  const friendId = sanitizeUserId(req.params.friendId);

  if (!userId || !friendId) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  try {
    const [userState, friendState] = await Promise.all([readUserState(userId), readUserState(friendId)]);
    const userSocial = cloneSocialState(userState.social ?? cloneDefaultSocialState());
    const friendSocial = cloneSocialState(friendState.social ?? cloneDefaultSocialState());

    const friendRecord = userSocial.friends.find((friend) => friend.userId === friendId);
    const reciprocalRecord = friendSocial.friends.find((friend) => friend.userId === userId);

    if (!friendRecord || !reciprocalRecord) {
      res.status(404).json({ error: 'Friend relationship not found' });
      return;
    }

    const updatedUserSocial: StoredSocialState = {
      ...userSocial,
      friends: removeFriendById(userSocial.friends, friendId),
    };

    const updatedFriendSocial: StoredSocialState = {
      ...friendSocial,
      friends: removeFriendById(friendSocial.friends, userId),
    };

    const nextUserState: StoredUserState = {
      ...userState,
      social: updatedUserSocial,
    };
    const nextFriendState: StoredUserState = {
      ...friendState,
      social: updatedFriendSocial,
    };

    await Promise.all([writeUserState(userId, nextUserState), writeUserState(friendId, nextFriendState)]);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      social: cloneSocialState(updatedUserSocial),
    });
  } catch (error) {
    console.error('❌ Failed to remove friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

app.get(`${API_BASE_PATH}/user/:targetUserId/shared/activity`, async (req, res) => {
  const targetUserId = sanitizeUserId(req.params.targetUserId);
  const viewerUserId = sanitizeUserId(req.query.viewer);

  if (!targetUserId) {
    res.status(400).json({ error: 'Invalid target user id' });
    return;
  }

  if (!viewerUserId) {
    res.status(400).json({ error: 'Invalid viewer user id' });
    return;
  }

  try {
    const targetState = await readUserState(targetUserId);

    if (targetUserId !== viewerUserId) {
      const social = targetState.social ?? cloneDefaultSocialState();
      const friendRecord = social.friends.find((friend) => friend.userId === viewerUserId);

      if (!friendRecord || !friendRecord.shareMyStatsWith) {
        res.status(403).json({ error: 'Access to shared activity denied' });
        return;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      activityData: targetState.activityData,
      homeState: extractPublicHomeState(targetState.homeState),
      updatedAt: targetState.updatedAt,
    });
  } catch (error) {
    console.error('❌ Failed to fetch shared activity data:', error);
    res.status(500).json({ error: 'Failed to fetch shared activity data' });
  }
});

// Статические файлы для miniapp
app.use(express.static(path.join(__dirname, '../miniapp/dist')));

// Статические файлы для media (иконки)
app.use('/media', express.static(path.join(__dirname, '../media')));

// Главная страница miniapp
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../miniapp/dist/index.html'));
});

// Слушаем на всех интерфейсах (0.0.0.0) для работы через прокси
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Accessible via: http://localhost:${PORT}`);
});

export { app };
