import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import MainLayout from '../layouts/MainLayout.vue';
import LoginView from '../views/LoginView.vue';
import GenerateView from '../views/GenerateView.vue';
import GalleryView from '../views/GalleryView.vue';
import ConfigView from '../views/ConfigView.vue';
import AdminUsersView from '../views/AdminUsersView.vue';

// 路由表按“登录页 + 受保护主布局”组织，主布局下的页面默认要求登录。
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/generate' },
        { path: 'generate', name: 'generate', component: GenerateView },
        { path: 'gallery', name: 'gallery', component: GalleryView },
        { path: 'configs', name: 'configs', component: ConfigView },
        { path: 'admin/users', name: 'admin-users', component: AdminUsersView, meta: { requiresAdmin: true } },
      ],
    },
  ],
});

// 全局守卫负责补齐刷新后的登录态，并拦截未登录或非管理员访问。
router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  if (!authStore.initialized) {
    // 首次进入页面时从后端恢复 Cookie 会话，避免刷新后 Pinia 状态为空。
    await authStore.loadMe();
  }

  if (to.meta.requiresAuth && !authStore.user) {
    return '/login';
  }

  if (to.meta.requiresAdmin && authStore.user?.role !== 'ADMIN') {
    return '/generate';
  }

  if (to.path === '/login' && authStore.user) {
    // 已登录用户访问登录页时回到主工作区，避免重复登录。
    return '/generate';
  }

  return true;
});
