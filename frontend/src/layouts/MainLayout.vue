<template>
  <div class="page-shell">
    <el-container class="min-h-screen">
      <el-aside width="224px" class="layout-aside">
        <div class="brand">AIEditImage</div>
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
      <el-container>
        <el-header class="layout-header">
          <div>
            <div class="text-sm muted-text">当前用户</div>
            <div class="font-medium">{{ authStore.user?.email }}</div>
          </div>
          <el-button :icon="SwitchButton" @click="handleLogout">退出登录</el-button>
        </el-header>
        <el-main class="layout-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Brush, Picture, Setting, SwitchButton, UserFilled } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

async function handleLogout() {
  await authStore.logout();
  await router.push('/login');
}
</script>

<style scoped lang="scss">
.layout-aside {
  border-right: 1px solid #e5e7eb;
  background: #ffffff;
}

.brand {
  height: 64px;
  padding: 20px 22px;
  color: #111827;
  font-size: 18px;
  font-weight: 700;
}

.menu {
  border-right: 0;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.layout-main {
  padding: 24px;
}
</style>
