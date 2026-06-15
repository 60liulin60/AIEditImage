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
          <el-button type="primary" class="w-full" :loading="submitting" :disabled="submitting" :icon="MagicStick" @click="handleGenerate">
            {{ submitting ? '生成中' : '生成图片' }}
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
// GPT 支持更多参考图，Nano Banana 按后端能力限制为 3 张。
const referenceLimit = computed(() => (form.provider === 'GPT' ? 16 : 3));
// 模板只展示当前 provider 可用的内容，避免误用不兼容提示词。
const filteredTemplates = computed(() => promptTemplates.filter((template) => template.provider === form.provider));

function formatProvider(provider: Provider) {
  return provider === 'GPT' ? 'GPT' : 'Nano Banana';
}

function handleConfigChange() {
  if (selectedConfig.value) {
    // 切换配置时同步 provider，确保参考图数量和模板过滤立即更新。
    form.provider = selectedConfig.value.provider;
  }
  trimReferenceFilesIfNeeded();
}

function handleProviderChange() {
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
