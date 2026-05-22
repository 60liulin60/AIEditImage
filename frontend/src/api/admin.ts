import { http } from './http';
import type { User, UserRole } from '../types';

// 管理员用户列表只在后端鉴权通过后返回。
export async function fetchUsers() {
  const { data } = await http.get<User[]>('/admin/users');
  return data;
}

// 创建用户时提交明文初始密码，后端负责哈希保存。
export async function createUser(payload: { email: string; password: string; role: UserRole }) {
  const { data } = await http.post<User>('/admin/users', payload);
  return data;
}

// 用户更新接口保持局部更新语义，只发送被修改的字段。
export async function updateUser(id: string, payload: { isActive?: boolean; role?: UserRole }) {
  const { data } = await http.patch<User>(`/admin/users/${id}`, payload);
  return data;
}
