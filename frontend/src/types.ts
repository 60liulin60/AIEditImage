export type Provider = 'GPT' | 'NANO_BANANA';
export type UserRole = 'ADMIN' | 'USER';
export type GenerationStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

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

export interface PaginatedGenerations {
  items: ImageGeneration[];
  total: number;
  page: number;
  pageSize: number;
}
