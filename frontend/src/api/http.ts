import axios from 'axios';

export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export function getErrorMessage(error: unknown, fallback = '请求失败') {
  if (axios.isAxiosError(error)) {
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
