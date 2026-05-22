/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 生成结果轮询间隔，单位毫秒；未配置或配置非法时使用 5000。
  readonly VITE_GENERATION_POLL_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
