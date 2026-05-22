import { defineStore } from 'pinia';
import { fetchMe, login, logout } from '../api/auth';
import type { User } from '../types';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // 当前登录用户；为空表示未登录或会话已失效。
    user: null as User | null,
    // 标记是否已尝试恢复会话，避免路由守卫重复请求 /auth/me。
    initialized: false,
  }),
  actions: {
    async loadMe() {
      try {
        this.user = await fetchMe();
      } catch {
        // 未登录是正常状态，不需要在页面上弹出错误。
        this.user = null;
      } finally {
        this.initialized = true;
      }
    },
    async login(email: string, password: string) {
      // 登录成功后以后端返回用户为准，避免前端自行拼装权限字段。
      this.user = await login(email, password);
      this.initialized = true;
    },
    async logout() {
      // 先通知后端清理 Cookie，再清空本地状态，避免页面残留旧权限。
      await logout();
      this.user = null;
    },
  },
});
