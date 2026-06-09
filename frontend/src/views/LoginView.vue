<template>
  <div class="login-page">
    <div class="login-panel content-panel">
      <div class="mb-7">
        <h1 class="mb-2 text-2xl font-semibold">AIEditImage</h1>
        <p class="muted-text">
          登录后创建图片、管理 API 配置和查看自己的生成历史。
        </p>
      </div>
      <el-form :model="form" label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="邮箱">
          <el-input
            v-model="form.email"
            autocomplete="email"
            placeholder="admin@example.com"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            show-password
          />
        </el-form-item>
        <el-button
          type="primary"
          class="w-full"
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
import { ElMessage } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { getErrorMessage } from "../api/http";

const router = useRouter();
const authStore = useAuthStore();
// 登录请求期间展示按钮加载态，并阻止用户误以为没有提交。
const loading = ref(false);

// 登录表单只保存页面临时状态，密码不会写入本地存储。
const form = reactive({
  email: "admin@example.com",
  password: "change-me-123456",
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
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: #eef2ff;
}

.login-panel {
  width: min(420px, 100%);
  padding: 32px;
}
</style>
