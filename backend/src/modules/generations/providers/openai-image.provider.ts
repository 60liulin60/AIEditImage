import { BadGatewayException, Injectable } from '@nestjs/common';
import type { ImageProviderInput, ImageProviderResult } from './image-provider.types';
import { extractProviderMessage, joinApiUrl } from './provider-utils';

interface ExtractedBase64Image {
  bytes: Buffer;
  source: string;
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
    const response = hasReferences ? await this.requestEdit(url, input) : await this.requestGeneration(url, input);
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
        rawImage: {
          bytes: Buffer.from(await response.arrayBuffer()),
          mimeType: contentType,
          responseSummary: { source: 'openai.raw_image' },
        },
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
        mimeType: this.resolveMimeType(record, data),
        responseSummary: { source: base64Image.source },
      };
    }

    if (typeof data?.url === 'string') {
      const imageResponse = await fetch(data.url);
      if (!imageResponse.ok) {
        throw new BadGatewayException('GPT 图片地址下载失败');
      }
      const mimeType = imageResponse.headers.get('content-type') ?? 'image/png';
      return {
        bytes: Buffer.from(await imageResponse.arrayBuffer()),
        mimeType,
        responseSummary: { source: 'openai.data.url' },
      };
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
    // 只接受真实图片字节，避免把上游返回的普通文本误存为损坏图片。
    if (!this.isSupportedImageBytes(bytes)) {
      return null;
    }

    return { bytes, source };
  }

  private isSupportedImageBytes(bytes: Buffer): boolean {
    // 魔数校验覆盖当前落盘支持的 PNG、JPG、WEBP 三类图片格式。
    return (
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
      (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
    );
  }

  private resolveMimeType(record: Record<string, unknown>, data: Record<string, unknown> | undefined): string {
    const outputFormat = typeof data?.output_format === 'string' ? data.output_format : record.output_format;
    // output_format 可能来自 GPT 图片接口，决定文件扩展名和浏览器展示类型。
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };
    return typeof outputFormat === 'string' ? (mimeTypes[outputFormat] ?? 'image/png') : 'image/png';
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
}
