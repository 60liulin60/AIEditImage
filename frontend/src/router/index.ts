import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

// 路由表按"登录页 + 受保护主布局"组织，主布局下的页面默认要求登录。
// 使用动态 import() 实现路由懒加载，减少初始包体积
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/',
      component: () => import('../layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/generate' },
        { path: 'generate', name: 'generate', component: () => import('../views/GenerateView.vue') },
        { path: 'gallery', name: 'gallery', component: () => import('../views/GalleryView.vue') },
        { path: 'configs', name: 'configs', component: () => import('../views/ConfigView.vue') },
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('../views/AdminUsersView.vue'),
          meta: { requiresAdmin: true },
        },
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
