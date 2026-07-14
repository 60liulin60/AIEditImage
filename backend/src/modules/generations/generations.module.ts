import { Module } from '@nestjs/common';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { GeminiImageProvider } from './providers/gemini-image.provider';
import { GrokImageProvider } from './providers/grok-image.provider';
import { OpenAiImageProvider } from './providers/openai-image.provider';

@Module({
  controllers: [GenerationsController],
  providers: [GenerationsService, OpenAiImageProvider, GeminiImageProvider, GrokImageProvider],
})
export class GenerationsModule {}
