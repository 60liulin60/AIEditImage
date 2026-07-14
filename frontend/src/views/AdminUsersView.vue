<template>
  <section class="admin-users-page space-y-6 fade-in">
    <div class="page-header">
      <h1 class="text-2xl font-semibold section-title">用户管理</h1>
      <p class="muted-text mt-2">管理员创建用户并控制账号启用状态。</p>
    </div>

    <!-- 新增/编辑用户弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingUserId ? '编辑用户' : '新增用户'"
      width="500px"
      destroy-on-close
      append-to-body
      lock-scroll
      class="user-form-dialog app-dialog"
      modal-class="user-dialog-overlay app-dialog-overlay"
      @closed="resetForm"
    >
      <el-form :model="form" label-position="top" class="dialog-form">
        <el-form-item label="邮箱" :error="formErrors.email">
          <el-input v-model="form.email" placeholder="user@example.com" @input="clearFormError('email')" />
        </el-form-item>
        <el-form-item label="密码" :error="formErrors.password">
          <el-input v-model="form.password" type="password" show-password :placeholder="editingUserId ? '留空则不修改密码' : '至少 6 位'" @input="clearFormError('password')" />
        </el-form-item>
        <el-form-item label="角色" :error="formErrors.role">
          <el-select v-model="form.role" class="w-full" popper-class="dialog-select-dropdown" @change="clearFormError('role')">
            <el-option label="用户" value="USER" />
            <el-option label="管理员" value="ADMIN" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" :disabled="submitLoading" @click="handleSubmit">
          {{ editingUserId ? '保存修改' : '创建用户' }}
        </el-button>
      </template>
    </el-dialog>

    <div class="content-panel table-section p-6">
      <div class="section-head">
        <h2 class="section-head-title">
          <el-icon class="section-head-icon"><User /></el-icon>
          用户列表
        </h2>
        <div class="section-head-actions">
          <span class="user-count">共 {{ users.length }} 位用户</span>
          <el-button type="primary" :icon="Plus" @click="openAddDialog">新增用户</el-button>
        </div>
      </div>
      <el-table :data="users" empty-text="暂无用户" class="styled-table">
        <el-table-column prop="email" label="邮箱" min-width="220">
          <template #default="{ row }">
            <span class="user-email">{{ row.email }}</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="140">
          <template #default="{ row }">
            <span class="role-chip" :class="row.role === 'ADMIN' ? 'role-admin' : 'role-user'">
              {{ row.role === 'ADMIN' ? '管理员' : '用户' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-switch
              v-model="row.isActive"
              active-text="启用"
              inactive-text="禁用"
              inline-prompt
              :loading="isUpdating(row.id)"
              :disabled="isUpdating(row.id) || loading"
              @change="(value: string | number | boolean) => handleStatusChange(row.id, Boolean(value))"
            />
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="180">
          <template #default="{ row }">
            <span class="date-text">{{ new Date(row.createdAt).toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button type="primary" link :disabled="loading" @click="openEditDialog(row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Plus, User, Edit } from '@element-plus/icons-vue';
import { createUser, fetchUsers, updateUser } from '../api/admin';
import { getErrorMessage } from '../api/http';
import type { User as UserType, UserRole } from '../types';

const users = ref<UserType[]>([]);
const loading = ref(false);
const submitLoading = ref(false);
const updatingUserIds = ref<string[]>([]);
const dialogVisible = ref(false);
const editingUserId = ref('');
const formErrors = reactive({
  email: '',
  password: '',
  role: '',
});

type FormErrorField = keyof typeof formErrors;

function clearFormError(field: FormErrorField) {
  formErrors[field] = '';
}

function clearFormErrors() {
  formErrors.email = '';
  formErrors.password = '';
  formErrors.role = '';
}

// 初始密码只在提交时发送给后端，后端保存 bcrypt 哈希。
const form = reactive({
  email: '',
  password: '',
  role: 'USER' as UserRole,
});

async function loadUsers() {
  // 用户列表只在管理员路由下加载，后端仍会校验权限。
  loading.value = true;
  try {
    users.value = await fetchUsers();
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '用户列表加载失败'));
  } finally {
    loading.value = false;
  }
}

function isUpdating(id: string) {
  return updatingUserIds.value.includes(id);
}

function resetForm() {
  // 表单复位，准备下次使用
  editingUserId.value = '';
  clearFormErrors();
  form.email = '';
  form.password = '';
  form.role = 'USER';
}

function openAddDialog() {
  resetForm();
  dialogVisible.value = true;
}

function openEditDialog(user: UserType) {
  // 编辑模式：回填邮箱和角色，密码留空
  editingUserId.value = user.id;
  clearFormErrors();
  form.email = user.email;
  form.password = '';
  form.role = user.role;
  dialogVisible.value = true;
}

function validateForm(): boolean {
  clearFormErrors();
  
  const email = form.email.trim();
  if (!email) {
    formErrors.email = '请填写邮箱';
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    formErrors.email = '请输入有效邮箱';
    return false;
  }
  
  // 新增模式必须填密码，编辑模式密码可选
  if (!editingUserId.value) {
    if (!form.password) {
      formErrors.password = '请填写初始密码';
      return false;
    }
    if (form.password.length < 6) {
      formErrors.password = '初始密码至少需要 6 位';
      return false;
    }
  } else if (form.password && form.password.length < 6) {
    formErrors.password = '密码至少需要 6 位';
    return false;
  }
  
  return true;
}

async function handleSubmit() {
  if (loading.value || submitLoading.value) {
    return;
  }

  if (!validateForm()) {
    return;
  }

  submitLoading.value = true;
  try {
    if (editingUserId.value) {
      // 编辑模式
      const updateData: { email: string; role: UserRole; password?: string } = {
        email: form.email.trim(),
        role: form.role,
      };
      if (form.password) {
        updateData.password = form.password;
      }
      await updateUser(editingUserId.value, updateData);
      ElMessage.success('用户已更新');
    } else {
      // 新增模式
      await createUser({ 
        email: form.email.trim(), 
        password: form.password, 
        role: form.role 
      });
      ElMessage.success('用户已创建');
    }
    dialogVisible.value = false;
    await loadUsers();
  } catch (error) {
    ElMessage.error(getErrorMessage(error, editingUserId.value ? '更新用户失败' : '创建用户失败'));
  } finally {
    submitLoading.value = false;
  }
}

async function handleStatusChange(id: string, isActive: boolean) {
  if (loading.value || isUpdating(id)) {
    return;
  }

  updatingUserIds.value.push(id);
  try {
    // 开关先乐观更新，失败后通过重新加载列表恢复真实状态。
    await updateUser(id, { isActive });
    ElMessage.success('用户状态已更新');
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '用户状态更新失败'));
    await loadUsers();
  } finally {
    updatingUserIds.value = updatingUserIds.value.filter((userId) => userId !== id);
  }
}

