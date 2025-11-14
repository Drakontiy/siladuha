# Многоэтапная сборка для оптимизации размера образа

# Этап 1: Сборка проекта
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./
COPY tsconfig.json ./
COPY webpack.config.js ./

# Устанавливаем зависимости (включая dev-зависимости для сборки)
RUN npm ci

# Копируем исходный код
COPY src/ ./src/
COPY miniapp/ ./miniapp/
COPY media/ ./media/
COPY scripts/ ./scripts/

# Собираем проект
RUN npm run build

# Этап 2: Production образ
FROM node:20-alpine

WORKDIR /app

# Создаём непривилегированного пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Копируем package.json для установки только production зависимостей
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm ci --only=production && \
    npm cache clean --force

# Копируем собранные файлы из builder этапа
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/miniapp/dist ./miniapp/dist
COPY --from=builder /app/media ./media

# Создаём директорию для данных пользователей (она будет смонтирована как volume)
RUN mkdir -p /app/data/users && \
    mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# Переключаемся на непривилегированного пользователя
USER nodejs

# Открываем порт
EXPOSE 3000

# Устанавливаем переменные окружения по умолчанию
ENV NODE_ENV=production
ENV PORT=3000

# Запускаем приложение
CMD ["node", "dist/index.js"]

