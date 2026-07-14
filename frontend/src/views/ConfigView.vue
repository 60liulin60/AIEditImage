<template>
  <section class="config-page space-y-6 fade-in">
    <div class="page-header">
      <h1 class="text-2xl font-semibold section-title">API 配置</h1>
      <p class="muted-text mt-2">请求地址、模型和 Key 保存在当前浏览器，Key 会先加密再写入 IndexedDB；本地加密不能抵御浏览器 XSS。</p>
    </div>

    <!-- 新增/编辑配置弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingConfigId ? '编辑配置' : '新增配置'"
      width="600px"
      destroy-on-close
      append-to-body
      lock-scroll
      class="config-form-dialog app-dialog"
      modal-class="config-dialog-overlay app-dialog-overlay"
      @closed="resetForm"
    >
      <el-form :model="form" label-position="top">
        <el-form-item label="配置名称" :error="formErrors.name">
          <el-input v-model="form.name" placeholder="OpenAI 主账号" @input="clearFormError('name')" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.provider" style="width: 100%" popper-class="dialog-select-dropdown" :disabled="loading" @change="applyProviderDefaults">
            <el-option label="GPT" value="GPT" />
            <el-option label="Nano Banana" value="NANO_BANANA" />
            <el-option label="Grok" value="GROK" />
          </el-select>
        </el-form-item>
        <el-form-item label="请求地址" :error="formErrors.baseUrl">
          <el-input v-model="form.baseUrl" placeholder="例如：https://api.openai.com/v1" @input="clearFormError('baseUrl')" />
        </el-form-item>
        <el-form-item label="模型" :error="formErrors.model">
          <el-input v-model="form.model" @input="clearFormError('model')" />
        </el-form-item>
        <el-form-item label="API Key" :error="formErrors.apiKey">
          <div class="api-key-field">
            <el-input v-model="form.apiKey" type="password" show-password :placeholder="apiKeyPlaceholder" @input="clearFormError('apiKey')" />
            <span class="api-key-hint">
              <el-icon><Lock /></el-icon>
              本地加密存储
            </span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" :disabled="loading" @click="handleSave">
          {{ editingConfigId ? '保存修改' : '保存配置' }}
        </el-button>
      </template>
    </el-dialog>

    <div class="content-panel table-section p-6">
      <div class="section-head">
        <h2 class="section-head-title">
          <el-icon class="section-head-icon"><Setting /></el-icon>
          已保存配置
        </h2>
        <el-button type="primary" :icon="Plus" @click="openAddDialog">新增配置</el-button>
      </div>
      <el-table :data="configs" empty-text="暂无配置" class="styled-table">
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="类型" width="140">
          <template #default="{ row }">
            <span class="provider-chip">{{ formatProvider(row.provider) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="模型" min-width="180" />
        <el-table-column prop="baseUrl" label="请求地址" min-width="260" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button type="primary" link :disabled="loading || deletingConfigId === row.id" @click="startEdit(row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button type="danger" link :loading="deletingConfigId === row.id" :disabled="loading || deletingConfigId === row.id" @click="handleDelete(row.id)">
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Edit, Lock, Plus, Setting } from '@element-plus/icons-vue';
import { deleteApiConfig, listApiConfigs, saveApiConfig } from '../utils/api-config-store';
import { getErrorMessage } from '../api/http';
import type { ApiConfig, Provider } from '../types';

// 本地浏览器保存的配置列表，不从后端同步，避免泄露用户私有 Key。
const configs = ref<ApiConfig[]>([]);
const editingConfigId = ref('');
const loading = ref(false);
const deletingConfigId = ref('');
const dialogVisible = ref(false);
const formErrors = reactive({
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
});

type FormErrorField = keyof typeof formErrors;

// 默认值对应计划中的官方模型，用户可按代理服务自行修改。
const providerDefaults: Record<Provider, { baseUrl: string; model: string }> = {
  GPT: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2' },
  NANO_BANANA: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash-image-preview',
  },
  // 官方 xAI Images API；用户可改中转地址与模型名。
  GROK: { baseUrl: 'https://api.x.ai/v1', model: 'grok-imagine-image' },
};

