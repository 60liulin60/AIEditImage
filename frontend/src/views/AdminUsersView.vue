<template>
  <section class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold">用户管理</h1>
      <p class="muted-text mt-1">管理员创建用户并控制账号启用状态。</p>
    </div>

    <div class="content-panel p-5">
      <el-form :model="form" label-position="top" class="grid gap-4 md:grid-cols-4">
        <el-form-item label="邮箱">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" class="w-full">
            <el-option label="用户" value="USER" />
            <el-option label="管理员" value="ADMIN" />
          </el-select>
        </el-form-item>
        <el-form-item label=" ">
          <el-button type="primary" class="w-full" :icon="Plus" @click="handleCreate">创建用户</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="content-panel p-5">
      <el-table :data="users" empty-text="暂无用户">
        <el-table-column prop="email" label="邮箱" min-width="220" />
        <el-table-column label="角色" width="140">
          <template #default="{ row }">
            <el-tag :type="row.role === 'ADMIN' ? 'warning' : 'info'">{{ row.role === 'ADMIN' ? '管理员' : '用户' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-switch
              v-model="row.isActive"
              active-text="启用"
              inactive-text="禁用"
              inline-prompt
              @change="(value: boolean) => handleStatusChange(row.id, value)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="180">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { createUser, fetchUsers, updateUser } from '../api/admin';
import { getErrorMessage } from '../api/http';
import type { User, UserRole } from '../types';

const users = ref<User[]>([]);

// 初始密码只在提交时发送给后端，后端保存 bcrypt 哈希。
const form = reactive({
  email: '',
  password: '',
  role: 'USER' as UserRole,
});

async function loadUsers() {
  users.value = await fetchUsers();
}

async function handleCreate() {
  if (!form.email || !form.password) {
    ElMessage.warning('请填写邮箱和初始密码');
    return;
  }

  try {
    await createUser({ ...form });
    ElMessage.success('用户已创建');
    form.email = '';
    form.password = '';
    form.role = 'USER';
    await loadUsers();
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '创建用户失败'));
  }
}

async function handleStatusChange(id: string, isActive: boolean) {
  try {
    await updateUser(id, { isActive });
    ElMessage.success('用户状态已更新');
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '用户状态更新失败'));
    await loadUsers();
  }
}

onMounted(loadUsers);
</script>
