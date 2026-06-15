import { GenerationStatus, Provider } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types';
import { GENERATION_MAX_CONCURRENCY, GENERATION_TASK_TIMEOUT_MS, GENERATION_STALE_PENDING_MS } from './constants';
import { GenerationsService } from './generations.service';

describe('GenerationsService', () => {
  const user: AuthenticatedUser = {
    id: 'user-id',
    email: 'user@example.com',
    role: 'USER',
  };

  const dto = {
    provider: Provider.GPT,
    baseUrl: 'https://api.openai.test/v1',
    model: 'gpt-image-2',
    apiKey: 'test-key',
    prompt: '生成一张图片',
    size: '1024x1024',
  };

  function createPendingRecord(id: string) {
    return {
      id,
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
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    return { promise, resolve, reject };
  }

  async function flushPromises() {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  function createService() {
    let nextRecordIndex = 0;
    const pendingRecord = createPendingRecord('generation-id');
    const createdRecords: ReturnType<typeof createPendingRecord>[] = [];
    const prisma = {
      imageGeneration: {
        create: jest.fn().mockImplementation(async () => {
          const record = nextRecordIndex === 0 ? pendingRecord : createPendingRecord(`generation-id-${nextRecordIndex}`);
          nextRecordIndex += 1;
          createdRecords.push(record);
          return record;
        }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: pendingRecord.id, status: GenerationStatus.PENDING }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
      // Prisma 事务接收已创建的查询 Promise；测试中直接并发 resolve 即可覆盖调用参数。
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
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
      createdRecords,
    };
  }

  it('returns the pending database record before provider generation finishes', async () => {
    const { service, prisma, pendingRecord } = createService();

    const result = await service.create(user, dto, []);

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

  it('limits active provider calls to the configured generation concurrency', async () => {
    const { service, openAiProvider } = createService();

    await Promise.all(
      Array.from({ length: GENERATION_MAX_CONCURRENCY + 2 }, () => service.create(user, dto, [])),
    );

    expect(openAiProvider.generate).toHaveBeenCalledTimes(GENERATION_MAX_CONCURRENCY);
  });

  it('starts queued generation tasks in FIFO order after an active task finishes', async () => {
    const { service, openAiProvider, prisma } = createService();
    const deferredTasks = Array.from({ length: GENERATION_MAX_CONCURRENCY + 1 }, () =>
      createDeferred<{ bytes: Buffer; mimeType: string; responseSummary: Record<string, never> }>(),
    );
    let generateIndex = 0;
    openAiProvider.generate.mockImplementation(() => {
      const task = deferredTasks[generateIndex];
      generateIndex += 1;
      return task.promise;
    });
    prisma.imageGeneration.findUnique.mockResolvedValue(null);

    await Promise.all(
      Array.from({ length: GENERATION_MAX_CONCURRENCY + 1 }, () => service.create(user, dto, [])),
    );
    expect(openAiProvider.generate).toHaveBeenCalledTimes(GENERATION_MAX_CONCURRENCY);

    deferredTasks[0].resolve({ bytes: Buffer.from('image'), mimeType: 'image/png', responseSummary: {} });
    await flushPromises();

    expect(openAiProvider.generate).toHaveBeenCalledTimes(GENERATION_MAX_CONCURRENCY + 1);
  });

  it('releases generation slots after provider failures so queued tasks continue', async () => {
    const { service, openAiProvider } = createService();
    const deferredTasks = Array.from({ length: GENERATION_MAX_CONCURRENCY + 1 }, () =>
      createDeferred<{ bytes: Buffer; mimeType: string; responseSummary: Record<string, never> }>(),
    );
    let generateIndex = 0;
    openAiProvider.generate.mockImplementation(() => {
      const task = deferredTasks[generateIndex];
      generateIndex += 1;
      return task.promise;
    });

    await Promise.all(
      Array.from({ length: GENERATION_MAX_CONCURRENCY + 1 }, () => service.create(user, dto, [])),
    );
    expect(openAiProvider.generate).toHaveBeenCalledTimes(GENERATION_MAX_CONCURRENCY);

    deferredTasks[0].reject(new Error('provider failed'));
    await flushPromises();

    expect(openAiProvider.generate).toHaveBeenCalledTimes(GENERATION_MAX_CONCURRENCY + 1);
  });

  it('marks timed out generation tasks as failed', async () => {
    jest.useFakeTimers();
    const { service, prisma } = createService();

    await service.create(user, dto, []);
    await jest.advanceTimersByTimeAsync(GENERATION_TASK_TIMEOUT_MS);

    expect(prisma.imageGeneration.update).toHaveBeenCalledWith({
      where: { id: 'generation-id' },
      data: expect.objectContaining({
        status: GenerationStatus.FAILED,
        errorMessage: '图片生成任务超时',
      }),
    });

    jest.useRealTimers();
  });

  it('marks stale pending generations as failed on module init', async () => {
    const { service, prisma } = createService();
    prisma.imageGeneration.updateMany.mockResolvedValue({ count: 3 });
    const beforeCleanup = Date.now() - GENERATION_STALE_PENDING_MS;

    await service.onModuleInit();

    expect(prisma.imageGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        status: GenerationStatus.PENDING,
        updatedAt: { lt: expect.any(Date) },
      },
      data: {
        status: GenerationStatus.FAILED,
        errorMessage: '服务重启后生成任务已过期，请重新提交',
      },
    });
    const staleCutoff = prisma.imageGeneration.updateMany.mock.calls[0][0].where.updatedAt.lt;
    expect(staleCutoff.getTime()).toBeLessThanOrEqual(beforeCleanup);
  });

  it('loads list page records with the configured filters and pagination', async () => {
    const { service, prisma } = createService();
    const firstRecord = createPendingRecord('first-generation-id');
    const secondRecord = createPendingRecord('second-generation-id');
    prisma.imageGeneration.findMany
      .mockResolvedValueOnce([firstRecord, secondRecord]);
    prisma.imageGeneration.count.mockResolvedValue(2);

    const result = await service.list(user, { page: 1, pageSize: 12, provider: Provider.GPT, status: GenerationStatus.PENDING });

    expect(result.items).toEqual([firstRecord, secondRecord]);
    expect(result.total).toBe(2);
    expect(prisma.imageGeneration.findMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        provider: Provider.GPT,
        status: GenerationStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 12,
      select: {
        id: true,
        userId: true,
        provider: true,
        model: true,
        baseUrl: true,
        prompt: true,
        size: true,
        referenceCount: true,
        status: true,
        imagePath: true,
        mimeType: true,
        durationMs: true,
        errorMessage: true,
        createdAt: true,
      },
    });
    expect(prisma.imageGeneration.count).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        provider: Provider.GPT,
        status: GenerationStatus.PENDING,
      },
    });
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
    const invalidDto = {
      provider: Provider.GPT,
      baseUrl: 'http://169.254.169.254/latest/meta-data',
      model: 'gpt-image-2',
      apiKey: 'test-key',
      prompt: '生成一张图片',
      size: '1024x1024',
    };

    await expect(service.create(user, invalidDto, [])).rejects.toThrow('Provider 地址不允许访问本地或内网地址');
    await expect(service.create(user, { ...invalidDto, baseUrl: 'http://[::1]:8080/v1' }, [])).rejects.toThrow(
      'Provider 地址不允许访问本地或内网地址',
    );

    expect(prisma.imageGeneration.create).not.toHaveBeenCalled();
  });

  it('rejects reference images when mime type does not match image bytes', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(
        user,
        dto,
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
