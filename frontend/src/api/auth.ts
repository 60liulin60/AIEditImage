import { http } from './http';
import type { User } from '../types';

export async function login(email: string, password: string) {
  const { data } = await http.post<{ user: User }>('/auth/login', { email, password });
  return data.user;
}

export async function logout() {
  await http.post('/auth/logout');
}

export async function fetchMe() {
  const { data } = await http.get<{ user: User }>('/auth/me');
  return data.user;
}
