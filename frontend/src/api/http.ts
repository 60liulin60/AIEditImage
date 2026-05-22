import axios from 'axios';

// 前端统一使用 /api 相对路径，由 Vite 代理或生产网关转发到后端。
export const http = axios.create({
  baseURL: '/api',
  // 登录态依赖 HttpOnly Cookie，跨请求必须携带浏览器凭据。
  withCredentials: true,
});

export function getErrorMessage(error: unknown, fallback = '请求失败') {
  if (axios.isAxiosError(error)) {
    // 后端校验错误可能返回字符串数组，这里合并成适合消息条展示的文本。
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) {
      return data.message.join('；');
    }
    if (typeof data?.message === 'string') {
      return data.message;
    }
  }
  return fallback;
}
