// 登录 Cookie 名称固定，前后端只通过 httpOnly Cookie 维持会话。
export const AUTH_COOKIE_NAME = 'aid_token';

// 会话有效期为 7 天，适合个人或小团队工具的低频登录场景。
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
