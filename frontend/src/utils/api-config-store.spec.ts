import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  decryptApiKey,
  deleteApiConfig,
  listApiConfigs,
  saveApiConfig,
} from './api-config-store';

// 每个用例前重置 IndexedDB 与 localStorage，保证配置与本机密钥互不污染。
beforeEach(() => {
  // 重新赋值全局 indexedDB 即可清空所有数据库，避免用例间残留配置。
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

describe('api-config-store 加解密往返', () => {
  it('保存后能原样解密出 API Key', async () => {
    const saved = await saveApiConfig({
      name: 'OpenAI 主账号',
      provider: 'GPT',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      apiKey: 'sk-secret-123',
    });

    // 密文与明文不同，且不包含原始 Key，确认确实加密。
    expect(saved.encryptedKey).not.toBe('sk-secret-123');
    expect(saved.encryptedKey).not.toContain('sk-secret');
    expect(saved.iv).toBeTruthy();

    const decrypted = await decryptApiKey(saved);
    expect(decrypted).toBe('sk-secret-123');
  });

  it('每次加密使用不同 IV，同一 Key 密文不重复', async () => {
    const base = {
      name: 'a',
      provider: 'GPT' as const,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      apiKey: 'sk-same-key',
    };
    const first = await saveApiConfig(base);
    const second = await saveApiConfig(base);

    // AES-GCM 随机 IV 保证相同明文得到不同密文与 IV。
    expect(first.iv).not.toBe(second.iv);
    expect(first.encryptedKey).not.toBe(second.encryptedKey);
    // 但两者都能解回同一明文。
    expect(await decryptApiKey(first)).toBe('sk-same-key');
    expect(await decryptApiKey(second)).toBe('sk-same-key');
  });
});

describe('saveApiConfig 新增/编辑边界', () => {
  it('新增缺少 API Key 时抛错', async () => {
    await expect(
      saveApiConfig({
        name: 'no-key',
        provider: 'GPT',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-image-2',
      }),
    ).rejects.toThrow('API Key 不能为空');
  });

  it('编辑指向不存在的配置时抛错', async () => {
    await expect(
      saveApiConfig({
        id: 'missing-id',
        name: 'ghost',
        provider: 'GPT',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-image-2',
        apiKey: 'sk-x',
      }),
    ).rejects.toThrow('原始配置不存在');
  });

  it('编辑留空 API Key 时沿用旧密文', async () => {
    const created = await saveApiConfig({
      name: '原配置',
      provider: 'GROK',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-imagine-image',
      apiKey: 'sk-original',
    });

    const updated = await saveApiConfig({
      id: created.id,
      name: '改名后',
      provider: 'GROK',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-imagine-image',
      // apiKey 留空：应沿用旧密文与 IV。
    });

    expect(updated.name).toBe('改名后');
    expect(updated.encryptedKey).toBe(created.encryptedKey);
    expect(updated.iv).toBe(created.iv);
    // 创建时间保留，更新时间刷新。
    expect(updated.createdAt).toBe(created.createdAt);
    expect(await decryptApiKey(updated)).toBe('sk-original');
  });

  it('编辑填写新 Key 时重新加密', async () => {
    const created = await saveApiConfig({
      name: 'c',
      provider: 'GPT',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      apiKey: 'sk-old',
    });

    const updated = await saveApiConfig({
      id: created.id,
      name: 'c',
      provider: 'GPT',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      apiKey: 'sk-new',
    });

    expect(updated.encryptedKey).not.toBe(created.encryptedKey);
    expect(await decryptApiKey(updated)).toBe('sk-new');
  });
});

describe('listApiConfigs / deleteApiConfig', () => {
  it('列出所有已保存配置', async () => {
    await saveApiConfig({
      name: 'a',
      provider: 'GPT',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      apiKey: 'sk-a',
    });
    await saveApiConfig({
      name: 'b',
      provider: 'GROK',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-imagine-image',
      apiKey: 'sk-b',
    });

    const list = await listApiConfigs();
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.name).sort()).toEqual(['a', 'b']);
  });

  it('删除后不再出现在列表中', async () => {
    const created = await saveApiConfig({
      name: 'to-delete',
      provider: 'GPT',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-image-2',
      apiKey: 'sk-x',
    });

    await deleteApiConfig(created.id);
    const list = await listApiConfigs();
    expect(list.find((c) => c.id === created.id)).toBeUndefined();
  });
});