onMounted(loadUsers);
</script>

<style scoped lang="scss">
.admin-users-page {
  animation: fadeIn 0.5s ease-out both;
}

.page-header {
  animation: fadeIn 0.5s ease-out both;
}

/* 分区标题：图标 + 渐变装饰线 */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.section-head-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-family: 'Outfit', sans-serif;
  font-size: 17px;
  font-weight: 600;
  color: #1e293b;
  position: relative;
  padding-left: 14px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 2px;
    bottom: 2px;
    width: 4px;
    border-radius: 2px;
    background: var(--color-warm);
  }
}

.section-head-icon {
  color: var(--color-warm);
}

.user-count {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  padding: 4px 12px;
  background: #f1f5f9;
  border-radius: 10px;
}

.section-head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 弹窗表单样式 */
.dialog-form {
  :deep(.el-form-item) {
    margin-bottom: 20px;

    &:last-child {
      margin-bottom: 0;
    }
  }
}

/* 操作按钮 */
.row-actions {
  display: flex;
  gap: 4px;

  /* 表格内为文字链接按钮：无背景、暖色文字、hover 仅变深，与删除链接对齐 */
  :deep(.el-button.is-link) {
    height: auto;
    padding: 4px 6px;
    font-weight: 500;
    transition: color 0.2s ease;
  }

  :deep(.el-button--primary.is-link) {
    color: var(--color-warm);

    &:hover:not(:disabled) {
      color: var(--color-warm-light);
    }
  }

  /* 图标与文字间距 */
  :deep(.el-button .el-icon) {
    margin-right: 4px;
  }
}