// 配置表单只保存页面输入，保存时再加密 API Key 写入 IndexedDB。
const form = reactive({
  name: '',
  provider: 'GPT' as Provider,
  baseUrl: providerDefaults.GPT.baseUrl,
  model: providerDefaults.GPT.model,
  apiKey: '',
});

// 编辑模式下允许留空沿用原 Key，新增模式仍提示保存时会加密。
const apiKeyPlaceholder = computed(() =>
  editingConfigId.value
    ? '留空表示继续使用原 API Key，填写则替换'
    : '保存时会加密到本地浏览器；请勿在不信任的站点输入 Key',
);

function formatProvider(provider: Provider) {
  if (provider === 'GPT') return 'GPT';
  if (provider === 'GROK') return 'Grok';
  return 'Nano Banana';
}

function applyProviderDefaults() {
  // 切换 provider 时刷新推荐地址和模型，用户仍可手动覆盖。
  clearFormError('baseUrl');
  clearFormError('model');
  const defaults = providerDefaults[form.provider];
  form.baseUrl = defaults.baseUrl;
  form.model = defaults.model;
}

function clearFormError(field: FormErrorField) {
  formErrors[field] = '';
}

function clearFormErrors() {
  clearFormError('name');
  clearFormError('baseUrl');
  clearFormError('model');
  clearFormError('apiKey');
}

function validateForm() {
  clearFormErrors();
  if (!form.name.trim()) {
    formErrors.name = '请填写配置名称';
    return false;
  }
  try {
    const parsedUrl = new URL(form.baseUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
      formErrors.baseUrl = '请求地址仅支持 http 或 https，且不能包含账号密码';
      return false;
    }
  } catch {
    formErrors.baseUrl = '请输入有效请求地址';
    return false;
  }
  if (!form.model.trim()) {
    formErrors.model = '请填写模型';
    return false;
  }
  if (!editingConfigId.value && !form.apiKey.trim()) {
    formErrors.apiKey = '新增配置需要填写 API Key';
    return false;
  }
  return true;
}

async function loadConfigs() {
  // 每次新增、编辑、删除后重新读取，确保表格与 IndexedDB 一致。
  loading.value = true;
  try {
    configs.value = await listApiConfigs();
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  // 表单复位到新增模式，保留默认 GPT 配置便于继续录入。
  editingConfigId.value = '';
  deletingConfigId.value = '';
  clearFormErrors();
  form.name = '';
  form.provider = 'GPT';
  form.baseUrl = providerDefaults.GPT.baseUrl;
  form.model = providerDefaults.GPT.model;
  form.apiKey = '';
}

function startEdit(config: ApiConfig) {
  // 编辑只回填非敏感字段，避免把已保存的 API Key 明文展示在页面上。
  editingConfigId.value = config.id;
  deletingConfigId.value = '';
  clearFormErrors();
  form.name = config.name;
  form.provider = config.provider;
  form.baseUrl = config.baseUrl;
  form.model = config.model;
  form.apiKey = '';
  dialogVisible.value = true;
}

function openAddDialog() {
  resetForm();
  dialogVisible.value = true;
}

async function handleSave() {
  if (loading.value) {
    return;
  }
  if (!validateForm()) {
    return;
  }

  // saveApiConfig 内部负责新增加密、编辑沿用旧 Key 等边界处理。
  loading.value = true;
  try {
    await saveApiConfig({ ...form, id: editingConfigId.value || undefined });
    ElMessage.success(editingConfigId.value ? '配置已更新' : '配置已保存');
    // 关闭弹窗后由 @closed=resetForm 统一重置表单，避免重复重置。
    dialogVisible.value = false;
    await loadConfigs();
  } catch (error) {
    ElMessage.error(getErrorMessage(error, editingConfigId.value ? '配置更新失败' : '配置保存失败'));
  } finally {
    loading.value = false;
  }
}

async function handleDelete(id: string) {
  if (loading.value || deletingConfigId.value) {
    return;
  }

  // 删除配置会移除本地密文，之后生成需要用户重新填写 API Key。
  await ElMessageBox.confirm('删除后需要重新填写 API Key，确认删除？', '删除配置', { type: 'warning' });
  deletingConfigId.value = id;
  try {
    await deleteApiConfig(id);
    if (editingConfigId.value === id) {
      resetForm();
    }
    await loadConfigs();
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '配置删除失败'));
  } finally {
    deletingConfigId.value = '';
  }
}

