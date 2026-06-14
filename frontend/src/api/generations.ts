import { http } from './http';
import type { GenerationStatus, ImageGeneration, PaginatedGenerations, Provider } from '../types';

// 创建生成任务的表单数据，API Key 仅随本次请求发送，不写入后端配置表。
export interface CreateGenerationPayload {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
  prompt: string;
  size?: string;
  referenceImages: File[];
}

export async function createGeneration(payload: CreateGenerationPayload) {
  // 图片文件必须使用 multipart/form-data，普通 JSON 无法承载 File 对象。
  const formData = new FormData();
  formData.append('provider', payload.provider);
  formData.append('baseUrl', payload.baseUrl);
  formData.append('model', payload.model);
  formData.append('apiKey', payload.apiKey);
  formData.append('prompt', payload.prompt);
  if (payload.size) {
    formData.append('size', payload.size);
  }
  for (const file of payload.referenceImages) {
    // 字段名与后端 FilesInterceptor 保持一致，支持多参考图。
    formData.append('referenceImages', file);
  }

  const { data } = await http.post<ImageGeneration>('/generations', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function fetchGeneration(id: string) {
  // 轮询单条记录获取异步生成状态，成功后再拼接图片文件地址。
  const { data } = await http.get<ImageGeneration>(`/generations/${id}`);
  return data;
}

export async function fetchGenerations(params: {
  page: number;
  pageSize: number;
  provider?: Provider | '';
  status?: GenerationStatus | '';
}) {
  // 只把有效筛选条件传给后端，分页字段始终显式传递。
  const requestParams = {
    page: params.page,
    pageSize: params.pageSize,
    // 空字符串表示“全部”，不发送给后端，避免触发枚举校验。
    ...(params.provider ? { provider: params.provider } : {}),
    // 空字符串表示“全部”，不发送给后端，避免触发枚举校验。
    ...(params.status ? { status: params.status } : {}),
  };
  const { data } = await http.get<PaginatedGenerations>('/generations', { params: requestParams });
  return data;
}

export async function deleteGeneration(id: string) {
  await http.delete(`/generations/${id}`);
}

export function getGenerationImageUrl(id: string, cacheBuster?: number | string) {
  // 默认返回稳定地址，组件需要刷新图片缓存时再传入单次生成的 cacheBuster。
  const query = cacheBuster === undefined ? '' : `?t=${encodeURIComponent(String(cacheBuster))}`;
  return `/api/generations/${encodeURIComponent(id)}/file${query}`;
}
