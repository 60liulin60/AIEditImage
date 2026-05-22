import { defineStore } from 'pinia';
import { fetchMe, login, logout } from '../api/auth';
import type { User } from '../types';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
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
      this.user = await login(email, password);
      this.initialized = true;
    },
    async logout() {
      await logout();
      this.user = null;
    },
  },
});
