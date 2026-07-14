import type { ApiConfig, Provider } from '../types';

// IndexedDB 数据库名称固定，方便后续版本升级时只迁移同一命名空间。
const DB_NAME = 'aieditimage';
// 数据库版本变更会触发 onupgradeneeded，新增对象仓库需同步提升版本。
const DB_VERSION = 1;
// API 配置单独存放在一个对象仓库，keyPath 使用配置自身 id。
const STORE_NAME = 'apiConfigs';
// 浏览器本地 AES-GCM 密钥保存为 JWK，仅用于解密当前浏览器中的 API Key。
const KEY_NAME = 'aieditimage-browser-key';

// 保存配置时的草稿结构；编辑场景允许 apiKey 为空以沿用旧密文。
interface ApiConfigDraft {
  id?: string;
  name: string;
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // 打开数据库是异步事件模型，统一包成 Promise 便于页面逻辑 await。
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // 首次使用时创建配置仓库，后续升级不能重复创建同名仓库。
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCryptoKey() {
  const existingKey = localStorage.getItem(KEY_NAME);
  if (existingKey) {
    // 已生成的本机密钥可导入复用，保证刷新后仍能解密旧配置。
    return crypto.subtle.importKey('jwk', JSON.parse(existingKey), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  // 本机自动生成密钥，满足刷新后免输入口令的使用体验。
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exportedKey = await crypto.subtle.exportKey('jwk', key);
  localStorage.setItem(KEY_NAME, JSON.stringify(exportedKey));
  return key;
}

function bytesToBase64(bytes: Uint8Array) {
  // IndexedDB 存字符串更稳定，二进制密文统一转成 Base64。
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  // 解密前把 Base64 还原成 Web Crypto 需要的 Uint8Array。
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptApiKey(apiKey: string) {
  const key = await getCryptoKey();
  // AES-GCM 每次加密都需要随机 IV，重复 IV 会降低密文安全性。
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(apiKey);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    encryptedKey: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptApiKey(config: ApiConfig) {
  const key = await getCryptoKey();
  // 解密时必须使用保存时的 IV，否则浏览器会抛出认证失败错误。
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(config.iv) },
    key,
    base64ToBytes(config.encryptedKey),
  );
  return new TextDecoder().decode(decrypted);
}

export async function listApiConfigs(): Promise<ApiConfig[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    // 配置数量较小，直接 getAll 简化页面加载逻辑。
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as ApiConfig[]);
    request.onerror = () => reject(request.error);
  });
}

async function getApiConfig(id: string): Promise<ApiConfig | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    // 编辑保存前读取旧配置，用于沿用原有加密 Key 和创建时间。
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as ApiConfig | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveApiConfig(draft: ApiConfigDraft) {
  const db = await openDatabase();
  const now = new Date().toISOString();
  // 编辑时允许 API Key 留空，用已有密文避免把空字符串写成新密钥。
  const existingConfig = draft.id ? await getApiConfig(draft.id) : undefined;

  // 新增配置必须提供 API Key；编辑配置可留空沿用旧 Key。
  if (!draft.id && !draft.apiKey) {
    throw new Error('API Key 不能为空');
  }
  if (draft.id && !existingConfig) {
    throw new Error('原始配置不存在，请重新新增 API 配置');
  }

  // 只有用户输入新 Key 时才重新加密，降低误操作覆盖原 Key 的风险。
  const encrypted = draft.apiKey
    ? await encryptApiKey(draft.apiKey)
    : { encryptedKey: existingConfig!.encryptedKey, iv: existingConfig!.iv };
  const config: ApiConfig = {
    id: draft.id ?? crypto.randomUUID(),
    name: draft.name,
    provider: draft.provider,
    baseUrl: draft.baseUrl,
    model: draft.model,
    encryptedKey: encrypted.encryptedKey,
    iv: encrypted.iv,
    createdAt: existingConfig?.createdAt ?? now,
    updatedAt: now,
  };

  return new Promise<ApiConfig>((resolve, reject) => {
    // put 同时覆盖新增和编辑场景，返回值使用前端组装好的完整配置。
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(config);
    request.onsuccess = () => resolve(config);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteApiConfig(id: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    // 删除只移除本地配置和密文，不影响后端已生成的图片记录。
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
