import type { Provider } from '../types';

// 各 provider 的参考图数量上限，与后端常量保持一致：
// GPT 16 / Nano Banana 3 / Grok 5。新增 provider 时在此同步。
export const REFERENCE_IMAGE_LIMITS: Record<Provider, number> = {
  GPT: 16,
  NANO_BANANA: 3,
  GROK: 5,
};

// 兜底上限：未知 provider 取最保守的 Nano Banana 值，避免放行过多参考图。
const FALLBACK_REFERENCE_LIMIT = REFERENCE_IMAGE_LIMITS.NANO_BANANA;

/**
 * 返回指定 provider 的参考图数量上限。
 * 集中管理魔法数字，供表单校验与提交前二次校验共用。
 */
export function getReferenceLimit(provider: Provider): number {
  return REFERENCE_IMAGE_LIMITS[provider] ?? FALLBACK_REFERENCE_LIMIT;
}
