import { describe, it, expect } from 'vitest';
import { formatProvider, formatDate, formatGenerationStatus, formatJson } from './format';

describe('formatProvider', () => {
  it('映射 GPT 为原样文本', () => {
    expect(formatProvider('GPT')).toBe('GPT');
  });

  it('映射 GROK 为可读的 Grok', () => {
    expect(formatProvider('GROK')).toBe('Grok');
  });

  it('其余 provider 归为 Nano Banana', () => {
    expect(formatProvider('NANO_BANANA')).toBe('Nano Banana');
  });
});

describe('formatDate', () => {
  it('空值返回占位符', () => {
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate(null)).toBe('-');
    expect(formatDate('')).toBe('-');
  });

  it('非法日期字符串原样返回', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('合法 ISO 字符串格式化为本地时间(含年月日时分秒)', () => {
    const result = formatDate('2026-07-14T01:17:14.830Z');
    // 不同时区下具体值会变，这里只校验结构：包含日期与时间分隔。
    expect(result).toMatch(/\d{4}/);
    expect(result).not.toBe('-');
    expect(result).not.toBe('2026-07-14T01:17:14.830Z');
  });
});

describe('formatGenerationStatus', () => {
  it('映射三个已知状态为中文', () => {
    expect(formatGenerationStatus('PENDING')).toBe('处理中');
    expect(formatGenerationStatus('SUCCESS')).toBe('成功');
    expect(formatGenerationStatus('FAILED')).toBe('失败');
  });

  it('未知状态回退为原始字符串', () => {
    // 后端若新增状态，前端至少原样展示而非渲染 undefined。
    expect(formatGenerationStatus('UNKNOWN' as never)).toBe('UNKNOWN');
  });
});

describe('formatJson', () => {
  it('对象格式化为两空格缩进字符串', () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('null 与基本类型安全序列化', () => {
    expect(formatJson(null)).toBe('null');
    expect(formatJson('text')).toBe('"text"');
  });
});
