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

**Важно!** Если вы планируете открывать приложение с других устройств, обязательно задайте `MINIAPP_API_BASE` в `.env` перед сборкой. Это URL вашего сервера (например, `http://192.168.1.100:3000` или `https://your-domain.com`).

```bash
docker compose build
```

Или используя обычный Docker с передачей build-аргументов:

```bash
docker build \
  --build-arg MINIAPP_API_BASE=${MINIAPP_API_BASE} \
  --build-arg MINIAPP_URL=${MINIAPP_URL} \
  -t max-bot-miniapp .
```

**Важно для работы с других устройств:**

`MINIAPP_API_BASE` встраивается в клиентский код во время сборки. Если она не задана, клиент будет использовать `window.location.origin`, что может не совпадать с адресом вашего сервера при доступе с другого устройства.

Пример `.env` для доступа с других устройств в локальной сети:

```env
BOT_TOKEN=your_bot_token_here
MINIAPP_URL=http://192.168.1.100:3000
MINIAPP_API_BASE=http://192.168.1.100:3000
PORT=3000
```

Где `192.168.1.100` - это IP-адрес вашего сервера в локальной сети.

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

| Переменная | Описание | Обязательная | По умолчанию | Использование |
|------------|----------|--------------|--------------|---------------|
| `BOT_TOKEN` | Токен MAX бота | ✅ Да | - | Runtime |
| `MINIAPP_URL` | URL для Mini App | Да | `http://localhost:3000` | Build + Runtime |
| `MINIAPP_API_BASE` | Базовый URL API | Нет* | Автоматически | **Build (встраивается в код)** |
| `PORT` | Порт сервера | Нет | `3000` | Runtime |
| `NODE_ENV` | Окружение | Нет | `production` | Runtime |

**Важно про `MINIAPP_API_BASE`:**

- Эта переменная встраивается в клиентский код во время сборки (build-аргумент)
- Если не задана при сборке, клиент будет использовать `window.location.origin`
- Для работы с других устройств обязательно задайте `MINIAPP_API_BASE` в `.env` перед сборкой
- После сборки изменить её без пересборки образа нельзя

**Примеры:**

1. **Локальная разработка (один компьютер):**
   ```env
   MINIAPP_API_BASE=  # Можно оставить пустым, будет использован window.location.origin
   ```

2. **Доступ с других устройств в локальной сети:**
   ```env
   MINIAPP_API_BASE=http://192.168.1.100:3000  # IP вашего сервера
   ```

3. **Production с доменом:**
   ```env
   MINIAPP_API_BASE=https://api.yourdomain.com
   ```

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

2. **Важно:** Если вы изменили `MINIAPP_API_BASE` или `MINIAPP_URL` в `.env`, обязательно пересоберите образ:
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

**Примечание:** Изменение `MINIAPP_API_BASE` требует пересборки образа, так как эта переменная встраивается в клиентский код.

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

**Важно:** Если вы изменили порт, обновите `MINIAPP_API_BASE` в `.env` и пересоберите образ.

### Коды авторизации не генерируются при доступе с другого устройства

**Проблема:** При открытии приложения с другого устройства запросы идут на неправильный URL.

**Решение:**

1. Убедитесь, что `MINIAPP_API_BASE` задана в `.env` с правильным IP-адресом или доменом вашего сервера:
   ```env
   MINIAPP_API_BASE=http://192.168.1.100:3000  # IP вашего сервера
   ```

2. Пересоберите образ с новым значением:
   ```bash
   docker compose build
   docker compose up -d
   ```

3. Проверьте, что сервер доступен с другого устройства:
   ```bash
   # С другого устройства попробуйте открыть в браузере:
   http://192.168.1.100:3000/api/health
   ```

4. Проверьте логи контейнера:
   ```bash
   docker compose logs -f max-bot
   ```

5. Убедитесь, что CORS настроен правильно (в коде уже настроен для всех origin).

**Альтернативное решение:** Если вы не хотите пересобирать образ каждый раз при смене IP, используйте reverse proxy (nginx) или доменное имя вместо IP-адреса.

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

