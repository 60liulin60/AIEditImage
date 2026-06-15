<template>
  <section class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold">API 配置</h1>
      <p class="muted-text mt-1">请求地址、模型和 Key 保存在当前浏览器，Key 会先加密再写入 IndexedDB；本地加密不能抵御浏览器 XSS。</p>
    </div>

    <div class="content-panel p-5">
      <el-form :model="form" label-position="top" class="grid gap-4 md:grid-cols-2">
        <el-form-item label="配置名称" :error="formErrors.name">
          <el-input v-model="form.name" placeholder="OpenAI 主账号" @input="clearFormError('name')" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.provider" class="w-full" :disabled="loading" @change="applyProviderDefaults">
            <el-option label="GPT" value="GPT" />
            <el-option label="Nano Banana" value="NANO_BANANA" />
          </el-select>
        </el-form-item>
        <el-form-item label="请求地址" :error="formErrors.baseUrl">
          <el-input v-model="form.baseUrl" placeholder="例如：https://api.openai.com/v1" @input="clearFormError('baseUrl')" />
        </el-form-item>
        <el-form-item label="模型" :error="formErrors.model">
          <el-input v-model="form.model" @input="clearFormError('model')" />
        </el-form-item>
        <el-form-item label="API Key" :error="formErrors.apiKey" class="md:col-span-2">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="apiKeyPlaceholder" @input="clearFormError('apiKey')" />
        </el-form-item>
      </el-form>
      <div class="flex justify-end gap-2">
        <el-button v-if="editingConfigId" :disabled="loading" @click="cancelEdit">取消编辑</el-button>
        <el-button type="primary" :icon="editingConfigId ? Edit : Plus" :loading="loading" :disabled="loading" @click="handleSave">
          {{ editingConfigId ? '保存修改' : '保存配置' }}
        </el-button>
      </div>
    </div>

    <div class="content-panel p-5">
      <el-table :data="configs" empty-text="暂无配置">
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="类型" width="140">
          <template #default="{ row }">{{ formatProvider(row.provider) }}</template>
        </el-table-column>
        <el-table-column prop="model" label="模型" min-width="180" />
        <el-table-column prop="baseUrl" label="请求地址" min-width="260" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :disabled="loading || deletingConfigId === row.id" @click="startEdit(row)">编辑</el-button>
            <el-button type="danger" link :loading="deletingConfigId === row.id" :disabled="loading || deletingConfigId === row.id" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Edit, Plus } from '@element-plus/icons-vue';
import { deleteApiConfig, listApiConfigs, saveApiConfig } from '../utils/api-config-store';
import { getErrorMessage } from '../api/http';
import type { ApiConfig, Provider } from '../types';

// 本地浏览器保存的配置列表，不从后端同步，避免泄露用户私有 Key。
const configs = ref<ApiConfig[]>([]);
const editingConfigId = ref('');
const loading = ref(false);
const deletingConfigId = ref('');
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
  return provider === 'GPT' ? 'GPT' : 'Nano Banana';
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
}

function cancelEdit() {
  // 取消编辑不触碰 IndexedDB，只恢复页面输入状态。
  resetForm();
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
    resetForm();
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
