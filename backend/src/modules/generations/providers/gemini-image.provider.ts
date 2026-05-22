import { BadGatewayException, Injectable } from '@nestjs/common';
import type { ImageProviderInput, ImageProviderResult } from './image-provider.types';
import {
  createProviderAbortSignal,
  detectImageBytes,
  extractProviderMessage,
  joinApiUrl,
  normalizeProviderError,
} from './provider-utils';

@Injectable()
export class GeminiImageProvider {
  async generate(input: ImageProviderInput): Promise<ImageProviderResult> {
    const url = `${joinApiUrl(input.baseUrl, `/models/${input.model}:generateContent`)}?key=${encodeURIComponent(input.apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: createProviderAbortSignal(),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: input.prompt },
              ...input.referenceImages.map((image) => ({
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.buffer.toString('base64'),
                },
              })),
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
        },
      }),
    }).catch((error) => normalizeProviderError(error, 'Nano Banana 图片接口调用失败'));

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new BadGatewayException(extractProviderMessage(payload, 'Nano Banana 图片接口调用失败'));
    }

    return this.extractImage(payload);
  }

  private extractImage(payload: unknown): ImageProviderResult {
    const record = payload as Record<string, unknown>;
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];

    for (const candidate of candidates) {
      const content = (candidate as Record<string, unknown>).content as Record<string, unknown> | undefined;
      const parts = Array.isArray(content?.parts) ? content.parts : [];
      for (const part of parts) {
        const partRecord = part as Record<string, unknown>;
        const inlineData = (partRecord.inlineData ?? partRecord.inline_data) as Record<string, unknown> | undefined;
        if (typeof inlineData?.data === 'string') {
          const bytes = Buffer.from(inlineData.data, 'base64');
          const imageType = detectImageBytes(bytes);
          if (!imageType) {
            continue;
          }
          return {
            bytes,
            mimeType: imageType.mimeType,
            responseSummary: { source: 'gemini.inlineData' },
          };
        }
      }
    }

    throw new BadGatewayException('Nano Banana 响应中没有可保存的图片');
  }
}
