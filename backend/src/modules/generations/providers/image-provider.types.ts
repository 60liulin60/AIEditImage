export interface ReferenceImageInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface ImageProviderInput {
  baseUrl: string;
  model: string;
  apiKey: string;
  prompt: string;
  size?: string;
  referenceImages: ReferenceImageInput[];
}

export interface ImageProviderResult {
  bytes: Buffer;
  mimeType: string;
  responseSummary: Record<string, unknown>;
}
