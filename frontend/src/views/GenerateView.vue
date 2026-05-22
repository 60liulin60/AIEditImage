<template>
  <section class="generate-grid">
    <div class="space-y-5">
      <div>
        <h1 class="text-2xl font-semibold">图片生成</h1>
        <p class="muted-text mt-1">选择 GPT 或 Nano Banana 配置，输入提示词即可生成；参考图可选。</p>
      </div>

      <div class="content-panel p-5">
        <el-form :model="form" label-position="top" class="space-y-2">
          <el-form-item label="API 配置">
            <el-select v-model="form.configId" class="w-full" placeholder="请选择配置" @change="handleConfigChange">
              <el-option
                v-for="config in configs"
                :key="config.id"
                :label="`${config.name} / ${formatProvider(config.provider)}`"
                :value="config.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="类型">
            <el-segmented v-model="form.provider" :options="providerOptions" />
          </el-form-item>
          <el-form-item label="提示词">
            <el-input v-model="form.prompt" type="textarea" :rows="7" maxlength="2000" show-word-limit />
          </el-form-item>
          <el-form-item label="尺寸">
            <el-select v-model="form.size" class="w-full">
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
          <el-button type="primary" class="w-full" :loading="submitting" :icon="MagicStick" @click="handleGenerate">
            生成图片
          </el-button>
        </el-form>
      </div>
    </div>

    <aside class="space-y-5">
      <div class="content-panel p-5">
        <h2 class="mb-4 text-lg font-semibold">提示词模板</h2>
        <div class="template-list">
          <button v-for="template in filteredTemplates" :key="template.title" class="template-item" @click="useTemplate(template.prompt)">
            <span class="font-medium">{{ template.title }}</span>
            <span class="muted-text text-sm">{{ template.category }}</span>
          </button>
        </div>
      </div>
      <div v-if="latestImageUrl" class="content-panel p-5">
        <h2 class="mb-4 text-lg font-semibold">最新结果</h2>
        <el-image :src="latestImageUrl" fit="cover" class="latest-image" :preview-src-list="[latestImageUrl]" />
      </div>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { UploadUserFile } from 'element-plus';
import { ElMessage } from 'element-plus';
import { MagicStick, UploadFilled } from '@element-plus/icons-vue';
import { createGeneration, fetchGeneration, getGenerationImageUrl } from '../api/generations';
import { getErrorMessage } from '../api/http';
import { promptTemplates } from '../constants/prompt-templates';
import type { ApiConfig, Provider } from '../types';
import { decryptApiKey, listApiConfigs } from '../utils/api-config-store';

const configs = ref<ApiConfig[]>([]);
const fileList = ref<UploadUserFile[]>([]);
const submitting = ref(false);
const latestImageUrl = ref('');
let pollingTimer: number | undefined;

// 默认 5 秒轮询一次，避免频繁请求后端；可通过前端 .env 覆盖。
const DEFAULT_GENERATION_POLL_INTERVAL_MS = 5000;
// 环境变量只接受正整数毫秒，异常值回退默认值，防止 0 或负数导致高频请求。
const generationPollIntervalMs = parsePollInterval(import.meta.env.VITE_GENERATION_POLL_INTERVAL_MS);

const providerOptions = [
  { label: 'GPT', value: 'GPT' },
  { label: 'Nano Banana', value: 'NANO_BANANA' },
];

const form = reactive({
  configId: '',
  provider: 'GPT' as Provider,
  prompt: '',
  size: '1024x1024',
});

const selectedConfig = computed(() => configs.value.find((config) => config.id === form.configId));
const referenceLimit = computed(() => (form.provider === 'GPT' ? 16 : 3));
const filteredTemplates = computed(() => promptTemplates.filter((template) => template.provider === form.provider));

function formatProvider(provider: Provider) {
  return provider === 'GPT' ? 'GPT' : 'Nano Banana';
}

function handleConfigChange() {
  if (selectedConfig.value) {
    form.provider = selectedConfig.value.provider;
  }
}

function useTemplate(prompt: string) {
  form.prompt = prompt;
}

function parsePollInterval(value: string | undefined) {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_GENERATION_POLL_INTERVAL_MS;
}

function clearPollingTimer() {
  if (pollingTimer) {
    window.clearTimeout(pollingTimer);
    pollingTimer = undefined;
  }
}

function scheduleGenerationPolling(id: string, attempt = 0) {
  clearPollingTimer();
  pollingTimer = window.setTimeout(() => {
    void pollGenerationResult(id, attempt);
  }, generationPollIntervalMs);
}

async function pollGenerationResult(id: string, attempt = 0) {
  try {
    const record = await fetchGeneration(id);
    if (record.status === 'SUCCESS') {
      latestImageUrl.value = getGenerationImageUrl(record.id);
      submitting.value = false;
      clearPollingTimer();
      ElMessage.success('图片生成成功');
      return;
    }

    if (record.status === 'FAILED') {
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
    submitting.value = false;
    clearPollingTimer();
    ElMessage.error(getErrorMessage(error, '生成结果查询失败'));
  }
}

async function handleGenerate() {
  if (!selectedConfig.value) {
    ElMessage.warning('请先选择 API 配置');
    return;
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
  configs.value = await listApiConfigs();
  if (configs.value[0]) {
    form.configId = configs.value[0].id;
    form.provider = configs.value[0].provider;
  }
});

onBeforeUnmount(clearPollingTimer);
</script>

<style scoped lang="scss">
.generate-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 24px;
}

.template-list {
  display: grid;
  gap: 10px;
}

.template-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}

.template-item:hover {
  border-color: #2563eb;
}

.latest-image {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
}

@media (max-width: 980px) {
  .generate-grid {
    grid-template-columns: 1fr;
  }
}
</style>
