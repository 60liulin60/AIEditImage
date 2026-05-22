import { PassThrough } from 'stream';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/types';
import { GenerationsController } from './generations.controller';

describe('GenerationsController', () => {
  const user: AuthenticatedUser = {
    id: 'user-id',
    email: 'user@example.com',
    role: 'USER',
  };

  it('ends with not found when the image stream errors before headers are sent', async () => {
    const stream = new PassThrough();
    const generationsService = {
      getImageStream: jest.fn().mockResolvedValue({ stream, mimeType: 'image/png' }),
    };
    const response = new PassThrough() as unknown as Response & {
      setHeader: jest.Mock;
      status: jest.Mock;
      send: jest.Mock;
      headersSent: boolean;
    };
    response.headersSent = false;
    response.setHeader = jest.fn();
    response.status = jest.fn().mockReturnValue(response);
    response.send = jest.fn().mockReturnValue(response);

    const controller = new GenerationsController(generationsService as never);
    await controller.file(user, 'generation-id', response);

    stream.emit('error', new Error('file disappeared'));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.send).toHaveBeenCalledWith('图片文件不存在');
  });
});
