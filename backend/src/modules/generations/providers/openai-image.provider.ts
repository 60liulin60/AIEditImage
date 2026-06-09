import { BadGatewayException, Injectable } from '@nestjs/common';
import type { ImageProviderInput, ImageProviderResult } from './image-provider.types';
import {
  createProviderAbortSignal,
  detectImageBytes,
  assertPublicProviderUrl,
  extractProviderMessage,
  joinApiUrl,
  normalizeProviderError,
} from './provider-utils';

interface ExtractedBase64Image {
  bytes: Buffer;
  mimeType: string;
  source: string;
}

interface OpenAiResponseSummary extends Record<string, unknown> {
  source: string;
  revisedPrompts?: string[];
  actualParams?: Record<string, unknown>;
  // rawResponse 保存 GPT 接口返回的完整 JSON，查看页依赖它展示 revised_prompt 等所有上游字段。
  rawResponse: unknown;
}

interface ParsedProviderResponse {
  payload: unknown;
  rawImage?: ImageProviderResult;
  contentType: string;
}

// GPT 图片接口默认保存 PNG；后续如果前端开放格式选择，只需要替换这个常量来源。
const DEFAULT_OUTPUT_FORMAT = 'png';

@Injectable()
export class OpenAiImageProvider {
  async generate(input: ImageProviderInput): Promise<ImageProviderResult> {
    const hasReferences = input.referenceImages.length > 0;
    const baseUrl = this.normalizeBaseUrl(input.baseUrl);
    const url = joinApiUrl(baseUrl, hasReferences ? '/images/edits' : '/images/generations');
    const response = await (hasReferences ? this.requestEdit(url, input) : this.requestGeneration(url, input)).catch((error) =>
      normalizeProviderError(error, 'GPT 图片接口调用失败'),
    );
    const parsedResponse = await this.parseProviderResponse(response);

    if (!response.ok) {
      throw new BadGatewayException(extractProviderMessage(parsedResponse.payload, 'GPT 图片接口调用失败'));
    }

    if (parsedResponse.rawImage) {
      return parsedResponse.rawImage;
    }

    if (!parsedResponse.payload) {
      throw new BadGatewayException(
        `GPT 图片接口返回了非 JSON 内容，请检查请求地址是否为 OpenAI 兼容 API 根地址；实际请求：${url}；Content-Type：${parsedResponse.contentType || '未知'}`,
      );
    }

    return this.extractImage(parsedResponse.payload);
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    try {
      const parsedUrl = new URL(trimmedBaseUrl);
      const isOfficialOpenAiHost = parsedUrl.hostname === 'api.openai.com';
      const hasVersionPath = /^\/v\d+(\/|$)/.test(parsedUrl.pathname);
      if (isOfficialOpenAiHost && !hasVersionPath) {
        // 用户常把官方域名填成 https://api.openai.com；这里补齐 Images API 必需的 /v1。
        parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/+$/, '')}/v1`;
        return parsedUrl.toString().replace(/\/+$/, '');
      }
    } catch {
      // DTO 已校验 URL；这里保守返回原值，避免在错误路径上掩盖真实配置。
    }

    return trimmedBaseUrl;
  }

  private requestGeneration(url: string, input: ImageProviderInput) {
    // 文生图按参考项目的 Images API 方式使用 JSON；GPT 图片模型默认返回 base64，不额外传 response_format。
    return fetch(url, {
      method: 'POST',
      signal: createProviderAbortSignal(),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size || '1024x1024',
        output_format: DEFAULT_OUTPUT_FORMAT,
      }),
    });
  }

  private requestEdit(url: string, input: ImageProviderInput) {
    const formData = new FormData();
    formData.append('model', input.model);
    formData.append('prompt', input.prompt);
    formData.append('size', input.size || '1024x1024');
    formData.append('output_format', DEFAULT_OUTPUT_FORMAT);

    for (const image of input.referenceImages) {
      const bytes = new Uint8Array(image.buffer);
      // 参考项目和官方示例都用 image[] 表达多参考图，避免兼容网关只识别数组字段。
      formData.append('image[]', new Blob([bytes], { type: image.mimeType }), image.filename);
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

  private async parseProviderResponse(response: Response): Promise<ParsedProviderResponse> {
    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.toLowerCase().startsWith('image/')) {
      // 少数兼容网关会直接返回图片二进制；成功时直接保存，失败响应仍按错误文本处理。
      return {
        payload: null,
        contentType,
        rawImage: this.createProviderImageResult(
          Buffer.from(await response.arrayBuffer()),
          {
            source: 'openai.raw_image',
            rawResponse: {
              contentType,
              note: '接口直接返回图片二进制，响应正文已作为图片文件保存',
            },
          },
          'GPT 图片接口返回了不支持的图片格式',
        ),
      };
    }

    const responseText = await response.text().catch(() => '');
    if (!responseText.trim()) {
      return { payload: null, contentType };
    }

    try {
      return { payload: JSON.parse(responseText), contentType };
    } catch {
      // 不把原始正文透出到错误里，避免 HTML 或大段文本污染日志。
      return { payload: null, contentType };
    }
  }

  private async extractImage(payload: unknown): Promise<ImageProviderResult> {
    if (!payload || typeof payload !== 'object') {
      throw new BadGatewayException(`GPT 响应中没有可保存的图片，返回字段：${this.describePayloadShape(payload)}`);
    }

    const record = payload as Record<string, unknown>;
    const data = Array.isArray(record?.data) ? (record.data[0] as Record<string, unknown> | undefined) : undefined;

    const base64Image = this.extractBase64Image(record);
    if (base64Image) {
      return {
        bytes: base64Image.bytes,
        mimeType: base64Image.mimeType,
        responseSummary: this.buildResponseSummary(record, base64Image.source),
      };
    }

    if (typeof data?.url === 'string') {
      assertPublicProviderUrl(data.url);
      const imageResponse = await fetch(data.url, { signal: createProviderAbortSignal() }).catch((error) =>
        normalizeProviderError(error, 'GPT 图片地址下载失败'),
      );
      if (!imageResponse.ok) {
        throw new BadGatewayException('GPT 图片地址下载失败');
      }
      return this.createProviderImageResult(
        Buffer.from(await imageResponse.arrayBuffer()),
        this.buildResponseSummary(record, 'openai.data.url'),
        'GPT 图片地址返回了不支持的图片格式',
      );
    }

    throw new BadGatewayException(`GPT 响应中没有可保存的图片，返回字段：${this.describePayloadShape(payload)}`);
  }

  private extractBase64Image(record: Record<string, unknown>): ExtractedBase64Image | null {
    const data = Array.isArray(record.data) ? (record.data[0] as Record<string, unknown> | undefined) : undefined;
    const imageFromData = this.decodeImageBase64(data?.b64_json, 'openai.data.b64_json');
    if (imageFromData) {
      return imageFromData;
    }

    // 部分 OpenAI 兼容网关会把 Responses API 的 image_generation_call 原样透传回来。
    const output = Array.isArray(record.output) ? record.output : [];
    for (const item of output) {
      const outputItem = item as Record<string, unknown>;
      const imageFromResult = this.decodeImageBase64(outputItem.result, 'openai.output.result');
      if (imageFromResult) {
        return imageFromResult;
      }
    }

    // 流式完成事件或兼容层可能直接返回 b64_json，而不是包在 data 数组里。
    return this.decodeImageBase64(record.b64_json, 'openai.b64_json');
  }

  private decodeImageBase64(value: unknown, source: string): ExtractedBase64Image | null {
    if (typeof value !== 'string') {
      return null;
    }

    // 兼容 data URL，同时继续支持纯 base64 字符串。
    const base64 = value.startsWith('data:') ? value.split(',')[1] : value;
    if (!base64) {
      return null;
    }

    const bytes = Buffer.from(base64, 'base64');
    const imageType = detectImageBytes(bytes);
    // 只接受真实图片字节，避免把上游返回的普通文本误存为损坏图片。
    if (!imageType) {
      return null;
    }

    return { bytes, mimeType: imageType.mimeType, source };
  }

  private createProviderImageResult(
    bytes: Buffer,
    responseSummary: OpenAiResponseSummary,
    unsupportedMessage: string,
  ): ImageProviderResult {
    const imageType = detectImageBytes(bytes);
    if (!imageType) {
      throw new BadGatewayException(unsupportedMessage);
    }
    return {
      bytes,
      mimeType: imageType.mimeType,
      responseSummary,
    };
  }

  private describePayloadShape(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      return typeof payload;
    }

    // 只暴露字段形状，不写入完整响应，避免日志或错误里带出大段 base64。
    const record = payload as Record<string, unknown>;
    const topLevelKeys = Object.keys(record).slice(0, 8).join(', ') || '无顶层字段';
    const dataKeys = Array.isArray(record.data) && record.data[0] && typeof record.data[0] === 'object'
      ? Object.keys(record.data[0] as Record<string, unknown>).slice(0, 8).join(', ')
      : '';
    return dataKeys ? `${topLevelKeys}; data[0]: ${dataKeys}` : topLevelKeys;
  }

  private buildResponseSummary(payload: Record<string, unknown>, source: string): OpenAiResponseSummary {
    // responseSummary 面向历史查看页，必须保留 GPT 返回的完整 JSON，避免 revised_prompt 等字段丢失。
    const revisedPrompts = this.extractRevisedPrompts(payload);
    const actualParams = this.extractActualParams(payload);
    return {
      source,
      ...(revisedPrompts.length > 0 ? { revisedPrompts } : {}),
      ...(Object.keys(actualParams).length > 0 ? { actualParams } : {}),
      rawResponse: payload,
    };
  }

  private extractRevisedPrompts(payload: Record<string, unknown>): string[] {
    // OpenAI Images API 使用 data[].revised_prompt，Responses 兼容返回常见于 output[].revised_prompt。
    return [...this.collectStringValues(payload.data, 'revised_prompt'), ...this.collectStringValues(payload.output, 'revised_prompt')];
  }

  private extractActualParams(payload: Record<string, unknown>): Record<string, unknown> {
    // 只汇总参考项目展示过的实际生效参数；完整字段仍在 rawResponse 中保留。
    const params: Record<string, unknown> = {};
    const supportedKeys = ['size', 'quality', 'output_format', 'output_compression', 'moderation', 'n'];
    const candidates = [
      payload,
      ...(Array.isArray(payload.data) ? payload.data : []),
      ...(Array.isArray(payload.output) ? payload.output : []),
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const record = candidate as Record<string, unknown>;
      for (const key of supportedKeys) {
        if (params[key] === undefined && record[key] !== undefined) {
          params[key] = record[key];
        }
      }
    }

    return params;
  }

  private collectStringValues(value: unknown, key: string): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      const record = item as Record<string, unknown> | undefined;
      const fieldValue = record?.[key];
      return typeof fieldValue === 'string' && fieldValue.trim() ? [fieldValue] : [];
    });
  }
}
