import { BadGatewayException } from '@nestjs/common';
import { OpenAiImageProvider } from './openai-image.provider';
import type { ReferenceImageInput } from './image-provider.types';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGgP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUC/wD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Af/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8BP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8C/wD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/Iaf/2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z';

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
    const payload = {
      data: [{ b64_json: PNG_BASE64, revised_prompt: '优化后的红色方块图片', size: '1024x1024' }],
    };
    mockJsonResponse(payload);

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
    expect(result.responseSummary).toEqual({
      source: 'openai.data.b64_json',
      revisedPrompts: ['优化后的红色方块图片'],
      actualParams: { size: '1024x1024' },
      rawResponse: payload,
    });
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

  it('uses plain image fields first when a single reference image is provided', async () => {
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
    expect(request.body.getAll('image')).toHaveLength(1);
    expect(request.body.getAll('image[]')).toHaveLength(0);
  });

  it('retries image edits with image array fields when a compatible gateway rejects plain image fields', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ error: { message: 'Unknown parameter: image', param: 'image' } })),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] })),
      }) as never;

    const provider = new OpenAiImageProvider();
    const result = await provider.generate(createInput([createPngReferenceImage()]));

    expect(result.mimeType).toBe('image/png');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const firstRequest = (global.fetch as jest.Mock).mock.calls[0][1] as { body: FormData };
    const secondRequest = (global.fetch as jest.Mock).mock.calls[1][1] as { body: FormData };
    expect(firstRequest.body.getAll('image')).toHaveLength(1);
    expect(firstRequest.body.getAll('image[]')).toHaveLength(0);
    expect(secondRequest.body.getAll('image')).toHaveLength(0);
    expect(secondRequest.body.getAll('image[]')).toHaveLength(1);
  });

  it('retries image edits with image array fields when the gateway only returns openai_error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'openai_error' })),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] })),
      }) as never;

    const provider = new OpenAiImageProvider();
    await provider.generate(createInput([createPngReferenceImage()]));

    const firstRequest = (global.fetch as jest.Mock).mock.calls[0][1] as { body: FormData };
    const secondRequest = (global.fetch as jest.Mock).mock.calls[1][1] as { body: FormData };
    expect(firstRequest.body.getAll('image')).toHaveLength(1);
    expect(secondRequest.body.getAll('image[]')).toHaveLength(1);
  });

  it('accepts responses-style image output from compatible GPT gateways', async () => {
    // 兼容 Responses API image_generation_call 的 result 字段，避免文生图成功后误报无图片。
    const payload = {
      output: [
        {
          type: 'image_generation_call',
          result: PNG_BASE64,
          revised_prompt: '兼容响应里的优化提示词',
          output_format: 'png',
        },
      ],
    };
    mockJsonResponse(payload);

    const provider = new OpenAiImageProvider();
    const result = await provider.generate(createInput());

    expect(result.mimeType).toBe('image/png');
    expect(result.responseSummary).toEqual({
      source: 'openai.output.result',
      revisedPrompts: ['兼容响应里的优化提示词'],
      actualParams: { output_format: 'png' },
      rawResponse: payload,
    });
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

  it('passes an abort signal to GPT image generation requests', async () => {
    mockJsonResponse({
      data: [{ b64_json: PNG_BASE64 }],
    });

    const provider = new OpenAiImageProvider();
    await provider.generate(createInput());

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.test/v1/images/generations',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('passes an abort signal when downloading image URLs from GPT responses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ url: 'https://cdn.openai.test/image.png' }] })),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: jest.fn().mockResolvedValue(Buffer.from(PNG_BASE64, 'base64')),
      }) as never;

    const provider = new OpenAiImageProvider();
    await provider.generate(createInput());

    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://cdn.openai.test/image.png', {
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects GPT image URLs that target private hosts', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ url: 'http://169.254.169.254/latest/meta-data' }] })),
    }) as never;

    const provider = new OpenAiImageProvider();

    await expect(provider.generate(createInput())).rejects.toThrow('Provider 地址不允许访问本地或内网地址');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects GPT image URLs that use unsupported protocols', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: jest.fn().mockResolvedValue(JSON.stringify({ data: [{ url: 'file:///etc/passwd' }] })),
    }) as never;

    const provider = new OpenAiImageProvider();

    await expect(provider.generate(createInput())).rejects.toThrow('Provider 图片地址协议不受支持');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses detected image bytes to choose mime type for base64 GPT responses', async () => {
    mockJsonResponse({
      data: [{ b64_json: JPEG_BASE64, output_format: 'png' }],
    });

    const provider = new OpenAiImageProvider();
    const result = await provider.generate(createInput());

    expect(result.mimeType).toBe('image/jpeg');
  });

  it('rejects raw image responses with unsupported image bytes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/svg+xml' }),
      arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('<svg></svg>')),
    }) as never;

    const provider = new OpenAiImageProvider();

    await expect(provider.generate(createInput())).rejects.toThrow('GPT 图片接口返回了不支持的图片格式');
  });
});
