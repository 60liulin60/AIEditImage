<template>
  <section class="space-y-5">
    <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">图片列表</h1>
        <p class="muted-text mt-1">分页查看当前账号生成的图片，点击图片可放大预览。</p>
      </div>
      <div class="flex gap-3">
        <el-select v-model="filters.provider" clearable placeholder="类型" class="w-40" @change="loadGenerations(1)">
          <el-option label="GPT" value="GPT" />
          <el-option label="Nano Banana" value="NANO_BANANA" />
        </el-select>
        <el-select v-model="filters.status" clearable placeholder="状态" class="w-40" @change="loadGenerations(1)">
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAILED" />
          <el-option label="处理中" value="PENDING" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="loadGenerations(page)">刷新</el-button>
      </div>
    </div>

    <div class="gallery-grid">
      <div v-for="item in generations" :key="item.id" class="content-panel gallery-card">
        <el-image
          v-if="item.status === 'SUCCESS'"
          :src="getGenerationImageUrl(item.id)"
          fit="cover"
          class="gallery-image"
          :preview-src-list="[getGenerationImageUrl(item.id)]"
        />
        <div v-else class="gallery-placeholder">
          <el-tag :type="item.status === 'FAILED' ? 'danger' : 'warning'">{{ formatStatus(item.status) }}</el-tag>
          <p class="muted-text mt-2">{{ item.errorMessage || '等待生成结果' }}</p>
        </div>
        <div class="p-4">
          <div class="mb-2 flex items-center justify-between">
            <el-tag size="small">{{ formatProvider(item.provider) }}</el-tag>
            <span class="muted-text text-xs">{{ new Date(item.createdAt).toLocaleString() }}</span>
          </div>
          <p class="prompt">{{ item.prompt }}</p>
          <div class="muted-text mt-3 text-sm">
            {{ item.model }} · 参考图 {{ item.referenceCount }} 张 · {{ item.durationMs ?? '-' }} ms
          </div>
          <div class="mt-3 flex justify-end gap-3">
            <el-button type="primary" link @click="openDetail(item)">查看</el-button>
            <el-button type="danger" link @click="handleDelete(item.id)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && generations.length === 0" description="暂无图片记录" />
    <div class="flex justify-end">
      <el-pagination
        background
        layout="prev, pager, next, total"
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @current-change="loadGenerations"
      />
    </div>

    <el-dialog v-model="detailVisible" title="图片详情" width="840px" class="generation-detail-dialog">
      <el-skeleton v-if="detailLoading" :rows="8" animated />
      <div v-else-if="detailRecord" class="detail-content">
        <div class="detail-top">
          <el-image
            v-if="detailRecord.status === 'SUCCESS'"
            :src="getGenerationImageUrl(detailRecord.id)"
            fit="cover"
            class="detail-image"
            :preview-src-list="[getGenerationImageUrl(detailRecord.id)]"
          />
          <div v-else class="detail-placeholder">
            <el-tag :type="detailRecord.status === 'FAILED' ? 'danger' : 'warning'">{{ formatStatus(detailRecord.status) }}</el-tag>
            <p class="muted-text mt-2">{{ detailRecord.errorMessage || '等待生成结果' }}</p>
          </div>
          <div class="detail-meta">
            <div>
              <span class="detail-label">类型</span>
              <strong>{{ formatProvider(detailRecord.provider) }}</strong>
            </div>
            <div>
              <span class="detail-label">模型</span>
              <strong>{{ detailRecord.model }}</strong>
            </div>
            <div>
              <span class="detail-label">状态</span>
              <strong>{{ formatStatus(detailRecord.status) }}</strong>
            </div>
            <div>
              <span class="detail-label">耗时</span>
              <strong>{{ detailRecord.durationMs ?? '-' }} ms</strong>
            </div>
            <div>
              <span class="detail-label">尺寸</span>
              <strong>{{ detailRecord.size || '-' }}</strong>
            </div>
            <div>
              <span class="detail-label">参考图</span>
              <strong>{{ detailRecord.referenceCount }} 张</strong>
            </div>
            <div class="detail-meta-wide">
              <span class="detail-label">请求地址</span>
              <strong>{{ detailRecord.baseUrl }}</strong>
            </div>
            <div class="detail-meta-wide">
              <span class="detail-label">创建时间</span>
              <strong>{{ new Date(detailRecord.createdAt).toLocaleString() }}</strong>
            </div>
          </div>
        </div>

        <section class="detail-section">
          <h3>原始提示词</h3>
          <p class="detail-text">{{ detailRecord.prompt }}</p>
        </section>

        <section v-if="detailRevisedPrompts.length > 0" class="detail-section">
          <h3>优化后的提示词</h3>
          <div v-for="(prompt, index) in detailRevisedPrompts" :key="`${index}-${prompt}`" class="detail-text">
            {{ prompt }}
          </div>
        </section>

        <section class="detail-section">
          <h3>请求参数</h3>
          <pre class="json-block">{{ formatJson(detailRecord.requestParams ?? {}) }}</pre>
        </section>

        <section v-if="detailResponseSummary" class="detail-section">
          <h3>响应摘要</h3>
          <pre class="json-block">{{ formatJson(detailResponseSummary) }}</pre>
        </section>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { deleteGeneration, fetchGeneration, fetchGenerations, getGenerationImageUrl } from '../api/generations';
