<template>
  <section class="generate-grid fade-in">
    <div class="space-y-5">
      <div class="page-header">
        <h1 class="text-2xl font-semibold section-title">图片生成</h1>
        <p class="muted-text mt-2">选择 GPT、Nano Banana 或 Grok 配置，输入提示词即可生成；参考图可选。</p>
      </div>

      <div class="content-panel form-panel p-6">
        <el-form :model="form" label-position="top" class="space-y-2">
          <el-form-item label="API 配置">
            <el-select v-model="form.configId" class="w-full" placeholder="请选择配置" :disabled="submitting || configsLoading" @change="handleConfigChange">
              <el-option
                v-for="config in configs"
                :key="config.id"
                :label="`${config.name} / ${formatProvider(config.provider)}`"
                :value="config.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="类型">
            <el-segmented v-model="form.provider" :options="providerOptions" :disabled="submitting" @change="handleProviderChange" />
          </el-form-item>
          <el-form-item label="提示词">
            <el-input v-model="form.prompt" type="textarea" :rows="7" maxlength="2000" show-word-limit />
          </el-form-item>
          <el-form-item label="尺寸">
            <el-select v-model="form.size" class="w-full" :disabled="submitting">
              <el-option label="1024x1024" value="1024x1024" />
              <el-option label="1024x1536" value="1024x1536" />
              <el-option label="1536x1024" value="1536x1024" />
            </el-select>
          </el-form-item>
          <el-form-item :label="`参考图（可选，最多 ${referenceLimit} 张）`">
            <el-upload
              v-model:file-list="fileList"
              drag
              multiple
              :auto-upload="false"
              :limit="referenceLimit"
              :disabled="submitting"
              accept="image/png,image/jpeg,image/webp"
              class="w-full"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">拖拽图片到这里，或点击选择</div>
              <template #tip>
                <div class="el-upload__tip">支持 PNG、JPG、WEBP，单张建议不超过 10MB。</div>
              </template>
            </el-upload>
          </el-form-item>
          <el-button type="primary" class="generate-btn w-full" :loading="submitting" :disabled="submitting" @click="handleGenerate">
            <el-icon class="generate-btn-icon" :class="{ 'is-spinning': submitting }"><MagicStick /></el-icon>
            <span class="ml-2">{{ submitting ? '生成中' : '生成图片' }}</span>
          </el-button>
        </el-form>
      </div>
    </div>

    <aside class="space-y-5">
      <div class="content-panel template-panel p-6">
        <h2 class="template-title mb-4">提示词模板</h2>
        <div class="template-list">
          <button v-for="template in filteredTemplates" :key="template.title" class="template-item" @click="useTemplate(template.prompt)">
            <span class="template-name">{{ template.title }}</span>
            <span class="template-category">{{ template.category }}</span>
          </button>
        </div>
      </div>
      <div v-if="latestImageUrl" class="content-panel result-panel p-6">
        <h2 class="result-title mb-4">最新结果</h2>
        <el-image :src="latestImageUrl" fit="cover" class="latest-image" :preview-src-list="[latestImageUrl]" />
      </div>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { UploadUserFile } from 'element-plus';
import { MagicStick, UploadFilled } from '@element-plus/icons-vue';
import { createGeneration, fetchGeneration, getGenerationImageUrl } from '../api/generations';
import { getErrorMessage } from '../api/http';
import { promptTemplates } from '../constants/prompt-templates';
import type { ApiConfig, Provider } from '../types';
import { decryptApiKey, listApiConfigs } from '../utils/api-config-store';
import { formatProvider } from '../utils/format';

const configs = ref<ApiConfig[]>([]);
const configsLoading = ref(false);
// Element Plus 上传组件维护的文件列表，提交前再提取原始 File。
const fileList = ref<UploadUserFile[]>([]);
// 提交和轮询期间禁用生成按钮，避免重复创建同一任务。
const submitting = ref(false);
// 最新成功结果的图片地址，清空表示当前没有可预览结果。
const latestImageUrl = ref('');
// 单个轮询定时器句柄，离开页面或任务结束时必须清理。
let pollingTimer: number | undefined;

// 默认 5 秒轮询一次，避免频繁请求后端；可通过前端 .env 覆盖。
const DEFAULT_GENERATION_POLL_INTERVAL_MS = 5000;
// 环境变量只接受正整数毫秒，异常值回退默认值，防止 0 或负数导致高频请求。
const generationPollIntervalMs = parsePollInterval(import.meta.env.VITE_GENERATION_POLL_INTERVAL_MS);

const providerOptions = [
  { label: 'GPT', value: 'GPT' },
  { label: 'Nano Banana', value: 'NANO_BANANA' },
  { label: 'Grok', value: 'GROK' },
];

// 生成表单的页面态，API Key 不进入表单，提交时再从加密配置解密。
const form = reactive({
  configId: '',
  provider: 'GPT' as Provider,
  prompt: '',
  size: '1024x1024',
});

