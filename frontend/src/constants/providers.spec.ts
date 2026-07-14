import { describe, it, expect } from 'vitest';
import { getReferenceLimit, REFERENCE_IMAGE_LIMITS } from './providers';

describe('getReferenceLimit', () => {
  it('GPT 上限为 16', () => {
    expect(getReferenceLimit('GPT')).toBe(16);
  });

  it('Grok 上限为 5', () => {
    expect(getReferenceLimit('GROK')).toBe(5);
  });

  it('Nano Banana 上限为 3', () => {
    expect(getReferenceLimit('NANO_BANANA')).toBe(3);
  });

  it('与导出的映射表保持一致', () => {
    expect(getReferenceLimit('GPT')).toBe(REFERENCE_IMAGE_LIMITS.GPT);
    expect(getReferenceLimit('GROK')).toBe(REFERENCE_IMAGE_LIMITS.GROK);
    expect(getReferenceLimit('NANO_BANANA')).toBe(REFERENCE_IMAGE_LIMITS.NANO_BANANA);
  });
});
