import 'reflect-metadata';
import { GenerationStatus, Provider } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListGenerationsDto } from './list-generations.dto';

describe('ListGenerationsDto', () => {
  it('treats empty provider and status query values as omitted filters', async () => {
    // 模拟 clearable 筛选产生的 URL：空字符串应表示“全部”，不能参与枚举校验。
    const dto = plainToInstance(ListGenerationsDto, {
      page: '1',
      pageSize: '12',
      provider: '',
      status: '',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.provider).toBeUndefined();
    expect(dto.status).toBeUndefined();
  });

  it('keeps valid provider and status filters unchanged', async () => {
    // 有效枚举值需要原样保留，确保数据库筛选条件不会被误删。
    const dto = plainToInstance(ListGenerationsDto, {
      page: '1',
      pageSize: '12',
      provider: Provider.GPT,
      status: GenerationStatus.SUCCESS,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.provider).toBe(Provider.GPT);
    expect(dto.status).toBe(GenerationStatus.SUCCESS);
  });
});
