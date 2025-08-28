# Сервис синхронизации тарифов WB (Developer Guide)

## 1. Обзор

Контейнеризированный Node.js сервис для периодического получения тарифов Wildberries, сохранения их в PostgreSQL и синхронизации с Google Sheets. Предоставляет REST API для управления списком таблиц.

### Технический стек

- **Среда выполнения:** Node.js 20.x
- **Язык:** TypeScript
- **Веб-сервер:** Express.js
- **База данных:** PostgreSQL 16
- **ORM/Query Builder:** Knex.js
- **Контейнеризация:** Docker & Docker Compose

## 2. Быстрый старт

1.  **Клонировать репозиторий:**
    ```bash
    git clone <repository_url> && cd <project_folder>
    ```
2.  **Настроить окружение:**

    ```bash
    cp example.env .env
    ```

    Заполните переменные в `.env` (см. детали ниже).

3.  **Добавить ключи Google API:**
    Поместите ваш `credentials.json` файл в папку `config/credentials`. Убедитесь, что имя файла совпадает со значением `SPREADSHEET_CREDENTIALS_NAME` в `.env`.

4.  **Запустить проект:**
    ```bash
    docker compose up
    ```
    Проект будет доступен по порту, указанному в `APP_PORT`. Веб-сервер будет запущен на порту, указанному в `SERVER_PORT`. Миграции применятся автоматически при старте.

## 3. Конфигурация (`.env`)

| Переменная                     | Описание                      | Примечание                                                       |
| :----------------------------- | :---------------------------- | :--------------------------------------------------------------- |
| `POSTGRES_PORT`                | Внешний порт PostgreSQL.      | Для подключения к БД с хост-машины.                              |
| `POSTGRES_DB`                  | Имя базы данных.              |                                                                  |
| `POSTGRES_USER`                | Пользователь PostgreSQL.      |                                                                  |
| `POSTGRES_PASSWORD`            | Пароль пользователя.          |                                                                  |
| `WB_API_TOKEN`                 | API токен для Wildberries.    | **Обязательно.**                                                 |
| `SPREADSHEET_CREDENTIALS_NAME` | Имя файла с ключами Google.   | **Обязательно.** Файл должен находиться в `/config/credentials`. |
| `APP_PORT`                     | Порт для веб-сервера Express. |                                                                  |

## 4. API Reference

### Добавить Google Spreadsheet

Добавляет новый ID таблицы в список для синхронизации.

`POST /api/spreadsheets`

**Request Body:**

```json
{
    "spreadsheetId": "1aBcDeFgHiJkLmNoPqRsTuVwXyZ_1234567890"
}
```

**Responses:**

- `201 Created` — Успешное добавление.
- `409 Conflict` — Такой ID уже существует.
- `400 Bad Request` — Некорректное тело запроса.

**cURL Example:**

```bash
curl -X POST http://localhost:6000/api/spreadsheets \
-H "Content-Type: application/json" \
-d '{"spreadsheetId": "1aBcDeFgHiJkLmNoPqRsTuVwXyZ_1234567890"}'
```

## 6. Структура проекта

```
.
├── config/
│   └── credentials.json    # Ключи Google API (добавляется вручную)
├── dist/                     # Скомпилированный JavaScript (генерируется)
├── src/
│   ├── config/               # Конфигурации (Knex, .env loader)
│   ├── postgres/
│   │   ├── migrations/       # Файлы миграций Knex
│   │   └── knex.js           # Инициализация инстанса Knex
│   ├── service/
│   │   ├── wbService.ts      # Логика работы с WB API и БД
│   │   └── spreadsheetService.ts # Логика работы с Google Sheets API
│   ├── app.ts                # Инициализация Express и Cron
│   └── start.ts              # Точка входа: запуск миграций и старт сервера
├── .env                      # Локальные переменные окружения
├── compose.yaml              # Конфигурация Docker Compose
├── Dockerfile                # Инструкции по сборке Docker-образа
└── package.json              # Зависимости и скрипты
```
