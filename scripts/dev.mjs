import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendOnly = process.argv.includes('--backend-only');
const children = [];
const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'backend');
// SQLite 数据文件目录，确保 prisma db push 前父目录已存在。
const sqliteDataDir = resolve(backendDir, 'data');

function createEnv() {
  // 统一把临时目录放到仓库内，规避 Windows 用户目录权限问题。
  return {
    ...process.env,
    TEMP: process.env.TEMP || 'E:\\otherObeject\\AIEditImage\\.tmp',
    TMP: process.env.TMP || 'E:\\otherObeject\\AIEditImage\\.tmp',
  };
}

function spawnProcess(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: createEnv(),
  });

  children.push(child);

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} 已退出，退出码：${code}`);
      shutdown(code);
    }
  });

  return child;
}

function runCommand(name, command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: createEnv(),
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${name} 执行失败，退出码：${code}`));
    });
  });
}

async function prepareBackendDatabase() {
  await mkdir(sqliteDataDir, { recursive: true });
  // 先 generate 再 db push：schema 变更后必须重建 Client，否则 seed/ts-node 会报 PrismaClient 导出不存在。
  console.log('生成 Prisma Client...');
  await runCommand('Prisma generate', 'pnpm', ['--filter', '@aieditimage/backend', 'prisma:generate']);
  console.log('同步 Prisma 表结构（SQLite）...');
  await runCommand('Prisma db push', 'pnpm', ['--filter', '@aieditimage/backend', 'exec', 'prisma', 'db', 'push']);
  console.log('初始化管理员账号...');
  await runCommand('seed admin', 'pnpm', ['seed:admin']);
}

function shutdown(code = 0) {
  // 开发命令退出时同步停止后端和前端子进程。
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await prepareBackendDatabase();
  spawnProcess('backend', 'pnpm', ['dev:backend:nest']);
  if (!backendOnly) {
    spawnProcess('frontend', 'pnpm', ['dev:frontend']);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
