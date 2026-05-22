import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import MainLayout from '../layouts/MainLayout.vue';
import LoginView from '../views/LoginView.vue';
import GenerateView from '../views/GenerateView.vue';
import GalleryView from '../views/GalleryView.vue';
import ConfigView from '../views/ConfigView.vue';
import AdminUsersView from '../views/AdminUsersView.vue';

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

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  if (!authStore.initialized) {
    await authStore.loadMe();
  }

  if (to.meta.requiresAuth && !authStore.user) {
    return '/login';
  }

  if (to.meta.requiresAdmin && authStore.user?.role !== 'ADMIN') {
    return '/generate';
  }

  if (to.path === '/login' && authStore.user) {
    return '/generate';
  }

  return true;
});
