import { config } from './config.js';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const refreshBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
    },
  },
};

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'YourDashBoard API',
    version: '1.0.0',
    description:
      'Вход и регистрация по ссылке из письма: `POST /auth/request-link` → письмо → `GET /auth/verify` → `accessToken` + `refreshToken`. ' +
      'Полученный `accessToken` вставьте в **Authorize**; когда он истечёт, обменяйте `refreshToken` через `POST /auth/refresh`.',
  },
  servers: [{ url: config.APP_URL }],
  tags: [{ name: 'auth' }, { name: 'system' }],
  paths: {
    '/health': {
      get: {
        tags: ['system'],
        summary: 'Проверка, что сервер и БД живы',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/request-link': {
      post: {
        tags: ['auth'],
        summary: 'Отправить на почту ссылку для входа / регистрации',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email', example: 'user@example.com' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Письмо отправлено',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { message: { type: 'string' } } },
              },
            },
          },
          400: errorResponse('Некорректный email'),
          429: errorResponse('Слишком часто: лимит по почте или по IP. Заголовок Retry-After — через сколько секунд повторить'),
          502: errorResponse('Не удалось отправить письмо'),
        },
      },
    },
    '/auth/verify': {
      get: {
        tags: ['auth'],
        summary: 'Обменять токен из письма на JWT (создаёт пользователя при первом входе)',
        parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Успешный вход',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } },
          },
          400: errorResponse('Ссылка недействительна, уже использована или устарела'),
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: 'Обменять refresh-токен на новую пару токенов (старый refresh перестаёт работать)',
        requestBody: refreshBody,
        responses: {
          200: {
            description: 'Новая пара токенов',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Tokens' } } },
          },
          401: errorResponse('Refresh-токен недействителен, истёк или уже использован'),
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['auth'],
        summary: 'Выйти: отозвать refresh-токен',
        requestBody: refreshBody,
        responses: { 204: { description: 'Токен отозван' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['auth'],
        summary: 'Текущий пользователь',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Пользователь',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          401: errorResponse('Нет токена или он недействителен'),
        },
      },
    },
    '/auth/delete-account/request': {
      post: {
        tags: ['auth'],
        summary: 'Отправить на почту 6-значный код для удаления аккаунта',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Код отправлен (действует 10 минут, новый код отменяет предыдущий)',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { message: { type: 'string' } } },
              },
            },
          },
          401: errorResponse('Нет токена или он недействителен'),
          429: errorResponse('Слишком часто. Заголовок Retry-After — через сколько секунд повторить'),
          502: errorResponse('Не удалось отправить письмо'),
        },
      },
    },
    '/auth/delete-account/confirm': {
      post: {
        tags: ['auth'],
        summary: 'Удалить аккаунт по коду из письма (необратимо)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string', pattern: '^\\d{6}$', example: '123456' } },
              },
            },
          },
        },
        responses: {
          204: { description: 'Аккаунт и все его сессии удалены' },
          400: errorResponse('Неверный, устаревший или исчерпавший 5 попыток код'),
          401: errorResponse('Нет токена или он недействителен'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          isNewUser: { type: 'boolean' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
};
