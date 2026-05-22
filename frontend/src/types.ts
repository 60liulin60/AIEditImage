// 前后端共享的图片服务类型，新增 provider 时需同步后端枚举。
export type Provider = 'GPT' | 'NANO_BANANA';
// 权限角色与后端守卫保持一致，前端只用于展示和路由拦截。
export type UserRole = 'ADMIN' | 'USER';
// 生成状态覆盖异步任务的三个终态/中间态。
export type GenerationStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

// 当前登录用户和管理员列表共用的用户结构。
export interface User {
  id: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// 保存在浏览器 IndexedDB 的 API 配置，API Key 只保存密文和 IV。
export interface ApiConfig {
  id: string;
  name: string;
  provider: Provider;
  baseUrl: string;
  model: string;
  encryptedKey: string;
  iv: string;
  createdAt: string;
  updatedAt: string;
}

// 后端生成记录，图片二进制通过单独文件接口按 id 读取。
export interface ImageGeneration {
  id: string;
  provider: Provider;
  model: string;
  baseUrl: string;
  prompt: string;
  size?: string | null;
  referenceCount: number;
  status: GenerationStatus;
  imagePath?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  createdAt: string;
}

// 图片列表接口的分页响应，page/pageSize 使用后端实际返回值。
export interface PaginatedGenerations {
  items: ImageGeneration[];
  total: number;
  page: number;
  pageSize: number;
}
