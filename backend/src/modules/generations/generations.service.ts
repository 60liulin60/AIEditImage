import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { GenerationStatus, Prisma, Provider } from '@prisma/client';
import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  GENERATION_MAX_CONCURRENCY,
  GENERATION_STALE_PENDING_MS,
  GENERATION_TASK_TIMEOUT_MS,
  GPT_MAX_REFERENCE_IMAGES,
  NANO_BANANA_MAX_REFERENCE_IMAGES,
} from './constants';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { ListGenerationsDto } from './dto/list-generations.dto';
import { GeminiImageProvider } from './providers/gemini-image.provider';
import type { ReferenceImageInput } from './providers/image-provider.types';
import { OpenAiImageProvider } from './providers/openai-image.provider';
import { getImageExtension, detectImageBytes, isPrivateProviderHost, PRIVATE_PROVIDER_HOST_ERROR } from './providers/provider-utils';

interface QueuedGenerationTask {
  recordId: string;
  dto: CreateGenerationDto;
  referenceImages: ReferenceImageInput[];
  startedAt: number;
}

@Injectable()
export class GenerationsService implements OnModuleInit {
  private readonly logger = new Logger(GenerationsService.name);

  // 图片存储根目录固定在 backend/uploads/generated，数据库只保存相对文件名。
  private readonly uploadDir = resolve(process.cwd(), 'uploads', 'generated');

  private activeGenerationCount = 0;

  private readonly generationQueue: QueuedGenerationTask[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiProvider: OpenAiImageProvider,
    private readonly geminiProvider: GeminiImageProvider,
  ) {}

  async onModuleInit() {
    const staleCutoff = new Date(Date.now() - GENERATION_STALE_PENDING_MS);
    const result = await this.prisma.imageGeneration.updateMany({
      where: {
        status: GenerationStatus.PENDING,
        updatedAt: { lt: staleCutoff },
      },
      data: {
        status: GenerationStatus.FAILED,
        errorMessage: '服务重启后生成任务已过期，请重新提交',
      },
    });

    if (result.count > 0) {
      this.logger.warn(`已将 ${result.count} 个陈旧生成任务标记为失败`);
    }
  }

  async create(user: AuthenticatedUser, dto: CreateGenerationDto, files: Express.Multer.File[]) {
    this.validateProviderBaseUrl(dto.baseUrl);
    this.validateReferenceLimit(dto.provider, files.length);

    const startedAt = Date.now();
    // 请求返回后 Multer 生命周期结束，先把参考图数据整理成后台任务可直接使用的结构。
    const referenceImages = this.mapReferenceImages(files);
    const record = await this.prisma.imageGeneration.create({
      data: {
        userId: user.id,
        provider: dto.provider,
        model: dto.model,
        baseUrl: dto.baseUrl,
        prompt: dto.prompt,
        size: dto.size,
        referenceCount: files.length,
        status: GenerationStatus.PENDING,
        requestParams: this.buildSafeRequestParams(dto, files.length),
      },
    });

    // 生成任务可能耗时较长；接口立即返回 PENDING 记录，后台完成后再更新同一条数据库记录。
    void this.enqueueGeneration(record.id, dto, referenceImages, startedAt);

    return record;
  }

  async get(user: AuthenticatedUser, id: string) {
    const record = await this.prisma.imageGeneration.findFirst({
      where: { id, userId: user.id },
    });
    if (!record) {
      throw new NotFoundException('图片记录不存在');
    }
    return record;
  }

  async remove(user: AuthenticatedUser, id: string) {
    const record = await this.prisma.imageGeneration.findFirst({
      where: { id, userId: user.id },
      select: { id: true, imagePath: true },
    });
    if (!record) {
      throw new NotFoundException('图片记录不存在');
    }

    await this.prisma.imageGeneration.delete({ where: { id: record.id } });
    if (record.imagePath) {
      // 数据库记录删除优先，文件清理失败只影响磁盘残留，不应阻断用户删除列表数据。
      await this.deleteGeneratedFile(record.imagePath);
    }

    return { ok: true };
  }

  private enqueueGeneration(
    recordId: string,
    dto: CreateGenerationDto,
    referenceImages: ReferenceImageInput[],
    startedAt: number,
  ) {
    this.generationQueue.push({ recordId, dto, referenceImages, startedAt });
    this.drainGenerationQueue();
  }

  private drainGenerationQueue() {
    while (this.activeGenerationCount < GENERATION_MAX_CONCURRENCY && this.generationQueue.length > 0) {
      const task = this.generationQueue.shift();
      if (task) {
        void this.runGenerationTask(task);
      }
    }
  }

  private async runGenerationTask(task: QueuedGenerationTask) {
    this.activeGenerationCount += 1;
    try {
      await this.withGenerationTimeout(this.processGeneration(task.recordId, task.dto, task.referenceImages, task.startedAt));
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片生成失败';
      await this.markGenerationFailed(task.recordId, message, Date.now() - task.startedAt);
    } finally {
      this.activeGenerationCount -= 1;
      this.drainGenerationQueue();
    }
  }

