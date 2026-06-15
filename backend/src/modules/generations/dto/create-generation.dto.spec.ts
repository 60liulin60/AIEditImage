import { validate } from 'class-validator';
import { CreateGenerationDto } from './create-generation.dto';

function createDto(overrides: Partial<CreateGenerationDto> = {}) {
  return Object.assign(new CreateGenerationDto(), {
    provider: 'GPT',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-2',
    apiKey: 'test-key',
    prompt: '生成一张图片',
    ...overrides,
  });
}

async function validateDto(dto: CreateGenerationDto) {
  return validate(dto);
}

describe('CreateGenerationDto', () => {
  it('allows the configured image sizes', async () => {
    const dto = createDto({ size: '1024x1536' });

    await expect(validateDto(dto)).resolves.toHaveLength(0);
  });

  it('rejects unsupported image sizes', async () => {
    const dto = createDto({ size: '2048x2048' });

    await expect(validateDto(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'size', constraints: expect.objectContaining({ isIn: 'size must be one of the following values: 1024x1024, 1024x1536, 1536x1024' }) })]),
    );
  });

  it('rejects oversized prompts', async () => {
    const dto = createDto({ prompt: 'x'.repeat(2001) });

    await expect(validateDto(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'prompt', constraints: expect.objectContaining({ maxLength: 'prompt must be shorter than or equal to 2000 characters' }) })]),
    );
  });
});
