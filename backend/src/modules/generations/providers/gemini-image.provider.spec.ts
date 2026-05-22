import { GeminiImageProvider } from './gemini-image.provider';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('GeminiImageProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('passes an abort signal to Nano Banana generation requests', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: PNG_BASE64,
                  },
                },
              ],
            },
          },
        ],
      }),
    }) as never;

    const provider = new GeminiImageProvider();
    await provider.generate({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash-image',
      apiKey: 'test-key',
      prompt: '生成一张图片',
      size: '1024x1024',
      referenceImages: [],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=test-key',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('rejects Nano Banana inline data that is not a supported image', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from('not an image').toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      }),
    }) as never;

    const provider = new GeminiImageProvider();

    await expect(
      provider.generate({
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-2.5-flash-image',
        apiKey: 'test-key',
        prompt: '生成一张图片',
        size: '1024x1024',
        referenceImages: [],
      }),
    ).rejects.toThrow('Nano Banana 响应中没有可保存的图片');
  });
});
