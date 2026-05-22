import { BadGatewayException } from '@nestjs/common';
import { OpenAiImageProvider } from './openai-image.provider';
import type { ReferenceImageInput } from './image-provider.types';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('OpenAiImageProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockJsonResponse(payload: unknown, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
    }) as never;
  }

  function createInput(referenceImages: ReferenceImageInput[] = []) {
    return {
      baseUrl: 'https://api.openai.test/v1',
      model: 'gpt-image-2',
      apiKey: 'test-key',
      prompt: '生成一张红色方块图片',
      size: '1024x1024',
      referenceImages,
    };
  }

  function createInputWithBaseUrl(baseUrl: string) {
    return {
      ...createInput(),
      baseUrl,
    };
  }

  function createPngReferenceImage() {
    return {
      buffer: Buffer.from(PNG_BASE64, 'base64'),
      filename: 'reference.png',
      mimeType: 'image/png',
    };
  }

  it('generates an image without reference images through images generations', async () => {
    mockJsonResponse({
      data: [{ b64_json: PNG_BASE64 }],
    });

    const provider = new OpenAiImageProvider();
    const result = await provider.generate(createInput());

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.test/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"output_format":"png"'),
      }),
    );
    expect(result.mimeType).toBe('image/png');
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.responseSummary).toEqual({ source: 'openai.data.b64_json' });
  });

  it('adds v1 when the official OpenAI API host is configured without a version path', async () => {
    mockJsonResponse({
      data: [{ b64_json: PNG_BASE64 }],
    });

    const provider = new OpenAiImageProvider();
    await provider.generate(createInputWithBaseUrl('https://api.openai.com'));

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses image edits with image array fields when reference images are provided', async () => {
    mockJsonResponse({
      data: [{ b64_json: PNG_BASE64 }],
    });

    const provider = new OpenAiImageProvider();
    await provider.generate(createInput([createPngReferenceImage()]));

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as { body: FormData };
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.test/v1/images/edits',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(request.body.get('model')).toBe('gpt-image-2');
    expect(request.body.get('output_format')).toBe('png');
    expect(request.body.getAll('image[]')).toHaveLength(1);
  });

  it('accepts responses-style image output from compatible GPT gateways', async () => {
    // 兼容 Responses API image_generation_call 的 result 字段，避免文生图成功后误报无图片。
    mockJsonResponse({
      output: [
        {
          type: 'image_generation_call',
          result: PNG_BASE64,
        },
      ],
    });

    const provider = new OpenAiImageProvider();
    const result = await provider.generate(createInput());

    expect(result.mimeType).toBe('image/png');
    expect(result.responseSummary).toEqual({ source: 'openai.output.result' });
  });

  it('describes the response shape when no image can be extracted', async () => {
    mockJsonResponse({
      data: [{ revised_prompt: 'only text' }],
    });

    const provider = new OpenAiImageProvider();

    await expect(provider.generate(createInput())).rejects.toThrow(BadGatewayException);
    await expect(provider.generate(createInput())).rejects.toThrow('data[0]: revised_prompt');
  });

  it('returns a clear error instead of reading data from a null payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: jest.fn().mockResolvedValue('<html>not json</html>'),
    }) as never;

    const provider = new OpenAiImageProvider();

    await expect(provider.generate(createInput())).rejects.toThrow('实际请求：https://api.openai.test/v1/images/generations');
  });
});
