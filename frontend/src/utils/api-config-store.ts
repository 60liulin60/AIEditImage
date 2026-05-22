import type { ApiConfig, Provider } from '../types';

const DB_NAME = 'aieditimage';
const DB_VERSION = 1;
const STORE_NAME = 'apiConfigs';
const KEY_NAME = 'aieditimage-browser-key';

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
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
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
    return crypto.subtle.importKey('jwk', JSON.parse(existingKey), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  // 本机自动生成密钥，满足刷新后免输入口令的使用体验。
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exportedKey = await crypto.subtle.exportKey('jwk', key);
  localStorage.setItem(KEY_NAME, JSON.stringify(exportedKey));
  return key;
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptApiKey(apiKey: string) {
  const key = await getCryptoKey();
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
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as ApiConfig[]);
    request.onerror = () => reject(request.error);
  });
}

async function getApiConfig(id: string): Promise<ApiConfig | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
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
  if (!draft.apiKey && !existingConfig) {
    throw new Error('API Key 不能为空');
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
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(config);
    request.onsuccess = () => resolve(config);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteApiConfig(id: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