  private async withGenerationTimeout<T>(generationPromise: Promise<T>) {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('图片生成任务超时')), GENERATION_TASK_TIMEOUT_MS);
      timeout.unref?.();
    });

    try {
      return await Promise.race([generationPromise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async processGeneration(
    recordId: string,
    dto: CreateGenerationDto,
    referenceImages: ReferenceImageInput[],
    startedAt: number,
  ) {
    let filename: string | undefined;
    try {
      const result =
        dto.provider === Provider.GPT
          ? await this.openAiProvider.generate({ ...dto, referenceImages })
          : await this.geminiProvider.generate({ ...dto, referenceImages });

      this.assertGenerationNotTimedOut(startedAt);

      const activeRecord = await this.prisma.imageGeneration.findUnique({
        where: { id: recordId },
        select: { id: true },
      });
      if (!activeRecord) {
        // 用户可能在生成完成前删除了记录，此时不再落盘或回写数据库。
        return;
      }

      await mkdir(this.uploadDir, { recursive: true });
      this.assertGenerationNotTimedOut(startedAt);
      filename = `${recordId}-${randomUUID()}.${getImageExtension(result.mimeType)}`;
      await writeFile(join(this.uploadDir, filename), result.bytes);
      this.assertGenerationNotTimedOut(startedAt);

      await this.prisma.imageGeneration.update({
        where: { id: recordId },
        data: {
          status: GenerationStatus.SUCCESS,
          imagePath: filename,
          mimeType: result.mimeType,
          durationMs: Date.now() - startedAt,
          responseSummary: result.responseSummary as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片生成失败';
      if (filename) {
        await this.deleteGeneratedFile(filename);
      }
      await this.markGenerationFailed(recordId, message, Date.now() - startedAt);
    }
  }

  private assertGenerationNotTimedOut(startedAt: number) {
    if (Date.now() - startedAt >= GENERATION_TASK_TIMEOUT_MS) {
      throw new Error('图片生成任务超时');
    }
  }

  async list(user: AuthenticatedUser, query: ListGenerationsDto) {
    const where: Prisma.ImageGenerationWhereInput = {
      userId: user.id,
      provider: query.provider,
      status: query.status,
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.imageGeneration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.imageGeneration.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getImageStream(user: AuthenticatedUser, id: string) {
    const record = await this.prisma.imageGeneration.findFirst({
      where: { id, userId: user.id, status: GenerationStatus.SUCCESS },
    });

    if (!record?.imagePath) {
      throw new NotFoundException('图片不存在');
    }

    // basename 防止数据库中的异常路径逃逸 uploads 目录。
    const safeFilename = basename(record.imagePath);
    const filePath = join(this.uploadDir, safeFilename);
    try {
      await stat(filePath);
    } catch {
      throw new NotFoundException('图片文件不存在');
    }

    return {
      stream: createReadStream(filePath),
      mimeType: record.mimeType ?? 'image/png',
    };
  }

  private async markGenerationFailed(recordId: string, message: string, durationMs: number) {
    try {
      await this.prisma.imageGeneration.update({
        where: { id: recordId },
        data: {
          status: GenerationStatus.FAILED,
          durationMs,
          errorMessage: message,
        },
      });
    } catch (error) {
      // 如果记录已被用户删除，失败状态无需再写入；其他异常只记录日志，避免后台任务产生未处理拒绝。
      this.logger.warn(`生成任务失败状态写入失败：${recordId}，${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async deleteGeneratedFile(imagePath: string) {
    try {
      // basename 防止异常路径删除 uploads 目录外的文件。
      await unlink(join(this.uploadDir, basename(imagePath)));
    } catch (error) {
      this.logger.warn(`生成图片文件清理失败：${imagePath}，${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateReferenceLimit(provider: Provider, count: number) {
    const limit = provider === Provider.GPT ? GPT_MAX_REFERENCE_IMAGES : NANO_BANANA_MAX_REFERENCE_IMAGES;
    if (count > limit) {
      throw new BadRequestException(`${provider} 最多支持 ${limit} 张参考图`);
    }
  }

  private validateProviderBaseUrl(baseUrl: string) {
    const { hostname } = new URL(baseUrl);
    if (isPrivateProviderHost(hostname)) {
      throw new BadRequestException(PRIVATE_PROVIDER_HOST_ERROR);
    }
  }

  private mapReferenceImages(files: Express.Multer.File[]): ReferenceImageInput[] {
    return files.map((file) => {
      const imageType = detectImageBytes(file.buffer);
      if (!imageType || imageType.mimeType !== file.mimetype) {
        throw new BadRequestException('参考图文件内容与图片格式不匹配');
      }

      return {
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
      };
    });
  }

  private buildSafeRequestParams(dto: CreateGenerationDto, referenceCount: number): Prisma.InputJsonValue {
    // requestParams 明确排除 apiKey，只保留排查生成问题所需的非敏感参数。
    return {
      provider: dto.provider,
      model: dto.model,
      baseUrl: dto.baseUrl,
      size: dto.size ?? null,
      referenceCount,
    };
  }
}
