import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // 应用启动时主动连接数据库，尽早暴露配置或权限问题。
    await this.$connect();
  }

  async onModuleDestroy() {
    // 进程退出前释放连接，避免开发热更新时残留连接。
    await this.$disconnect();
  }
}
