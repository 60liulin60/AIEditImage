<template>
  <div class="gallery-page">
    <!-- 页面标题和操作区 -->
    <div class="page-header">
      <h2>图片列表</h2>
      <p class="subtitle">查看您的图片生成历史和详情</p>
    </div>

    <!-- 筛选和刷新控制栏 -->
    <div class="toolbar">
      <el-select
        v-model="providerFilter"
        placeholder="选择服务商"
        clearable
        @change="handleFilterChange"
      >
        <el-option label="全部服务商" value="" />
        <el-option label="GPT" value="GPT" />
        <el-option label="Nano Banana" value="NANO_BANANA" />
        <el-option label="Grok" value="GROK" />
      </el-select>

      <el-select
        v-model="statusFilter"
        placeholder="选择状态"
        clearable
        @change="handleFilterChange"
      >
        <el-option label="全部状态" value="" />
        <el-option label="处理中" value="PENDING" />
        <el-option label="成功" value="SUCCESS" />
        <el-option label="失败" value="FAILED" />
      </el-select>

      <el-button
        :icon="Refresh"
        circle
        :loading="loading"
        @click="loadGenerations"
        :disabled="loading"
      />
    </div>

    <!-- 图片网格 -->
    <div class="gallery-grid">
      <div
        v-for="(item, index) in generations"
        :key="item.id"
        class="gallery-card"
        :class="{ 'card-loading': item.status === 'PENDING' }"
      >
        <!-- 图片区域 -->
        <div class="card-image-wrapper">
          <el-image
            v-if="item.status === 'SUCCESS'"
            :src="getGenerationImageUrl(item.id)"
            :alt="item.prompt"
            fit="cover"
            lazy
            preview-teleported
            preview-fit="contain"
            class="gallery-image"
            :preview-src-list="[getGenerationImageUrl(item.id)]"
          />
          <div v-else class="gallery-placeholder">
            <el-icon class="is-loading" v-if="item.status === 'PENDING'"><Loading /></el-icon>
            <el-icon v-else><WarningFilled /></el-icon>
            <span>{{ getStatusText(item.status) }}</span>
          </div>
        </div>

        <!-- 卡片内容区 -->
        <div class="card-body">
          <p class="card-prompt">{{ item.prompt }}</p>
          <div class="card-meta">
            <span class="provider-badge">{{ item.provider }}</span>
            <span class="model-text">{{ item.model }}</span>
          </div>
          <div class="card-actions">
            <el-button link type="primary" @click="viewDetail(item)">查看</el-button>
            <el-button link type="danger" @click="deleteItem(item.id)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && generations.length === 0" class="empty-state">
      <el-empty description="暂无图片记录" />
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="total > 0">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[12, 24, 48]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- 详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      title="图片详情"
      width="900px"
      append-to-body
      lock-scroll
      class="generation-detail-dialog app-dialog"
      modal-class="detail-dialog-overlay app-dialog-overlay"
    >
      <div class="detail-content" v-if="detailRecord">
        <!-- 图片预览区 -->
        <div class="detail-image-section">
          <div class="detail-image-wrapper">
            <el-image
              v-if="detailRecord.status === 'SUCCESS'"
              :src="getGenerationImageUrl(detailRecord.id)"
              :alt="detailRecord.prompt"
              fit="contain"
              preview-teleported
              preview-fit="contain"
              class="detail-image"
              :preview-src-list="[getGenerationImageUrl(detailRecord.id)]"
            />
            <div v-else class="detail-placeholder">
              <el-icon v-if="detailRecord.status === 'PENDING'" class="is-loading"><Loading /></el-icon>
              <el-icon v-else><WarningFilled /></el-icon>
              <span>{{ getStatusText(detailRecord.status) }}</span>
            </div>
          </div>
        </div>

        <!-- 元数据区 -->
        <div class="detail-info-section">
          <div class="info-group">
            <label>提示词：</label>
            <p class="info-prompt">{{ detailRecord.prompt }}</p>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <label>服务商：</label>
              <span>{{ detailRecord.provider }}</span>
            </div>
            <div class="info-item">
              <label>模型：</label>
              <span>{{ detailRecord.model }}</span>
            </div>
            <div class="info-item">
              <label>尺寸：</label>
              <span>{{ detailRecord.size || '默认' }}</span>
            </div>
            <div class="info-item">
              <label>状态：</label>
              <span :class="`status-${detailRecord.status.toLowerCase()}`">
                {{ getStatusText(detailRecord.status) }}
              </span>
            </div>
            <div class="info-item">
              <label>参考图：</label>
              <span>{{ detailRecord.referenceCount || 0 }} 张</span>
            </div>
            <div class="info-item">
              <label>耗时：</label>
              <span>{{ detailRecord.durationMs ? `${detailRecord.durationMs}ms` : '-' }}</span>
            </div>
            <div class="info-item full-width">
              <label>创建时间：</label>
              <span>{{ formatDate(detailRecord.createdAt) }}</span>
            </div>
          </div>

          <!-- 请求参数 -->
          <div class="info-group" v-if="detailRecord.requestParams">
            <label>请求参数：</label>
            <pre class="info-json">{{ formatJson(detailRecord.requestParams) }}</pre>
          </div>

          <!-- 优化后的提示词 -->
          <div class="info-group" v-if="detailRecord.responseSummary?.revisedPrompts">
            <label>优化后的提示词：</label>
            <div class="revised-prompts">
              <p v-for="(revised, index) in (detailRecord.responseSummary.revisedPrompts as string[])" :key="index">
                {{ revised }}
              </p>
            </div>
          </div>

          <!-- 响应摘要 -->
          <div class="info-group" v-if="detailRecord.responseSummary">
            <label>响应摘要：</label>
            <pre class="info-json">{{ formatJson(detailRecord.responseSummary) }}</pre>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Refresh, Loading, WarningFilled } from '@element-plus/icons-vue'
