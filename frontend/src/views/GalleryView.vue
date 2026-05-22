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
          <div class="mt-3 flex justify-end">
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
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { deleteGeneration, fetchGenerations, getGenerationImageUrl } from '../api/generations';
import { getErrorMessage } from '../api/http';
import type { GenerationStatus, ImageGeneration, Provider } from '../types';

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

// 空字符串表示不过滤，发送请求前会在 API 层省略该字段。
const filters = reactive({
  provider: '' as Provider | '',
  status: '' as GenerationStatus | '',
});

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

async function handleDelete(id: string) {
  // 删除是不可恢复操作，先让用户确认，再调用后端删除记录和文件。
  await ElMessageBox.confirm('删除后无法在列表中恢复，确认删除？', '删除图片记录', { type: 'warning' });
  await deleteGeneration(id);
  ElMessage.success('图片记录已删除');
  // 如果当前页最后一条被删，回退一页避免显示空分页。
  const targetPage = generations.value.length === 1 && page.value > 1 ? page.value - 1 : page.value;
  await loadGenerations(targetPage);
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
</style>
