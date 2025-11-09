import cors from 'cors';
import express from 'express';
import path from 'path';
import {
  DEFAULT_USER_STATE,
  initUserStateStore,
  readUserState,
  writeUserState,
  StoredUserState,
} from './storage/userStateStore';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const API_BASE_PATH = '/api';
const USER_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

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

const cloneDefaultHomeState = () => ({
  currentStreak: DEFAULT_USER_STATE.homeState.currentStreak,
  lastProcessedDate: DEFAULT_USER_STATE.homeState.lastProcessedDate,
  goals: { ...DEFAULT_USER_STATE.homeState.goals },
});

app.get(`${API_BASE_PATH}/health`, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok' });
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
      updatedAt: existingState.updatedAt,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json(nextState);
  } catch (error) {
    console.error('❌ Failed to write user state:', error);
    res.status(500).json({ error: 'Failed to write user state' });
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
