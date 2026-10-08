# YourDashBoard Server

Node.js + TypeScript + Express, Prisma + PostgreSQL, Swagger, вход по ссылке из письма, JWT + refresh-токены, защита от спама.

## Запуск (разработка)

```bash
cp .env.example .env        # замените JWT_SECRET и впишите свой SMTP
npm install
docker compose up -d        # Postgres, Adminer
npm run db:deploy           # применить миграции
npm run dev                 # сервер с перезапуском при изменениях
```

Всё в Docker, включая API (миграции применяются при старте контейнера):

```bash
docker compose --profile full up -d --build
```

## Где что смотреть

| Что                    | Адрес                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Swagger UI             | http://localhost:3000/docs                                         |
| OpenAPI JSON           | http://localhost:3000/docs.json                                    |
| БД — Adminer           | http://localhost:8080 (PostgreSQL, сервер `db`, `postgres` / `postgres`, база `yourdashboard`) |
| БД — Prisma Studio     | `npm run db:studio`                                                |

## Авторизация

Вход и регистрация — один и тот же сценарий:

1. `POST /auth/request-link` `{ "email": "..." }` — на почту уходит одноразовая ссылка (живёт 15 минут). Новая ссылка отменяет предыдущие.
2. `GET /auth/verify?token=...` (ссылка из письма) — возвращает `accessToken` (JWT, 15 минут) и `refreshToken` (30 дней). Если пользователя с такой почтой ещё нет, он создаётся (`isNewUser: true`).
3. Запросы идут с заголовком `Authorization: Bearer <accessToken>`, например `GET /auth/me`.
4. Когда access-токен истёк — `POST /auth/refresh` `{ "refreshToken": "..." }` выдаёт новую пару. Каждый refresh-токен работает один раз; если использованный токен предъявлен повторно, все сессии пользователя завершаются.
5. `POST /auth/logout` `{ "refreshToken": "..." }` — выход.

### Удаление аккаунта

Только с подтверждением по почте, оба запроса — с `Authorization: Bearer <accessToken>`:

1. `POST /auth/delete-account/request` — на почту пользователя уходит 6-значный код (живёт 10 минут). Новый код отменяет предыдущий; лимиты на отправку те же, что у ссылок для входа.
2. `POST /auth/delete-account/confirm` `{ "code": "123456" }` — удаляет пользователя и все его сессии, ответ `204`. На один код даётся 5 попыток, затем нужно запросить новый.

Удаление необратимо. Повторный вход с той же почтой создаст новый аккаунт.

Когда появится фронтенд, укажите его страницу в `MAGIC_LINK_URL` — она получит `?token=...` и сама вызовет `/auth/verify`.

### Почта

Письма всегда отправляются через SMTP из `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Для Gmail нужен пароль приложения, порт 587. При старте сервер проверяет подключение и пишет в лог `SMTP: ... OK` или `FAILED`.

С личного Gmail письма чужим адресам попадают в «Спам». Для реальных пользователей нужен сервис рассылки со своим доменом, например Resend: `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<API-ключ>`, `MAIL_FROM="YourDashBoard <login@ваш-домен>"`. Домен подтверждается на resend.com/domains; без него работает только отправитель `onboarding@resend.dev`, и письма уходят только на адрес владельца аккаунта Resend.

Если включён VPN, он может блокировать SMTP (в логе `Connection closed unexpectedly`). Тогда укажите в `.env` сетевой адаптер с прямым выходом в интернет, например `SMTP_INTERFACE=Ethernet` — почта пойдёт мимо туннеля. Имена адаптеров: `Get-NetAdapter` в PowerShell.

### Защита от спама

Ограничения на `POST /auth/request-link` (значения меняются в `.env`):

| Ограничение                         | По умолчанию | Переменная                          |
| ----------------------------------- | ------------ | ----------------------------------- |
| Пауза между письмами на один адрес  | 60 секунд    | `MAGIC_LINK_COOLDOWN_SECONDS`       |
| Писем на один адрес в час           | 5            | `MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR` |
| Писем с одного IP в час             | 20           | `MAGIC_LINK_MAX_PER_IP_PER_HOUR`    |

При превышении — ответ `429` с заголовком `Retry-After` (секунды). Счётчики хранятся в БД, поэтому переживают перезапуск. Если API стоит за nginx или другим прокси, задайте `TRUST_PROXY=1`, иначе все запросы будут считаться с одного IP.

## Изменение схемы БД

Правите `prisma/schema.prisma`, затем:

```bash
npm run db:migrate -- --name what_changed
npm run db:generate
```
