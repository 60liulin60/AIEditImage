import { BadGatewayException } from '@nestjs/common';
import { GrokImageProvider } from './grok-image.provider';
import type { ReferenceImageInput } from './image-provider.types';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('GrokImageProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockJsonResponse(payload: unknown, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      json: jest.fn().mockResolvedValue(payload),
    }) as never;
  }

  function createInput(referenceImages: ReferenceImageInput[] = []) {
    return {
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-imagine-image',
      apiKey: 'test-key',
      prompt: '生成一张红色方块图片',
      referenceImages,
    };
  }

  function createPngReferenceImage(): ReferenceImageInput {
    return {
      buffer: Buffer.from(PNG_BASE64, 'base64'),
      filename: 'reference.png',
      mimeType: 'image/png',
    };
  }

  it('generates an image without reference images through images generations', async () => {
    const payload = {
      data: [{ b64_json: PNG_BASE64 }],
    };
    mockJsonResponse(payload);

    const provider = new GrokImageProvider();
    const result = await provider.generate(createInput());

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"response_format":"b64_json"'),
      }),
    );
    expect(result.mimeType).toBe('image/png');
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.responseSummary).toEqual({
      source: 'grok.data.b64_json',
      rawResponse: { data: [{}] },
    });
  });

  it('adds v1 when the official xAI host is configured without a version path', async () => {
    mockJsonResponse({
      data: [{ b64_json: PNG_BASE64 }],
    });

    const provider = new GrokImageProvider();
    await provider.generate({
      ...createInput(),
      baseUrl: 'https://api.x.ai',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/images/generations',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('edits images with multipart image fields when references are provided', async () => {
    mockJsonResponse({
      data: [{ b64_json: PNG_BASE64 }],
    });

    const provider = new GrokImageProvider();
    await provider.generate(createInput([createPngReferenceImage(), createPngReferenceImage()]));

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as { body: FormData };
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/images/edits',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(request.body.get('model')).toBe('grok-imagine-image');
    expect(request.body.get('response_format')).toBe('b64_json');
    expect(request.body.getAll('image')).toHaveLength(2);
  });

  it('surfaces upstream error messages when generation fails', async () => {
    mockJsonResponse({ error: { message: 'invalid api key' } }, false);

    const provider = new GrokImageProvider();
    await expect(provider.generate(createInput())).rejects.toBeInstanceOf(BadGatewayException);
    await expect(provider.generate(createInput())).rejects.toThrow('invalid api key');
  });

  it('retries without response_format when upstream rejects the request as invalid', async () => {
    const pngPayload = { data: [{ b64_json: PNG_BASE64 }] };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: { message: '请求无效' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(pngPayload),
      }) as never;

    const provider = new GrokImageProvider();
    const result = await provider.generate(createInput());

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstBody = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    const secondBody = (global.fetch as jest.Mock).mock.calls[1][1].body as string;
    expect(firstBody).toContain('"response_format":"b64_json"');
    expect(secondBody).not.toContain('response_format');
    expect(result.mimeType).toBe('image/png');
  });
});
