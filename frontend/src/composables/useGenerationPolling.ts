import { onBeforeUnmount } from 'vue';
import { fetchGeneration } from '../api/generations';
import { getErrorMessage } from '../api/http';
import type { ImageGeneration } from '../types';

// 默认 5 秒轮询一次，避免频繁请求后端；可通过前端 .env 覆盖。
const DEFAULT_POLL_INTERVAL_MS = 5000;
// 轮询最长持续约 3 分钟，避免任务卡死时页面无限等待。
const DEFAULT_POLL_TIMEOUT_MS = 180000;

export interface GenerationPollingCallbacks {
  // 任务进入 SUCCESS 终态时回调，参数为最新记录。
  onSuccess?: (record: ImageGeneration) => void;
  // 任务进入 FAILED 终态时回调，message 优先取后端错误信息。
  onFailed?: (record: ImageGeneration, message: string) => void;
  // 每次成功拉取到记录（含中间态）时回调，便于列表页就地更新。
  onUpdate?: (record: ImageGeneration) => void;
  // 达到轮询时间上限仍未终态时回调。
  onTimeout?: (id: string) => void;
  // 查询接口异常时回调，message 已格式化为可读文案。
  onError?: (error: unknown, message: string) => void;
}

export interface GenerationPollingOptions extends GenerationPollingCallbacks {
  // 单次轮询间隔（毫秒），非法值回退默认值。
  intervalMs?: number;
  // 轮询总时长上限（毫秒），非法值回退默认值。
  timeoutMs?: number;
}

// Vite 环境变量始终是字符串，非法值统一回落到默认轮询间隔。
export function parsePollInterval(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_INTERVAL_MS;
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * 统一的生成任务轮询器：管理多个任务的定时查询、终态回调与清理。
 * GenerateView 轮询单个新任务，GalleryView 为多个 PENDING 记录并行轮询，共用本实现。
 * 组件卸载时自动清理全部定时器，避免离开页面后仍在后台请求。
 */
export function useGenerationPolling(options: GenerationPollingOptions = {}) {
  const intervalMs = normalizePositiveInt(options.intervalMs, DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = normalizePositiveInt(options.timeoutMs, DEFAULT_POLL_TIMEOUT_MS);
  // 单个 id 到定时器句柄的映射，保证同一任务只保留一个待执行轮询。
  const timers = new Map<string, number>();

  function isPolling(id: string): boolean {
    return timers.has(id);
  }

  function clear(id: string): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.delete(id);
    }
  }

  function clearAll(): void {
    for (const timer of timers.values()) {
      window.clearTimeout(timer);
    }
    timers.clear();
  }

  function schedule(id: string, attempt: number): void {
    // 每个任务同一时刻只保留一个定时器，重复调度前先清理旧的。
    clear(id);
    const timer = window.setTimeout(() => {
      void tick(id, attempt);
    }, intervalMs);
    timers.set(id, timer);
  }

  async function tick(id: string, attempt: number): Promise<void> {
    let record: ImageGeneration;
    try {
      record = await fetchGeneration(id);
    } catch (error) {
      // 查询失败不立即终止，除非已到时间上限，避免偶发网络抖动中断轮询。
      options.onError?.(error, getErrorMessage(error, '生成结果查询失败'));
      if (reachedTimeout(attempt)) {
        clear(id);
        options.onTimeout?.(id);
        return;
      }
      schedule(id, attempt + 1);
      return;
    }

    options.onUpdate?.(record);

    if (record.status === 'SUCCESS') {
      clear(id);
      options.onSuccess?.(record);
      return;
    }
    if (record.status === 'FAILED') {
      clear(id);
      options.onFailed?.(record, record.errorMessage || '图片生成失败');
      return;
    }

    if (reachedTimeout(attempt)) {
      clear(id);
      options.onTimeout?.(id);
      return;
    }
    schedule(id, attempt + 1);
  }

  function reachedTimeout(attempt: number): boolean {
    // attempt 从 0 起算，每次间隔 intervalMs，达到总时长上限即停止。
    return attempt >= Math.ceil(timeoutMs / intervalMs);
  }

  // 开始轮询指定任务；若该任务已在轮询则忽略，避免重复调度。
  function start(id: string): void {
    if (timers.has(id)) {
      return;
    }
    schedule(id, 0);
  }

  // 组件卸载时兜底清理，避免离开页面后定时器继续触发请求。
  onBeforeUnmount(clearAll);

  return { start, clear, clearAll, isPolling, intervalMs, timeoutMs };
}
