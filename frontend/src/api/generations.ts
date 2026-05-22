import { http } from './http';
import type { GenerationStatus, ImageGeneration, PaginatedGenerations, Provider } from '../types';

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
  const { data } = await http.get<ImageGeneration>(`/generations/${id}`);
  return data;
}

export async function fetchGenerations(params: {
  page: number;
  pageSize: number;
  provider?: Provider | '';
  status?: GenerationStatus | '';
}) {
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

export function getGenerationImageUrl(id: string) {
  // 加时间戳可在列表刷新后避开浏览器缓存旧图。
  return `/api/generations/${id}/file?t=${Date.now()}`;
}