// 当前选中的配置作为生成请求的 provider/baseUrl/model 来源。
const selectedConfig = computed(() => configs.value.find((config) => config.id === form.configId));
// 参考图上限与后端常量保持一致：GPT 16 / Nano Banana 3 / Grok 5。
const referenceLimit = computed(() => {
  if (form.provider === 'GPT') return 16;
  if (form.provider === 'GROK') return 5;
  return 3;
});
// 模板只展示当前 provider 可用的内容，避免误用不兼容提示词。
const filteredTemplates = computed(() => promptTemplates.filter((template) => template.provider === form.provider));

function handleConfigChange() {
  if (selectedConfig.value) {
    // 切换配置时同步 provider，确保参考图数量和模板过滤立即更新。
    form.provider = selectedConfig.value.provider;
  }
  trimReferenceFilesIfNeeded();
}

function handleProviderChange() {
  // 切换类型时优先选中同类型配置，减少“页面显示 Grok、实际提交 GPT”的错位。
  const matchedConfig = configs.value.find((config) => config.provider === form.provider);
  if (matchedConfig) {
    form.configId = matchedConfig.id;
  }
  trimReferenceFilesIfNeeded();
}

function trimReferenceFilesIfNeeded() {
  if (fileList.value.length > referenceLimit.value) {
    fileList.value = fileList.value.slice(0, referenceLimit.value);
    ElMessage.warning(`当前类型最多支持 ${referenceLimit.value} 张参考图，已移除多余文件`);
  }
}

function useTemplate(prompt: string) {
  // 模板只是填充文本，仍保留用户继续编辑的空间。
  form.prompt = prompt;
}

function parsePollInterval(value: string | undefined) {
  // Vite 环境变量始终是字符串，非法值统一回落到默认轮询间隔。
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_GENERATION_POLL_INTERVAL_MS;
}

function clearPollingTimer() {
  if (pollingTimer) {
    // window.clearTimeout 只接受有效句柄，清理后置空便于重复调用。
    window.clearTimeout(pollingTimer);
    pollingTimer = undefined;
  }
}

function scheduleGenerationPolling(id: string, attempt = 0) {
  // 每次只保留一个轮询任务，避免连续点击或重试导致并发查询。
  clearPollingTimer();
  pollingTimer = window.setTimeout(() => {
    void pollGenerationResult(id, attempt);
  }, generationPollIntervalMs);
}

async function pollGenerationResult(id: string, attempt = 0) {
  try {
    const record = await fetchGeneration(id);
    if (record.status === 'SUCCESS') {
      // 成功后再生成图片地址，确保后端文件已经可读。
      latestImageUrl.value = getGenerationImageUrl(record.id);
      submitting.value = false;
      clearPollingTimer();
      ElMessage.success('图片生成成功');
      return;
    }

    if (record.status === 'FAILED') {
      // 后端失败信息优先展示，缺失时再使用通用文案。
      submitting.value = false;
      clearPollingTimer();
      ElMessage.error(record.errorMessage || '图片生成失败');
      return;
    }

    // 生成任务仍在后端执行，最多轮询约 3 分钟，避免页面无限等待。
    if (attempt >= Math.ceil(180000 / generationPollIntervalMs)) {
      submitting.value = false;
      clearPollingTimer();
      ElMessage.warning('生成仍在处理中，请稍后到图片列表查看');
      return;
    }

    scheduleGenerationPolling(id, attempt + 1);
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '生成结果查询失败'));
    if (attempt >= Math.ceil(180000 / generationPollIntervalMs)) {
      submitting.value = false;
      clearPollingTimer();
      return;
    }
    scheduleGenerationPolling(id, attempt + 1);
  }
}

async function handleGenerate() {
  if (submitting.value) {
    return;
  }
  if (!selectedConfig.value) {
    ElMessage.warning('请先选择 API 配置');
    return;
  }
  if (selectedConfig.value.provider !== form.provider) {
    // 类型分段与配置可能不一致，提交始终以配置的 provider 为准，避免误以为在用 Grok。
    ElMessage.warning(`当前配置类型为 ${formatProvider(selectedConfig.value.provider)}，已按配置提交`);
    form.provider = selectedConfig.value.provider;
  }
  if (!form.prompt.trim()) {
    ElMessage.warning('请输入提示词');
    return;
  }

  // Element Plus 的 raw 带上传内部字段，发送前只按浏览器 File 接口使用。
  const files: File[] = fileList.value.flatMap((item) => (item.raw ? [item.raw as File] : []));
  if (files.length > referenceLimit.value) {
    ElMessage.warning(`当前类型最多支持 ${referenceLimit.value} 张参考图`);
    return;
  }

  submitting.value = true;
  try {
    const apiKey = await decryptApiKey(selectedConfig.value);
    // 请求中的敏感 Key 来自本地解密结果，只随本次生成任务传给后端。
    const result = await createGeneration({
      provider: selectedConfig.value.provider,
      baseUrl: selectedConfig.value.baseUrl,
      model: selectedConfig.value.model,
      apiKey,
      prompt: form.prompt,
      size: form.size,
      referenceImages: files,
    });
    // 后端异步生成，先保存 PENDING 记录；前端轮询同一条记录直到成功或失败。
    latestImageUrl.value = '';
    ElMessage.success('生成任务已提交');
    scheduleGenerationPolling(result.id);
  } catch (error) {
    submitting.value = false;
    ElMessage.error(getErrorMessage(error, '图片生成失败'));
  }
}

