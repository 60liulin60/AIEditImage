import { http } from './http';
import type { User, UserRole } from '../types';

export async function fetchUsers() {
  const { data } = await http.get<User[]>('/admin/users');
  return data;
}

export async function createUser(payload: { email: string; password: string; role: UserRole }) {
  const { data } = await http.post<User>('/admin/users', payload);
  return data;
}

export async function updateUser(id: string, payload: { isActive?: boolean; role?: UserRole }) {
  const { data } = await http.patch<User>(`/admin/users/${id}`, payload);
  return data;
}
