import { BadGatewayException, Injectable } from '@nestjs/common';
import type { ImageProviderInput, ImageProviderResult } from './image-provider.types';
import {
  assertPublicProviderUrl,
  createProviderAbortSignal,
  detectImageBytes,
  extractProviderMessage,
  joinApiUrl,
  normalizeProviderError,
} from './provider-utils';

interface ExtractedBase64Image {
  bytes: Buffer;
  mimeType: string;
  source: string;
}

interface GrokResponseSummary extends Record<string, unknown> {
  source: string;
  // rawResponse 保存上游返回摘要（已剥离 base64），便于历史页排查。
  rawResponse: unknown;
}

// 优先请求 base64，避免再下载临时 URL；部分中转网关不认该字段时会自动回退。
const PREFERRED_RESPONSE_FORMAT = 'b64_json';

@Injectable()
export class GrokImageProvider {
  async generate(input: ImageProviderInput): Promise<ImageProviderResult> {
    const hasReferences = input.referenceImages.length > 0;
    const baseUrl = this.normalizeBaseUrl(input.baseUrl);
    const url = joinApiUrl(baseUrl, hasReferences ? '/images/edits' : '/images/generations');

    // 先按官方/兼容网关常见的 b64_json 请求；若被判定参数无效再回退到默认 URL 模式。
    const primaryResponse = await (hasReferences
      ? this.requestEdit(url, input, PREFERRED_RESPONSE_FORMAT)
      : this.requestGeneration(url, input, PREFERRED_RESPONSE_FORMAT)
    ).catch((error) => normalizeProviderError(error, 'Grok 图片接口调用失败'));

    const primaryPayload = await primaryResponse.json().catch(() => null);
    if (primaryResponse.ok) {
      return this.extractImage(primaryPayload);
    }

    const primaryMessage = extractProviderMessage(primaryPayload, 'Grok 图片接口调用失败');
    if (!this.shouldRetryWithoutResponseFormat(primaryMessage)) {
      throw new BadGatewayException(this.formatUpstreamError(primaryMessage, url, input.model));
    }

    const fallbackResponse = await (hasReferences
      ? this.requestEdit(url, input, undefined)
      : this.requestGeneration(url, input, undefined)
    ).catch((error) => normalizeProviderError(error, 'Grok 图片接口调用失败'));

    const fallbackPayload = await fallbackResponse.json().catch(() => null);
    if (!fallbackResponse.ok) {
      const fallbackMessage = extractProviderMessage(fallbackPayload, primaryMessage);
      throw new BadGatewayException(this.formatUpstreamError(fallbackMessage, url, input.model));
    }

    return this.extractImage(fallbackPayload);
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    try {
      const parsedUrl = new URL(trimmedBaseUrl);
      const isOfficialXaiHost = parsedUrl.hostname === 'api.x.ai';
      const hasVersionPath = /^\/v\d+(\/|$)/.test(parsedUrl.pathname);
      if (isOfficialXaiHost && !hasVersionPath) {
        // 用户常把官方域名填成 https://api.x.ai；这里补齐 Images API 必需的 /v1。
        parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/+$/, '')}/v1`;
        return parsedUrl.toString().replace(/\/+$/, '');
      }
    } catch {
      // DTO 已校验 URL；这里保守返回原值。
    }

    return trimmedBaseUrl;
  }

  private requestGeneration(url: string, input: ImageProviderInput, responseFormat?: string) {
    // 文生图：不传 size/output_format，避免官方或中转网关因未知字段失败。
    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: 1,
    };
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    return fetch(url, {
      method: 'POST',
      signal: createProviderAbortSignal(),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  private requestEdit(url: string, input: ImageProviderInput, responseFormat?: string) {
    // 图生图：按 xAI 约定重复 append image 字段上传参考图。
    const formData = new FormData();
    formData.append('model', input.model);
    formData.append('prompt', input.prompt);
    formData.append('n', '1');
    if (responseFormat) {
      formData.append('response_format', responseFormat);
    }

    for (const image of input.referenceImages) {
      const bytes = new Uint8Array(image.buffer);
      // 同一参考图按 xAI 约定重复使用 image 字段名。
      formData.append('image', new Blob([bytes], { type: image.mimeType }), image.filename || 'reference.png');
    }

    return fetch(url, {
      method: 'POST',
      signal: createProviderAbortSignal(),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: formData,
    });
  }

  private shouldRetryWithoutResponseFormat(message: string): boolean {
    // 中转网关常见“请求无效/未知参数”提示，优先归因到 response_format 后重试。
    const normalized = message.toLowerCase();
    return (
      message.includes('请求无效') ||
      message.includes('参数无效') ||
      message.includes('无效的请求') ||
      normalized.includes('invalid request') ||
      normalized.includes('invalid_request') ||
      normalized.includes('unknown parameter') ||
      normalized.includes('unexpected keyword') ||
      normalized.includes('response_format')
    );
  }

  private formatUpstreamError(message: string, url: string, model: string): string {
    // 附带实际请求地址与模型，方便用户对照配置页排查中转网关问题。
    return `${message}（模型：${model}；请求：${url}）`;
  }

  private async extractImage(payload: unknown): Promise<ImageProviderResult> {
    if (!payload || typeof payload !== 'object') {
      throw new BadGatewayException('Grok 响应中没有可保存的图片');
    }

    const record = payload as Record<string, unknown>;
    const data = Array.isArray(record.data) ? (record.data[0] as Record<string, unknown> | undefined) : undefined;

    const base64Image = this.extractBase64Image(record);
    if (base64Image) {
      return {
        bytes: base64Image.bytes,
        mimeType: base64Image.mimeType,
        responseSummary: this.buildResponseSummary(record, base64Image.source),
      };
    }

    if (typeof data?.url === 'string') {
      // 兼容只返回临时 URL 的中转网关；下载前校验不得指向内网。
      assertPublicProviderUrl(data.url);
      const imageResponse = await fetch(data.url, { signal: createProviderAbortSignal() }).catch((error) =>
        normalizeProviderError(error, 'Grok 图片地址下载失败'),
      );
      if (!imageResponse.ok) {
        throw new BadGatewayException('Grok 图片地址下载失败');
      }

      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      const imageType = detectImageBytes(bytes);
      if (!imageType) {
        throw new BadGatewayException('Grok 图片地址返回了不支持的图片格式');
      }

      return {
        bytes,
        mimeType: imageType.mimeType,
        responseSummary: this.buildResponseSummary(record, 'grok.data.url'),
      };
    }

    throw new BadGatewayException('Grok 响应中没有可保存的图片');
  }

  private extractBase64Image(record: Record<string, unknown>): ExtractedBase64Image | null {
    const data = Array.isArray(record.data) ? (record.data[0] as Record<string, unknown> | undefined) : undefined;
    return this.decodeImageBase64(data?.b64_json, 'grok.data.b64_json') ?? this.decodeImageBase64(record.b64_json, 'grok.b64_json');
  }

  private decodeImageBase64(value: unknown, source: string): ExtractedBase64Image | null {
    if (typeof value !== 'string') {
      return null;
    }

    const base64 = value.startsWith('data:') ? value.split(',')[1] : value;
    if (!base64) {
      return null;
    }

    const bytes = Buffer.from(base64, 'base64');
    const imageType = detectImageBytes(bytes);
    if (!imageType) {
      return null;
    }

    return { bytes, mimeType: imageType.mimeType, source };
  }

  private buildResponseSummary(payload: Record<string, unknown>, source: string): GrokResponseSummary {
    return {
      source,
      rawResponse: this.stripBase64FromPayload(payload),
    };
  }

  private stripBase64FromPayload(payload: Record<string, unknown>): Record<string, unknown> {
    // 剥离大体积 base64，避免写入 responseSummary 时撑爆数据库。
    const clone = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    if (Array.isArray(clone.data)) {
      clone.data = clone.data.map((item) => {
        if (item && typeof item === 'object') {
          const { b64_json: _b64, ...rest } = item as Record<string, unknown>;
          return rest;
        }
        return item;
      });
    }
    if ('b64_json' in clone) {
      delete clone.b64_json;
    }
    return clone;
  }
}
