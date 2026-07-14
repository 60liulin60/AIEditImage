import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import type { ImageGeneration } from '../types';

// 模拟 api 层：轮询器只依赖 fetchGeneration，这里逐次返回受控的记录状态。
const fetchGeneration = vi.fn();
vi.mock('../api/generations', () => ({
  fetchGeneration: (id: string) => fetchGeneration(id),
}));

import { useGenerationPolling, parsePollInterval } from './useGenerationPolling';

function makeRecord(overrides: Partial<ImageGeneration> = {}): ImageGeneration {
  return {
    id: 'gen-1',
    provider: 'GPT',
    model: 'gpt-image-2',
    baseUrl: 'https://api.openai.com/v1',
    prompt: 'hello',
    referenceCount: 0,
    status: 'PENDING',
    createdAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

// 在真实组件上下文里挂载 composable，使其 onBeforeUnmount 生效，返回 composable 结果。
function mountPolling(options: Parameters<typeof useGenerationPolling>[0]) {
  let api!: ReturnType<typeof useGenerationPolling>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useGenerationPolling(options);
        return () => h('div');
      },
    }),
  );
  return { api, wrapper };
}

describe('parsePollInterval', () => {
  it('合法正整数字符串按原值解析', () => {
    expect(parsePollInterval('3000')).toBe(3000);
  });

  it('非法值(空/负/非数字/0)回退默认 5000', () => {
    expect(parsePollInterval(undefined)).toBe(5000);
    expect(parsePollInterval('0')).toBe(5000);
    expect(parsePollInterval('-1')).toBe(5000);
    expect(parsePollInterval('abc')).toBe(5000);
  });
});

describe('useGenerationPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchGeneration.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('轮询到 SUCCESS 时触发 onSuccess 并停止', async () => {
    fetchGeneration
      .mockResolvedValueOnce(makeRecord({ status: 'PENDING' }))
      .mockResolvedValueOnce(makeRecord({ status: 'SUCCESS' }));
    const onSuccess = vi.fn();
    const onUpdate = vi.fn();
    const { api } = mountPolling({ intervalMs: 1000, onSuccess, onUpdate });

    api.start('gen-1');
    // 第一次 tick：PENDING → 继续调度
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(api.isPolling('gen-1')).toBe(true);

    // 第二次 tick：SUCCESS → 回调并停止
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(api.isPolling('gen-1')).toBe(false);
  });

  it('轮询到 FAILED 时用后端错误信息回调 onFailed', async () => {
    fetchGeneration.mockResolvedValueOnce(makeRecord({ status: 'FAILED', errorMessage: '额度不足' }));
    const onFailed = vi.fn();
    const { api } = mountPolling({ intervalMs: 1000, onFailed });

    api.start('gen-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }), '额度不足');
    expect(api.isPolling('gen-1')).toBe(false);
  });

  it('达到时间上限仍未终态时触发 onTimeout', async () => {
    fetchGeneration.mockResolvedValue(makeRecord({ status: 'PENDING' }));
    const onTimeout = vi.fn();
    // intervalMs=1000, timeoutMs=2000 → 上限 attempt = ceil(2000/1000)=2
    const { api } = mountPolling({ intervalMs: 1000, timeoutMs: 2000, onTimeout });

    api.start('gen-1');
    await vi.advanceTimersByTimeAsync(1000); // attempt 0 → PENDING → 调度 attempt 1
    await vi.advanceTimersByTimeAsync(1000); // attempt 1 → PENDING → 调度 attempt 2
    await vi.advanceTimersByTimeAsync(1000); // attempt 2 → 达上限
    expect(onTimeout).toHaveBeenCalledWith('gen-1');
    expect(api.isPolling('gen-1')).toBe(false);
  });

  it('查询异常时触发 onError 且不立即中断轮询', async () => {
    fetchGeneration
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeRecord({ status: 'SUCCESS' }));
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const { api } = mountPolling({ intervalMs: 1000, onError, onSuccess });

    api.start('gen-1');
    await vi.advanceTimersByTimeAsync(1000); // 异常 → onError → 继续调度
    expect(onError).toHaveBeenCalledTimes(1);
    expect(api.isPolling('gen-1')).toBe(true);

    await vi.advanceTimersByTimeAsync(1000); // SUCCESS → 恢复正常
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('重复 start 同一任务不会重复调度', async () => {
    fetchGeneration.mockResolvedValue(makeRecord({ status: 'PENDING' }));
    const { api } = mountPolling({ intervalMs: 1000 });

    api.start('gen-1');
    api.start('gen-1'); // 已在轮询，应被忽略
    await vi.advanceTimersByTimeAsync(1000);
    // 只有一个定时器在跑 → 一次 tick 只调用一次 fetch
    expect(fetchGeneration).toHaveBeenCalledTimes(1);
  });

  it('clearAll 停止所有轮询', async () => {
    fetchGeneration.mockResolvedValue(makeRecord({ status: 'PENDING' }));
    const { api } = mountPolling({ intervalMs: 1000 });

    api.start('gen-1');
    api.start('gen-2');
    expect(api.isPolling('gen-1')).toBe(true);
    expect(api.isPolling('gen-2')).toBe(true);

    api.clearAll();
    expect(api.isPolling('gen-1')).toBe(false);
    expect(api.isPolling('gen-2')).toBe(false);

    // 清理后推进时间不应再触发查询
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchGeneration).not.toHaveBeenCalled();
  });

  it('组件卸载时自动清理定时器', async () => {
    fetchGeneration.mockResolvedValue(makeRecord({ status: 'PENDING' }));
    const { api, wrapper } = mountPolling({ intervalMs: 1000 });

    api.start('gen-1');
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(2000);
    // 卸载后定时器已清理，不再查询
    expect(fetchGeneration).not.toHaveBeenCalled();
  });
});