import { getErrorMessage } from '../api/http';
import type { GenerationStatus, ImageGeneration, JsonRecord, Provider } from '../types';

// 当前页图片记录，由筛选条件和分页共同决定。
const generations = ref<ImageGeneration[]>([]);
// 分页总数来自后端，前端不根据当前页长度推断。
const total = ref(0);
// 当前页码在删除最后一条记录后可能回退一页。
const page = ref(1);
// 固定页大小让列表网格和后端分页保持稳定。
const pageSize = 12;
// 列表加载态用于禁用刷新按钮并避免重复反馈。
const loading = ref(false);
// 当前详情记录由“查看”按钮触发单条拉取，确保展示的是完整后端数据。
const detailRecord = ref<ImageGeneration | null>(null);
// 详情弹窗显隐与内容分离，关闭弹窗不影响列表数据。
const detailVisible = ref(false);
// 单条详情可能包含较大的 GPT 原始响应，加载时给用户明确反馈。
const detailLoading = ref(false);

// 空字符串表示不过滤，发送请求前会在 API 层省略该字段。
const filters = reactive({
  provider: '' as Provider | '',
  status: '' as GenerationStatus | '',
});

const detailResponseSummary = computed(() => getSummaryWithoutRawResponse(detailRecord.value));
const detailRevisedPrompts = computed(() => getRevisedPrompts(detailRecord.value));

function formatProvider(provider: Provider) {
  return provider === 'GPT' ? 'GPT' : 'Nano Banana';
}

function formatStatus(status: GenerationStatus) {
  const map: Record<GenerationStatus, string> = {
    PENDING: '处理中',
    SUCCESS: '成功',
    FAILED: '失败',
  };
  return map[status];
}

async function loadGenerations(targetPage = page.value) {
  // targetPage 支持筛选重置到第一页，也支持刷新当前页。
  loading.value = true;
  try {
    const data = await fetchGenerations({
      page: targetPage,
      pageSize,
      provider: filters.provider,
      status: filters.status,
    });
    generations.value = data.items;
    total.value = data.total;
    page.value = data.page;
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '图片列表加载失败'));
  } finally {
    loading.value = false;
  }
}

async function openDetail(item: ImageGeneration) {
  // 先打开弹窗再拉详情，避免网络慢时用户误以为点击无效。
  detailVisible.value = true;
  detailRecord.value = item;
  detailLoading.value = true;
  try {
    detailRecord.value = await fetchGeneration(item.id);
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '图片详情加载失败'));
  } finally {
    detailLoading.value = false;
  }
}