onMounted(loadConfigs);
</script>

<style scoped lang="scss">
.config-page {
  animation: fadeIn 0.5s ease-out both;
}

.page-header {
  animation: fadeIn 0.5s ease-out both;
}

/* 分区标题：图标 + 纯色装饰线 */
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

.table-section {
  animation: fadeIn 0.5s ease-out 0.2s both;
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

/* API Key 安全提示 */
.api-key-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.api-key-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(16, 185, 129, 0.08);
  color: #059669;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid rgba(16, 185, 129, 0.2);

  .el-icon {
    font-size: 13px;
  }
}

/* 表格内 provider 徽章 */
.provider-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--color-warm-soft);
  color: var(--color-warm);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid rgba(217, 119, 6, 0.2);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;

  /* 表格内操作用文字链接：无背景无边框，仅文字色区分主/危险，保持行内紧凑。 */
  :deep(.el-button.is-link) {
    height: auto;
    padding: 4px 8px;
    font-weight: 500;
    background: transparent !important;
    border: none !important;
    transition: color 0.2s ease, background 0.2s ease;

    &:hover:not(:disabled) {
      background: var(--color-warm-soft) !important;
      border-radius: 6px;
    }
  }
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
      background: var(--color-warm-soft);
    }
  }

  :deep(.el-table__body) td.el-table__cell {
    color: #334155;
    transition: color 0.2s ease;

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
    box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.15) !important;
  }

  &.is-focus {
    box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.25) !important;
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #475569;
  font-size: 14px;
}

/* 主按钮纯色暖调：仅实心按钮，排除文字链接（link）变体避免误加背景。 */
:deep(.el-button--primary:not(.is-link):not(.is-text)) {
  border-radius: 8px;
  background: var(--color-warm) !important;
  border: none !important;
  font-weight: 600;
  transition: background 0.2s ease !important;

  &:hover:not(:disabled) {
    background: var(--color-warm-light) !important;
  }
}

/* primary link 文字色统一为暖色，覆盖 Element Plus 默认蓝。 */
:deep(.el-button--primary.is-link) {
  color: var(--color-warm);

  &:hover:not(:disabled) {
    color: var(--color-warm-light);
  }
}

:deep(.el-button:not(.el-button--primary):not(.el-button--danger)) {
  border-radius: 8px;
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--color-warm-soft);
    border-color: var(--color-warm);
    color: var(--color-warm);
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
/* 滚动/层级由全局 .app-dialog / .app-dialog-overlay 负责；此处只保留配置弹窗视觉。 */
.config-form-dialog {
  border-radius: 12px;

  .el-dialog__header {
    border-bottom: 1px solid #e5e7eb;
    padding: 16px 20px;
    margin-right: 0;
  }

  .el-dialog__body {
    padding: 20px;
  }

  .el-dialog__footer {
    border-top: 1px solid #e5e7eb;
    padding: 12px 20px;
  }

  /* 表单样式 */
  .el-form-item {
    margin-bottom: 18px;

    &:last-child {
      margin-bottom: 0;
    }

    .el-form-item__label {
      font-weight: 500;
      color: #475569;
      font-size: 14px;
      margin-bottom: 6px;
    }

    .el-input__wrapper,
    .el-select__wrapper {
      border-radius: 8px !important;
      transition: box-shadow 0.2s ease;

      &:hover {
        box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.15) !important;
      }

      &.is-focus {
        box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.25) !important;
      }
    }
  }

  /* API Key 字段 */
  .api-key-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .api-key-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(16, 185, 129, 0.08);
    color: #059669;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  /* 按钮样式 */
  .el-button {
    border-radius: 8px;
    font-weight: 500;
  }

  .el-button--primary {
    background: var(--color-warm) !important;
    border: none !important;
    transition: background 0.2s ease !important;

    &:hover:not(:disabled) {
      background: var(--color-warm-light) !important;
    }
  }

  .el-button--default {
    transition: background 0.2s ease;

    &:hover:not(:disabled) {
      background: var(--color-warm-soft);
      border-color: var(--color-warm);
      color: var(--color-warm);
    }
  }
}
</style>
