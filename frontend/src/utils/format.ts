import type { GenerationStatus, Provider } from '../types';

/**
 * 将后端 Provider 枚举值格式化为前端展示用的可读文本。
 */
export function formatProvider(provider: Provider): string {
  if (provider === 'GPT') return 'GPT';
  if (provider === 'GROK') return 'Grok';
  return 'Nano Banana';
}

// 生成状态到中文文案的映射，列表页与详情页共用，避免各自维护一份。
const GENERATION_STATUS_TEXT: Record<GenerationStatus, string> = {
  PENDING: '处理中',
  SUCCESS: '成功',
  FAILED: '失败',
};

/**
 * 将生成状态枚举格式化为可读中文文案。
 */
export function formatGenerationStatus(status: GenerationStatus): string {
  return GENERATION_STATUS_TEXT[status] ?? String(status);
}

/**
 * 将任意 JSON 值格式化为带缩进的字符串，用于详情页只读展示。
 */
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * 将 ISO 日期字符串格式化为本地可读格式。
 */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