async function handleDelete(id: string) {
  // 删除是不可恢复操作，先让用户确认，再调用后端删除记录和文件。
  await ElMessageBox.confirm('删除后无法在列表中恢复，确认删除？', '删除图片记录', { type: 'warning' });
  await deleteGeneration(id);
  ElMessage.success('图片记录已删除');
  // 如果当前页最后一条被删，回退一页避免显示空分页。
  const targetPage = generations.value.length === 1 && page.value > 1 ? page.value - 1 : page.value;
  await loadGenerations(targetPage);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getResponseSummary(record: ImageGeneration | null): JsonRecord | null {
  // responseSummary 来自后端 JSON 字段，结构不固定，读取前先做对象判断。
  return isJsonRecord(record?.responseSummary) ? record.responseSummary : null;
}

function getRawResponse(record: ImageGeneration | null) {
  const summary = getResponseSummary(record);
  return summary && 'rawResponse' in summary ? summary.rawResponse : null;
}

function getSummaryWithoutRawResponse(record: ImageGeneration | null): JsonRecord | null {
  const summary = getResponseSummary(record);
  if (!summary) {
    return null;
  }

  // rawResponse 体积较大且页面不再展示，摘要区去掉它避免详情弹窗渲染过重。
  const { rawResponse: _rawResponse, ...summaryFields } = summary;
  return Object.keys(summaryFields).length > 0 ? summaryFields : null;
}

function getRevisedPrompts(record: ImageGeneration | null): string[] {
  const summary = getResponseSummary(record);
  const summaryPrompts = Array.isArray(summary?.revisedPrompts)
    ? summary.revisedPrompts.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  if (summaryPrompts.length > 0) {
    return summaryPrompts;
  }

  // 兼容旧记录或非标准网关：如果摘要未提取成功，再从完整响应里递归寻找 revised_prompt。
  return collectStringValuesByKey(getRawResponse(record), 'revised_prompt');
}

function collectStringValuesByKey(value: unknown, key: string): string[] {
  const values: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isJsonRecord(node)) {
      return;
    }

    const fieldValue = node[key];
    if (typeof fieldValue === 'string' && fieldValue.trim()) {
      values.push(fieldValue);
    }
    Object.values(node).forEach(visit);
  };

  visit(value);
  return values;
}

function formatJson(value: unknown) {
  // JSON 字段用于排查真实请求/响应，无法序列化时退回字符串避免详情空白。
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

onMounted(() => loadGenerations());
</script>

<style scoped lang="scss">
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}

.gallery-card {
  overflow: hidden;
}

.gallery-image,
.gallery-placeholder {
  width: 100%;
  aspect-ratio: 1;
}

.gallery-placeholder {
  display: grid;
  place-items: center;
  padding: 20px;
  background: #f3f4f6;
  text-align: center;
}

.prompt {
  display: -webkit-box;
  min-height: 44px;
  overflow: hidden;
  color: #111827;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.detail-content {
  display: grid;
  gap: 18px;
}

.detail-top {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
}

.detail-image,
.detail-placeholder {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
}

.detail-placeholder {
  display: grid;
  place-items: center;
  padding: 16px;
  background: #f3f4f6;
  text-align: center;
}

.detail-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-meta > div,
.detail-section {
  min-width: 0;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}

.detail-meta-wide {
  grid-column: 1 / -1;
}

.detail-label {
  display: block;
  margin-bottom: 4px;
  color: #6b7280;
  font-size: 12px;
}

.detail-meta strong {
  display: block;
  overflow-wrap: anywhere;
  color: #111827;
  font-size: 14px;
  line-height: 1.5;
}

.detail-section h3 {
  margin: 0 0 10px;
  color: #111827;
  font-size: 15px;
  font-weight: 600;
}

.detail-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #111827;
  line-height: 1.7;
}

.json-block {
  max-height: 280px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: #111827;
  color: #e5e7eb;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .detail-top,
  .detail-meta {
    grid-template-columns: 1fr;
  }
}
</style>
