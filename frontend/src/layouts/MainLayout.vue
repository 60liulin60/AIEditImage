<template>
  <div class="page-shell">
    <el-container class="layout-root">
      <el-aside width="240px" class="layout-aside">
        <div class="brand">
          <div class="brand-icon">
            <el-icon :size="24"><Brush /></el-icon>
          </div>
          <span class="brand-text">AIEditImage</span>
        </div>
        <el-menu router :default-active="$route.path" class="menu">
          <el-menu-item index="/generate">
            <el-icon><Brush /></el-icon>
            <span>图片生成</span>
          </el-menu-item>
          <el-menu-item index="/gallery">
            <el-icon><Picture /></el-icon>
            <span>图片列表</span>
          </el-menu-item>
          <el-menu-item index="/configs">
            <el-icon><Setting /></el-icon>
            <span>API 配置</span>
          </el-menu-item>
          <el-menu-item v-if="authStore.user?.role === 'ADMIN'" index="/admin/users">
            <el-icon><UserFilled /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      <el-container class="layout-content">
        <el-header class="layout-header">
          <div class="user-info">
            <div class="user-avatar">
              {{ authStore.user?.email?.charAt(0).toUpperCase() }}
            </div>
            <div>
              <div class="text-xs muted-text">当前用户</div>
              <div class="user-email">{{ authStore.user?.email }}</div>
            </div>
          </div>
          <el-button :icon="SwitchButton" circle class="logout-btn" @click="handleLogout" />
        </el-header>
        <el-main class="layout-main">
          <router-view v-slot="{ Component }">
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Brush, Picture, Setting, SwitchButton, UserFilled } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';

// 布局层只读取当前用户信息，用于显示邮箱和控制管理员菜单。
const authStore = useAuthStore();
// 退出登录后需要主动跳转，避免停留在受保护页面。
const router = useRouter();

async function handleLogout() {
  // 后端会清理会话 Cookie，前端随后回到登录页。
  await authStore.logout();
  await router.push('/login');
}
</script>

<style scoped lang="scss">
/* 根容器占满视口高度，避免 body 外部滚动。 */
.layout-root {
  height: 100%;
  min-height: 100%;
}

/* 右侧栏：纵向排布顶栏与主内容，并约束高度以启用内部滚动。 */
.layout-content {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.layout-aside {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #0f172a;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 2px 0 12px rgba(15, 23, 42, 0.3);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 72px;
  padding: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.brand-text {
  color: #ffffff;
  font-family: 'Outfit', sans-serif;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.menu {
  border-right: 0;
  background: transparent;
  padding: 12px;
}

:deep(.el-menu-item) {
  margin-bottom: 4px;
  border-radius: 8px;
  color: #cbd5e1;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  height: 44px;
  line-height: 44px;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
  }

  &.is-active {
    background: linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05));
    color: #fbbf24;
    font-weight: 600;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 2px;
      background: linear-gradient(180deg, #f59e0b, #fbbf24);
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
    }
  }
}

:deep(.el-menu-item .el-icon) {
  color: inherit;
  margin-right: 10px;
  font-size: 18px;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
  flex-shrink: 0;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  padding: 0 32px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: #ffffff;
  font-weight: 700;
  font-size: 16px;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}

.user-email {
  color: #1f2937;
  font-weight: 500;
  font-size: 14px;
}

.logout-btn {
  border: 1px solid #e2e8f0;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #d97706;
    transform: scale(1.05);
  }
}

.layout-main {
  /* 仅主内容区内部滚动，弹窗打开时不会拖动整页外壳。 */
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 32px;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(245, 158, 11, 0.03) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(37, 99, 235, 0.03) 0%, transparent 50%),
    #f8fafc;
}

/* 路由切换过渡动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
