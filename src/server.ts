import express from 'express';
import path from 'path';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Разрешаем все хосты (для работы через прокси/туннель)
app.set('trust proxy', true);

// Статические файлы для miniapp
app.use(express.static(path.join(__dirname, '../miniapp/dist')));

// Статические файлы для media (иконки)
app.use('/media', express.static(path.join(__dirname, '../media')));

// Главная страница miniapp
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../miniapp/dist/index.html'));
});

// Слушаем на всех интерфейсах (0.0.0.0) для работы через прокси
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Accessible via: http://localhost:${PORT}`);
});

export { app };
