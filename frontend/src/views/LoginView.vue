<template>
  <div class="login-page">
    <div class="login-panel">
      <div class="mb-8">
        <h1 class="brand-title mb-3">AIEditImage</h1>
        <p class="subtitle">
          登录后创建图片、管理 API 配置和查看自己的生成历史。
        </p>
      </div>
      <el-form :model="form" label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="邮箱">
          <el-input
            v-model="form.email"
            autocomplete="email"
            placeholder="admin@example.com"
            size="large"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            show-password
            size="large"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          class="login-btn w-full"
          :loading="loading"
          @click="handleLogin"
          >登录</el-button
        >
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { getErrorMessage } from "../api/http";

const router = useRouter();
const authStore = useAuthStore();
// 登录请求期间展示按钮加载态，并阻止用户误以为没有提交。
const loading = ref(false);

// 登录表单只保存页面临时状态，密码不会写入本地存储。
const form = reactive({
  email: '',
  password: '',
});

async function handleLogin() {
  // 空值校验放在前端先挡住明显无效请求，后端仍负责最终认证。
  if (!form.email || !form.password) {
    ElMessage.warning("请输入邮箱和密码");
    return;
  }

  loading.value = true;
  try {
    await authStore.login(form.email, form.password);
    // 登录成功后进入默认工作区，由路由守卫继续保护后续页面。
    await router.push("/generate");
  } catch (error) {
    ElMessage.error(getErrorMessage(error, "登录失败"));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.login-page {
  position: relative;
  display: grid;
  height: 100%;
  min-height: 100%;
  place-items: center;
  padding: 24px;
  background: var(--color-surface-alt);
  /* 小屏登录表单过长时仅在本页滚动，不依赖 body 外部滚动。 */
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.login-panel {
  position: relative;
  width: min(420px, 100%);
  padding: 40px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
}

.brand-title {
  font-family: 'Outfit', sans-serif;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-warm);
  margin: 0;
}

.subtitle {
  color: var(--color-muted);
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
}

.login-btn {
  margin-top: 8px;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  background: var(--color-warm) !important;
  border: 1px solid var(--color-warm) !important;
  border-radius: 8px !important;
  transition: background 0.2s ease !important;

  &:hover:not(:disabled) {
    background: var(--color-warm-light) !important;
    border-color: var(--color-warm-light) !important;
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #475569;
  margin-bottom: 8px;
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  padding: 12px 16px;
  transition: box-shadow 0.2s ease;

  &.is-focus {
    box-shadow: 0 0 0 1px var(--color-warm) !important;
  }
}
</style>
