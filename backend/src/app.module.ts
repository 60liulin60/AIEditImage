import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { GenerationsModule } from './modules/generations/generations.module';
import { PrismaModule } from './modules/prisma/prisma.module';

@Module({
  imports: [
    // 全局配置让各模块直接读取数据库、JWT、跨域等运行参数。
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    GenerationsModule,
  ],
})
export class AppModule {}
