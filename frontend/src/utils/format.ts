import type { Provider } from '../types';

/**
 * 将后端 Provider 枚举值格式化为前端展示用的可读文本。
 */
export function formatProvider(provider: Provider): string {
  return provider === 'GPT' ? 'GPT' : 'Nano Banana';
}
