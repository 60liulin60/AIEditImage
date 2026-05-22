<template>
  <section class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold">API 配置</h1>
      <p class="muted-text mt-1">请求地址、模型和 Key 保存在当前浏览器，Key 会先加密再写入 IndexedDB。</p>
    </div>

    <div class="content-panel p-5">
      <el-form :model="form" label-position="top" class="grid gap-4 md:grid-cols-2">
        <el-form-item label="配置名称">
          <el-input v-model="form.name" placeholder="OpenAI 主账号" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.provider" class="w-full" @change="applyProviderDefaults">
            <el-option label="GPT" value="GPT" />
            <el-option label="Nano Banana" value="NANO_BANANA" />
          </el-select>
        </el-form-item>
        <el-form-item label="请求地址">
          <el-input v-model="form.baseUrl" placeholder="例如：https://api.openai.com/v1" />
        </el-form-item>
        <el-form-item label="模型">
          <el-input v-model="form.model" />
        </el-form-item>
        <el-form-item label="API Key" class="md:col-span-2">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="apiKeyPlaceholder" />
        </el-form-item>
      </el-form>
      <div class="flex justify-end gap-2">
        <el-button v-if="editingConfigId" @click="cancelEdit">取消编辑</el-button>
        <el-button type="primary" :icon="editingConfigId ? Edit : Plus" @click="handleSave">
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
            <el-button type="primary" link @click="startEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row.id)">删除</el-button>
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
import type { ApiConfig, Provider } from '../types';

const configs = ref<ApiConfig[]>([]);
// 非空表示当前处于编辑模式，保存时按该 id 覆盖原配置。
const editingConfigId = ref('');

// 默认值对应计划中的官方模型，用户可按代理服务自行修改。
const providerDefaults: Record<Provider, { baseUrl: string; model: string }> = {
  GPT: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2' },
  NANO_BANANA: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash-image-preview',
  },
};

const form = reactive({
  name: '',
  provider: 'GPT' as Provider,
  baseUrl: providerDefaults.GPT.baseUrl,
  model: providerDefaults.GPT.model,
  apiKey: '',
});

// 编辑模式下允许留空沿用原 Key，新增模式仍提示保存时会加密。
const apiKeyPlaceholder = computed(() =>
  editingConfigId.value ? '留空表示继续使用原 API Key，填写则替换' : '保存时会加密到本地浏览器',
);

function formatProvider(provider: Provider) {
  return provider === 'GPT' ? 'GPT' : 'Nano Banana';
}

function applyProviderDefaults() {
  const defaults = providerDefaults[form.provider];
  form.baseUrl = defaults.baseUrl;
  form.model = defaults.model;
}

async function loadConfigs() {
  configs.value = await listApiConfigs();
}

function resetForm() {
  // 表单复位到新增模式，保留默认 GPT 配置便于继续录入。
  editingConfigId.value = '';
  form.name = '';
  form.provider = 'GPT';
  form.baseUrl = providerDefaults.GPT.baseUrl;
  form.model = providerDefaults.GPT.model;
  form.apiKey = '';
}

function startEdit(config: ApiConfig) {
  // 编辑只回填非敏感字段，避免把已保存的 API Key 明文展示在页面上。
  editingConfigId.value = config.id;
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
  if (!form.name || !form.baseUrl || !form.model || (!editingConfigId.value && !form.apiKey)) {
    ElMessage.warning('请填写完整配置');
    return;
  }

  await saveApiConfig({ ...form, id: editingConfigId.value || undefined });
  ElMessage.success(editingConfigId.value ? '配置已更新' : '配置已保存');
  resetForm();
  await loadConfigs();
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('删除后需要重新填写 API Key，确认删除？', '删除配置', { type: 'warning' });
  await deleteApiConfig(id);
  if (editingConfigId.value === id) {
    resetForm();
  }
  await loadConfigs();
}

onMounted(loadConfigs);
</script>