onMounted(async () => {
  // 默认选中第一条配置，减少首次进入生成页的操作步骤。
  configsLoading.value = true;
  try {
    configs.value = await listApiConfigs();
    if (configs.value[0]) {
      form.configId = configs.value[0].id;
      form.provider = configs.value[0].provider;
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'API 配置加载失败'));
  } finally {
    configsLoading.value = false;
  }
});

onBeforeUnmount(clearPollingTimer);
</script>

<style scoped lang="scss">
.generate-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 28px;
  transition: grid-template-columns 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-header {
  animation: fadeIn 0.5s ease-out both;
}

/* 表单面板：纯白卡片，顶部一条暖色实线点明主色。 */
.form-panel {
  position: relative;
  overflow: hidden;
  background: #ffffff;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--color-warm);
    border-radius: 12px 12px 0 0;
  }
}

/* 生成按钮：纯暖色实底，hover 仅微调亮度。 */
.generate-btn {
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  background: var(--color-warm) !important;
  border: 1px solid var(--color-warm) !important;
  border-radius: 8px !important;
  transition: background 0.2s ease !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    background: var(--color-warm-light) !important;
    border-color: var(--color-warm-light) !important;
  }
}

.generate-btn-icon {
  font-size: 20px;
  transition: transform 0.3s ease;

  &.is-spinning {
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 提示词模板面板 */
.template-panel {
  animation: fadeIn 0.5s ease-out 0.1s both;
  background: var(--color-surface);
}

.template-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  position: relative;
  padding-left: 14px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 3px;
    bottom: 3px;
    width: 3px;
    border-radius: 2px;
    background: var(--color-warm);
  }
}

.template-list {
  display: grid;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(241, 245, 249, 0.5);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;

    &:hover {
      background: #94a3b8;
    }
  }
}

.template-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  text-align: left;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s ease, background 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 0;
    background: var(--color-warm);
    transition: width 0.2s ease;
    border-radius: 8px 0 0 8px;
  }

  &::after {
    content: '';
    position: absolute;
    right: 16px;
    top: 50%;
    width: 6px;
    height: 6px;
    border-top: 2px solid #cbd5e1;
    border-right: 2px solid #cbd5e1;
    transform: translateY(-50%) rotate(45deg);
    transition: all 0.3s ease;
  }

  &:hover {
    border-color: #f59e0b;
    background: var(--color-warm-soft);

    &::before {
      width: 3px;
    }

    &::after {
      right: 12px;
      border-color: #f59e0b;
    }

    .template-name {
      color: #d97706;
    }

    .template-category {
      color: #64748b;
    }
  }
}

.template-name {
  font-weight: 500;
  color: #1e293b;
  font-size: 14px;
  transition: color 0.3s ease;
}

.template-category {
  color: #94a3b8;
  font-size: 12px;
  transition: color 0.3s ease;
}

/* 最新结果面板 */
.result-panel {
  animation: fadeIn 0.5s ease-out 0.2s both;
  position: relative;
  background: var(--color-surface);
}

.result-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  position: relative;
  padding-left: 14px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 3px;
    bottom: 3px;
    width: 3px;
    border-radius: 2px;
    background: var(--color-warm);
  }
}

.latest-image {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 表单聚焦态统一暖色描边 */
:deep(.el-input__wrapper) {
  border-radius: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.3) !important;
  }

  &.is-focus {
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.4) !important;
  }
}

:deep(.el-textarea__inner) {
  border-radius: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.3);
  }

  &:focus {
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.4) !important;
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #475569;
  font-size: 14px;
}

/* 上传区域自定义样式 */
:deep(.el-upload-dragger) {
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
  transition: border-color 0.2s ease, background 0.2s ease;
  background: var(--color-surface-alt);

  &:hover {
    border-color: var(--color-warm);
    background: var(--color-warm-soft);
  }
}

:deep(.el-segmented) {
  border-radius: 8px;
  background: #f1f5f9;
  padding: 4px;

  .el-segmented__item {
    border-radius: 6px;
    transition: background 0.2s ease, color 0.2s ease;

    &.is-selected {
      background: var(--color-warm);
      color: #ffffff;
      font-weight: 600;
    }

    &:hover:not(.is-selected) {
      background: rgba(217, 119, 6, 0.1);
      color: var(--color-warm);
    }
  }
}

@media (max-width: 980px) {
  .generate-grid {
    grid-template-columns: 1fr;
  }
}
</style>
