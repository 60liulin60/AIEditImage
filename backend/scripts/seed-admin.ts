import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt = require('bcryptjs');
import { config } from 'dotenv';

// seed 脚本独立运行时不会经过 Nest ConfigModule，因此这里显式读取 backend/.env。
config();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('请在 backend/.env 中配置 ADMIN_EMAIL 和 ADMIN_PASSWORD');
  }

  // 初始化管理员只创建或更新指定邮箱，不写死任何默认密码。
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  console.log(`管理员账号已准备好：${email}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