.table-section {
  animation: fadeIn 0.5s ease-out 0.2s both;
}

/* 用户邮箱样式 */
.user-email {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  color: #334155;
}

/* 角色徽章 */
.role-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;

  &.role-admin {
    background: var(--color-warm-soft);
    color: var(--color-warm);
    border: 1px solid rgba(217, 119, 6, 0.2);
  }

  &.role-user {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
  }
}

/* 状态开关自定义 */
:deep(.el-switch) {
  --el-switch-on-color: #10b981;
  --el-switch-off-color: #cbd5e1;

  .el-switch__label {
    font-size: 12px;
    font-weight: 500;
  }
}

/* 日期文本 */
.date-text {
  font-size: 13px;
  color: #64748b;
}

/* 表格样式统一升级 */
.styled-table {
  :deep(.el-table__header) th.el-table__cell {
    background: #f8fafc;
    color: #475569;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid #e2e8f0;
  }

  :deep(.el-table__body) tr {
    transition: background 0.2s ease;

    &:hover {
      background: #f8fafc;
    }
  }

  :deep(.el-table__body) td.el-table__cell {
    color: #334155;
    transition: color 0.25s ease;

    tr:hover & {
      color: #0f172a;
    }
  }
}

/* 表单聚焦态统一暖色描边 */
:deep(.el-input__wrapper) {
  border-radius: 8px;
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.25) !important;
  }

  &.is-focus {
    box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.25) !important;
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #475569;
  font-size: 14px;
}

/* 主按钮：实心暖调，排除 link 变体避免误伤文字按钮 */
:deep(.el-button--primary:not(.is-link)) {
  border-radius: 8px;
  background: var(--color-warm) !important;
  border: none !important;
  font-weight: 600;
  transition: background 0.2s ease !important;

  &:hover:not(:disabled) {
    background: var(--color-warm-light) !important;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

<style lang="scss">
/* 滚动/层级由全局 .app-dialog 负责；此处保留用户弹窗主题色。 */
.user-form-dialog {
  border-radius: 12px;

  .el-dialog__header {
    border-bottom: 1px solid #e5e7eb;
    padding: 16px 20px;
    margin-right: 0;
  }

  .el-dialog__body {
    padding: 24px;
  }

  .el-dialog__footer {
    border-top: 1px solid #e5e7eb;
    padding: 12px 20px;

    .el-button--primary {
      border-radius: 8px;
      background: var(--color-warm) !important;
      border: 1px solid var(--color-warm) !important;
      font-weight: 600;
      transition: background 0.2s ease !important;

      &:hover:not(:disabled) {
        background: var(--color-warm-light) !important;
        border-color: var(--color-warm-light) !important;
      }
    }

    .el-button:not(.el-button--primary):not(.el-button--danger) {
      border-radius: 8px;
      transition: all 0.2s ease;

      &:hover:not(:disabled) {
        background: var(--color-warm-soft);
        border-color: var(--color-warm);
        color: var(--color-warm);
      }
    }
  }

  .dialog-form {
    .el-form-item {
      margin-bottom: 20px;

      &:last-child {
        margin-bottom: 0;
      }

      .el-form-item__label {
        font-weight: 500;
        color: #475569;
        font-size: 14px;
        margin-bottom: 8px;
      }
    }

    .el-input__wrapper,
    .el-select__wrapper {
      border-radius: 8px !important;
      transition: box-shadow 0.2s ease;

      &:hover {
        box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.25) !important;
      }

      &.is-focus {
        box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.25) !important;
      }
    }
  }
}
</style>
