import type { Provider } from '../types';

/**
 * 将后端 Provider 枚举值格式化为前端展示用的可读文本。
 */
export function formatProvider(provider: Provider): string {
  if (provider === 'GPT') return 'GPT';
  if (provider === 'GROK') return 'Grok';
  return 'Nano Banana';
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
