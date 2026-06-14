import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_REFERENCE_IMAGE_SIZE_BYTES } from './constants';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { ListGenerationsDto } from './dto/list-generations.dto';
import { GenerationsService } from './generations.service';

function imageFileFilter(_: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) {
  // 双重校验 MIME，先在 Multer 阶段拒绝明显不支持的上传。
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    callback(new BadRequestException('仅支持 PNG、JPG、WEBP 参考图'), false);
    return;
  }
  callback(null, true);
}

@Controller('generations')
@UseGuards(AuthGuard('jwt'))
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('referenceImages', 16, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_REFERENCE_IMAGE_SIZE_BYTES },
      fileFilter: imageFileFilter,
    }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGenerationDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.generationsService.create(user, dto, files);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListGenerationsDto) {
    return this.generationsService.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.generationsService.get(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.generationsService.remove(user, id);
  }

  @Get(':id/file')
  async file(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) {
    const image = await this.generationsService.getImageStream(user, id);
    image.stream.on('error', () => this.handleImageStreamError(response));
    response.setHeader('Content-Type', image.mimeType);
    image.stream.pipe(response);
  }

  private handleImageStreamError(response: Response) {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(404).send('图片文件不存在');
  }
}
