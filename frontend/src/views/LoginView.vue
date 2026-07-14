<template>
  <div class="login-page">
    <div class="login-bg">
      <div class="bg-gradient"></div>
      <div class="bg-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
      </div>
    </div>
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
  /* 小屏登录表单过长时仅在本页滚动，不依赖 body 外部滚动。 */
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.login-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(245, 158, 11, 0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(139, 92, 246, 0.08) 0%, transparent 60%),
    #f8fafc;
}

.bg-shapes {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.shape {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.1));
  animation: float 20s ease-in-out infinite;

  &.shape-1 {
    width: 300px;
    height: 300px;
    top: -50px;
    left: -50px;
    animation-delay: 0s;
  }

  &.shape-2 {
    width: 400px;
    height: 400px;
    bottom: -100px;
    right: -100px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.1));
    animation-delay: -7s;
  }

  &.shape-3 {
    width: 250px;
    height: 250px;
    top: 50%;
    right: 10%;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(59, 130, 246, 0.08));
    animation-delay: -14s;
  }
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -30px) scale(1.05);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.95);
  }
}

.login-panel {
  position: relative;
  z-index: 1;
  width: min(440px, 100%);
  padding: 40px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  box-shadow:
    0 8px 32px rgba(15, 23, 42, 0.08),
    0 16px 48px rgba(15, 23, 42, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.brand-title {
  font-family: 'Outfit', sans-serif;
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.subtitle {
  color: #64748b;
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
}

.login-btn {
  margin-top: 8px;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, #f59e0b, #fbbf24) !important;
  border: none !important;
  border-radius: 12px !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(245, 158, 11, 0.35) !important;
    filter: brightness(1.05);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #475569;
  margin-bottom: 8px;
}

:deep(.el-input__wrapper) {
  border-radius: 10px;
  padding: 12px 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.3);
  }

  &.is-focus {
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.4) !important;
  }
}
</style>
