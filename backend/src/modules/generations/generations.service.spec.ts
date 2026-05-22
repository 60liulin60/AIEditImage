import { GenerationStatus, Provider } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types';
import { GenerationsService } from './generations.service';

describe('GenerationsService', () => {
  const user: AuthenticatedUser = {
    id: 'user-id',
    email: 'user@example.com',
    role: 'USER',
  };

  function createService() {
    const pendingRecord = {
      id: 'generation-id',
      userId: user.id,
      provider: Provider.GPT,
      model: 'gpt-image-2',
      baseUrl: 'https://api.openai.test/v1',
      prompt: '生成一张图片',
      size: '1024x1024',
      referenceCount: 0,
      status: GenerationStatus.PENDING,
      imagePath: null,
      mimeType: null,
      durationMs: null,
      errorMessage: null,
      requestParams: null,
      responseSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      imageGeneration: {
        create: jest.fn().mockResolvedValue(pendingRecord),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: pendingRecord.id }),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const openAiProvider = {
      // 默认挂起后台 provider，确保测试只验证 create 的同步返回边界。
      generate: jest.fn(() => new Promise(() => undefined)),
    };
    const geminiProvider = {
      generate: jest.fn(),
    };

    return {
      service: new GenerationsService(prisma as never, openAiProvider as never, geminiProvider as never),
      prisma,
      openAiProvider,
      pendingRecord,
    };
  }

  it('returns the pending database record before provider generation finishes', async () => {
    const { service, prisma, openAiProvider, pendingRecord } = createService();

    const result = await service.create(
      user,
      {
        provider: Provider.GPT,
        baseUrl: 'https://api.openai.test/v1',
        model: 'gpt-image-2',
        apiKey: 'test-key',
        prompt: '生成一张图片',
        size: '1024x1024',
      },
      [],
    );

    expect(result).toBe(pendingRecord);
    expect(prisma.imageGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
          status: GenerationStatus.PENDING,
        }),
      }),
    );
    expect(result.status).toBe(GenerationStatus.PENDING);
    expect(prisma.imageGeneration.update).not.toHaveBeenCalled();
  });

  it('deletes only records owned by the current user', async () => {
    const { service, prisma } = createService();
    prisma.imageGeneration.findFirst.mockResolvedValue({
      id: 'generation-id',
      imagePath: null,
    });

    await expect(service.remove(user, 'generation-id')).resolves.toEqual({ ok: true });

    expect(prisma.imageGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'generation-id', userId: user.id },
      select: { id: true, imagePath: true },
    });
    expect(prisma.imageGeneration.delete).toHaveBeenCalledWith({ where: { id: 'generation-id' } });
  });

  it('rejects provider base URLs that target loopback hosts', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(
        user,
        {
          provider: Provider.GPT,
          baseUrl: 'http://127.0.0.1:8080/v1',
          model: 'gpt-image-2',
          apiKey: 'test-key',
          prompt: '生成一张图片',
          size: '1024x1024',
        },
        [],
      ),
    ).rejects.toThrow('Provider 地址不允许访问本地或内网地址');

    expect(prisma.imageGeneration.create).not.toHaveBeenCalled();
  });

  it('rejects provider base URLs that target metadata or IPv6 loopback hosts', async () => {
    const { service, prisma } = createService();
    const dto = {
      provider: Provider.GPT,
      baseUrl: 'http://169.254.169.254/latest/meta-data',
      model: 'gpt-image-2',
      apiKey: 'test-key',
      prompt: '生成一张图片',
      size: '1024x1024',
    };

    await expect(service.create(user, dto, [])).rejects.toThrow('Provider 地址不允许访问本地或内网地址');
    await expect(service.create(user, { ...dto, baseUrl: 'http://[::1]:8080/v1' }, [])).rejects.toThrow(
      'Provider 地址不允许访问本地或内网地址',
    );

    expect(prisma.imageGeneration.create).not.toHaveBeenCalled();
  });

  it('rejects reference images when mime type does not match image bytes', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(
        user,
        {
          provider: Provider.GPT,
          baseUrl: 'https://api.openai.test/v1',
          model: 'gpt-image-2',
          apiKey: 'test-key',
          prompt: '生成一张图片',
          size: '1024x1024',
        },
        [
          {
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
            originalname: 'fake.jpg',
            mimetype: 'image/jpeg',
          } as Express.Multer.File,
        ],
      ),
    ).rejects.toThrow('参考图文件内容与图片格式不匹配');

    expect(prisma.imageGeneration.create).not.toHaveBeenCalled();
  });

  it('returns not found when generated image file is missing before streaming', async () => {
    const { service, prisma } = createService();
    prisma.imageGeneration.findFirst.mockResolvedValue({
      id: 'generation-id',
      imagePath: 'missing.png',
      mimeType: 'image/png',
    });

    await expect(service.getImageStream(user, 'generation-id')).rejects.toThrow('图片文件不存在');
  });
});