import { fetchGenerations, fetchGeneration, deleteGeneration, getGenerationImageUrl } from '../api/generations'
import { formatDate } from '../utils/format'
import type { ImageGeneration, GenerationStatus, Provider } from '../types'

const generations = ref<ImageGeneration[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(12)
const total = ref(0)
const providerFilter = ref('')
const statusFilter = ref('')
const detailVisible = ref(false)
const detailRecord = ref<ImageGeneration | null>(null)
const pollingTimers = new Map<string, number>()

const getStatusText = (status: GenerationStatus) => {
  const map: Record<GenerationStatus, string> = {
    PENDING: '处理中',
    SUCCESS: '成功',
    FAILED: '失败'
  }
  return map[status]
}

const formatJson = (data: any) => {
  return JSON.stringify(data, null, 2)
}

const loadGenerations = async () => {
  loading.value = true
  try {
    const response = await fetchGenerations({
      page: currentPage.value,
      pageSize: pageSize.value,
      provider: (providerFilter.value || undefined) as Provider | undefined,
      status: (statusFilter.value || undefined) as GenerationStatus | undefined
    })
    generations.value = response.items
    total.value = response.total
    startPolling()
  } catch (error) {
    ElMessage.error('加载图片列表失败')
  } finally {
    loading.value = false
  }
}

const handleFilterChange = () => {
  currentPage.value = 1
  loadGenerations()
}

const handleSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  loadGenerations()
}

const handleCurrentChange = (page: number) => {
  currentPage.value = page
  loadGenerations()
}

const viewDetail = async (item: ImageGeneration) => {
  detailRecord.value = item
  detailVisible.value = true
  try {
    const response = await fetchGeneration(item.id)
    detailRecord.value = response
  } catch (error) {
    ElMessage.error('加载详情失败')
  }
}

const deleteItem = async (id: string) => {
  try {
    await ElMessageBox.confirm('删除后无法恢复，确定要删除吗？', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteGeneration(id)
    ElMessage.success('删除成功')
    loadGenerations()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const startPolling = () => {
  stopPolling()
  generations.value.forEach(item => {
    if (item.status === 'PENDING') {
      pollGeneration(item.id)
    }
  })
}

const pollGeneration = async (id: string) => {
  try {
    const response = await fetchGeneration(id)
    const index = generations.value.findIndex(g => g.id === id)
    if (index !== -1) {
      generations.value[index] = response
      if (response.status === 'PENDING') {
        const timer = window.setTimeout(() => pollGeneration(id), 3000)
        pollingTimers.set(id, timer)
      } else {
        pollingTimers.delete(id)
      }
    }
  } catch (error) {
    console.error('Polling failed:', error)
  }
}

const stopPolling = () => {
  pollingTimers.forEach((timer) => {
    clearTimeout(timer)
  })
  pollingTimers.clear()
}

onMounted(() => {
  loadGenerations()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped lang="scss">
.gallery-page {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  h2 {
    margin: 0 0 8px 0;
    font-size: 28px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .subtitle {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 14px;
  }
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;

  .el-select {
    width: 180px;
  }
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  flex: 1;
}

.gallery-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    border-color: var(--color-warm);
  }

  &.card-loading {
    opacity: 0.7;
  }
}

.card-image-wrapper {
  aspect-ratio: 1;
  background: var(--color-bg-secondary);
  position: relative;
  overflow: hidden;
}

.gallery-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);

  .el-icon {
    font-size: 48px;
  }

  span {
    font-size: 14px;
  }
}

.card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.card-prompt {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  min-height: 42px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-badge {
  padding: 4px 12px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
}

.model-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.card-actions {
  display: flex;
  gap: 12px;
  margin-top: auto;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.detail-content {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 24px;
}

.detail-image-section {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.detail-image-wrapper {
  width: 100%;
  aspect-ratio: 1;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-image {
  width: 100%;
  height: 100%;
  min-height: 200px;
  object-fit: contain;
  cursor: pointer;
}

.detail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);

  .el-icon {
    font-size: 64px;
  }

  span {
    font-size: 16px;
  }
}

.detail-info-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  padding-right: 8px;
}

.info-group {
  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
  }
}

.info-prompt {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  .info-item {
    label {
      display: block;
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-bottom: 4px;
    }

    span {
      font-size: 14px;
      color: var(--color-text-primary);
      font-weight: 500;
    }

    &.full-width {
      grid-column: 1 / -1;
    }
  }
}

.status-pending {
  color: var(--color-warning);
}

.status-success {
  color: var(--color-success);
}

.status-failed {
  color: var(--color-danger);
}

.info-json {
  margin: 0;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  max-height: 200px;
  white-space: pre-wrap;
  word-break: break-word;
}

.revised-prompts {
  display: flex;
  flex-direction: column;
  gap: 12px;

  p {
    margin: 0;
    padding: 12px;
    background: var(--color-bg-secondary);
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-text-primary);
  }
}

@media (max-width: 768px) {
  .toolbar {
    flex-wrap: wrap;

    .el-select {
      flex: 1;
      min-width: 140px;
    }
  }

  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }

  .detail-content {
    grid-template-columns: 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<!-- 非 scoped：Element Plus dialog 通过 teleport 渲染到 body，scoped 样式无法命中 -->
<style lang="scss">
/* 滚动/层级由全局 .app-dialog 负责；详情弹窗只补 body 内边距。 */
.generation-detail-dialog {
  .el-dialog__body {
    padding: 20px;
  }
}
</style>
