# Docker инструкция по запуску

Этот документ описывает, как собрать и запустить проект в Docker-контейнере.

## Предварительные требования

1. **Docker** (версия 20.10 или выше)
   - Установка: https://docs.docker.com/get-docker/
   
2. **Docker Compose** (версия 2.0 или выше, обычно идёт вместе с Docker Desktop)
   - Проверка установки: `docker compose version`

3. **Переменные окружения**
   - Создайте файл `.env` в корне проекта (см. `env.example`)

## Быстрый старт

### 1. Создайте файл `.env`

Скопируйте `env.example` в `.env` и заполните необходимые переменные:

```bash
cp env.example .env
```

Отредактируйте `.env` и укажите:

```env
BOT_TOKEN=your_bot_token_here
MINIAPP_URL=https://your-domain.com
PORT=3000
```

**Обязательно укажите `BOT_TOKEN`!** Без него бот не сможет работать.

### 2. Соберите Docker-образ

```bash
docker compose build
```

Или используя обычный Docker:

```bash
docker build -t max-bot-miniapp .
```

### 3. Запустите контейнер

С помощью Docker Compose (рекомендуется):

```bash
docker compose up -d
```

Или используя обычный Docker:

```bash
docker run -d \
  --name max-bot-miniapp \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  max-bot-miniapp
```

### 4. Проверьте работу

Проверьте логи контейнера:

```bash
docker compose logs -f
```

Или для обычного Docker:

```bash
docker logs -f max-bot-miniapp
```

Приложение должно быть доступно на `http://localhost:3000`

## Остановка контейнера

```bash
docker compose down
```

Или для обычного Docker:

```bash
docker stop max-bot-miniapp
docker rm max-bot-miniapp
```

## Управление контейнером

### Просмотр логов

```bash
docker compose logs -f max-bot
```

### Перезапуск

```bash
docker compose restart
```

### Остановка

```bash
docker compose stop
```

### Удаление контейнера (данные сохраняются в volume)

```bash
docker compose down
```

### Полное удаление (включая volumes и образы)

```bash
docker compose down -v --rmi all
```

## Персистентность данных

Данные пользователей сохраняются в директории `./data` на хосте, которая монтируется как volume в контейнер. Это означает, что:

- Данные сохраняются при перезапуске контейнера
- Данные сохраняются при удалении контейнера
- Данные доступны напрямую на хосте в `./data`

## Переменные окружения

Основные переменные окружения:

| Переменная | Описание | Обязательная | По умолчанию |
|------------|----------|--------------|--------------|
| `BOT_TOKEN` | Токен MAX бота | ✅ Да | - |
| `MINIAPP_URL` | URL для Mini App | Да | `http://localhost:3000` |
| `MINIAPP_API_BASE` | Базовый URL API | Нет | Автоматически |
| `PORT` | Порт сервера | Нет | `3000` |
| `NODE_ENV` | Окружение | Нет | `production` |

## Запуск без Docker Compose

Если вы предпочитаете использовать только Docker CLI:

### Сборка образа

```bash
docker build -t max-bot-miniapp .
```

### Запуск контейнера

```bash
docker run -d \
  --name max-bot-miniapp \
  -p 3000:3000 \
  -e BOT_TOKEN=your_bot_token_here \
  -e MINIAPP_URL=https://your-domain.com \
  -e PORT=3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  max-bot-miniapp
```

**Windows PowerShell:**
```powershell
docker run -d `
  --name max-bot-miniapp `
  -p 3000:3000 `
  -e BOT_TOKEN=your_bot_token_here `
  -e MINIAPP_URL=https://your-domain.com `
  -e PORT=3000 `
  -v ${PWD}/data:/app/data `
  --restart unless-stopped `
  max-bot-miniapp
```

**Windows CMD:**
```cmd
docker run -d ^
  --name max-bot-miniapp ^
  -p 3000:3000 ^
  -e BOT_TOKEN=your_bot_token_here ^
  -e MINIAPP_URL=https://your-domain.com ^
  -e PORT=3000 ^
  -v %CD%/data:/app/data ^
  --restart unless-stopped ^
  max-bot-miniapp
```

### Запуск с файлом .env

```bash
docker run -d \
  --name max-bot-miniapp \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  max-bot-miniapp
```

## Обновление приложения

1. Остановите контейнер:
   ```bash
   docker compose down
   ```

2. Пересоберите образ с новым кодом:
   ```bash
   docker compose build
   ```

3. Запустите снова:
   ```bash
   docker compose up -d
   ```

Или одной командой:

```bash
docker compose up -d --build
```

## Отладка

### Вход в контейнер

```bash
docker compose exec max-bot sh
```

Или:

```bash
docker exec -it max-bot-miniapp sh
```

### Просмотр переменных окружения

```bash
docker compose exec max-bot env
```

### Проверка работы API

```bash
curl http://localhost:3000/api/health
```

## Проблемы и решения

### Контейнер сразу останавливается

Проверьте логи:
```bash
docker compose logs max-bot
```

Частая причина - отсутствие `BOT_TOKEN` в переменных окружения.

### Порты заняты

Измените порт в `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Внешний порт:внутренний порт
```

Или при запуске через Docker CLI:
```bash
docker run -d -p 3001:3000 ...
```

### Данные не сохраняются

Убедитесь, что volume смонтирован:
```bash
docker compose exec max-bot ls -la /app/data
```

Проверьте права доступа к директории `./data` на хосте.

## Production развёртывание

Для production рекомендуется:

1. Использовать HTTPS (через reverse proxy, например nginx)
2. Настроить резервное копирование директории `./data`
3. Использовать secrets management для токенов
4. Настроить мониторинг и логирование
5. Использовать orchestrator (Docker Swarm, Kubernetes)

Пример с nginx reverse proxy можно найти в документации Docker.

