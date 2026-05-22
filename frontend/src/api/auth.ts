import { http } from './http';
import type { User } from '../types';

// 登录接口只返回用户信息，认证 Cookie 由浏览器按响应头自动保存。
export async function login(email: string, password: string) {
  const { data } = await http.post<{ user: User }>('/auth/login', { email, password });
  return data.user;
}

// 退出时让后端删除会话 Cookie，前端状态由调用方同步清理。
export async function logout() {
  await http.post('/auth/logout');
}

// 用当前 Cookie 查询用户，用于刷新页面后的登录态恢复。
export async function fetchMe() {
  const { data } = await http.get<{ user: User }>('/auth/me');
  return data.user;
}
