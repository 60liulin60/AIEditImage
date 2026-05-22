import { execFile, spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import net from 'node:net';
import mysql from 'mysql2/promise';
import constantsModule from 'mysql-memory-server/dist/src/constants.js';
import downloaderModule from 'mysql-memory-server/dist/src/libraries/Downloader.js';
import loggerModule from 'mysql-memory-server/dist/src/libraries/Logger.js';
import versionModule from 'mysql-memory-server/dist/src/libraries/Version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(__dirname, '..');
const mysqlDir = resolve(backendDir, 'mysql');
const mysqlDataDir = resolve(mysqlDir, 'data');
const mysqlRuntimeDir = resolve(mysqlDir, 'runtime');
const port = process.env.AIEDITIMAGE_MYSQL_PORT ?? '3307';
const stateFile = resolve(mysqlDir, 'connection.json');
const envFile = resolve(backendDir, '.env');
const databaseName = 'aieditimage';
const mysqlVersion = process.env.AIEDITIMAGE_MYSQL_VERSION ?? '8.4.x';

function unwrapModuleDefault(module) {
  // mysql-memory-server 的 CJS 产物在 ESM 动态加载下可能出现双层 default。
  return module.default?.default ?? module.default ?? module;
}

const getBinaryURL = unwrapModuleDefault(versionModule);
const downloadBinary = downloaderModule.downloadBinary ?? downloaderModule.default?.downloadBinary;
const Logger = unwrapModuleDefault(loggerModule);
const defaultMysqlOptions = constantsModule.DEFAULT_OPTIONS ?? constantsModule.default?.DEFAULT_OPTIONS;

function createPassword() {
  // 自动生成数据库密码，避免用户手动设置，同时只使用 URL 安全字符。
  return randomBytes(18).toString('base64url');
}

function createUsername() {
  // 用户名也自动生成，避免使用 root 作为应用连接账号。
  return `ai_${randomBytes(5).toString('hex')}`;
}

function buildDatabaseUrl(user, password, databasePort = port) {
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${databasePort}/${databaseName}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execFileChecked(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args.join(' ')} 执行失败：${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function escapeSqlString(value) {
  // init-file 会在 MySQL 启动时执行，必须转义随机账号和密码中的特殊字符。
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function buildInitSql(user, password) {
  const escapedUser = escapeSqlString(user);
  const escapedPassword = escapeSqlString(password);
  const grants = ['localhost', '127.0.0.1'].flatMap((host) => {
    // 同时授权 localhost 和 127.0.0.1，兼容不同 MySQL 客户端的连接解析。
    const escapedHost = escapeSqlString(host);
    return [
      `CREATE USER IF NOT EXISTS '${escapedUser}'@'${escapedHost}' IDENTIFIED BY '${escapedPassword}';`,
      `ALTER USER '${escapedUser}'@'${escapedHost}' IDENTIFIED BY '${escapedPassword}';`,
      `GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO '${escapedUser}'@'${escapedHost}';`,
    ];
  });

  return [
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    ...grants,
    'FLUSH PRIVILEGES;',
    '',
  ].join('\n');
}

function createMysqlOptions(user) {
  // 复用 mysql-memory-server 的二进制下载能力，但业务数据目录由本脚本固定管理。
  return {
    ...defaultMysqlOptions,
    dbName: databaseName,
    username: user,
    port: Number(port),
    version: mysqlVersion,
    xEnabled: 'OFF',
    logLevel: 'LOG',
  };
}

function printHelp() {
  console.log(`
AIEditImage 本地 MySQL 脚本

命令：
  pnpm mysql:init  准备 backend/mysql 目录并写入 DATABASE_URL
  pnpm mysql       启动由 pnpm 依赖管理的本地 MySQL
  pnpm mysql:sql   确认 aieditimage 数据库存在

环境变量：
  AIEDITIMAGE_MYSQL_PORT     覆盖默认端口 3307
  AIEDITIMAGE_MYSQL_VERSION  覆盖默认 MySQL 版本 8.4.x
`);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDataDir() {
  // 数据库连接状态和持久化数据都固定放在 backend/mysql，避免重启后丢元数据。
  await mkdir(mysqlDir, { recursive: true });
}

async function ensureRuntimeDir() {
  // runtime 只保存本次启动的 socket、pid、日志和 init.sql，不参与业务数据持久化。
  await mkdir(mysqlRuntimeDir, { recursive: true });
}

function isPortOpen(databasePort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: Number(databasePort) });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function readState() {
  if (!(await pathExists(stateFile))) {
    return null;
  }
  return JSON.parse(await readFile(stateFile, 'utf8'));
}

async function writeEnv(databaseUrl) {
  if (await pathExists(envFile)) {
    const currentEnv = await readFile(envFile, 'utf8');
    const nextEnv = currentEnv.includes('DATABASE_URL=')
      ? currentEnv.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${databaseUrl}"`)
      : `DATABASE_URL="${databaseUrl}"\n${currentEnv}`;
    await writeFile(envFile, nextEnv, 'utf8');
    return;
  }

  // 首次使用时自动生成后端 .env，避免用户手动复制示例文件。
  await writeFile(
    envFile,
    [
      `DATABASE_URL="${databaseUrl}"`,
      'JWT_SECRET="please-change-this-secret"',
      'FRONTEND_ORIGIN=""',
      'ADMIN_EMAIL="admin@example.com"',
      'ADMIN_PASSWORD="change-me-123456"',
      'PORT=3033',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function prepareDatabase() {
  await ensureDataDir();
  const existingState = await readState();
  const shouldRotateCredentials = !existingState?.user || existingState.user === 'root' || !existingState?.password;
  const user = shouldRotateCredentials ? createUsername() : existingState.user;
  const password = shouldRotateCredentials ? createPassword() : existingState.password;
  const databaseUrl = buildDatabaseUrl(user, password);

  await writeFile(
    stateFile,
    JSON.stringify(
      {
        host: '127.0.0.1',
        port: Number(port),
        user,
        password,
        database: databaseName,
        databaseUrl,
        dataDir: mysqlDataDir,
        persistent: true,
        note: 'MySQL 使用 mysql-memory-server 下载的二进制启动，业务数据持久化保存在 backend/mysql/data。',
      },
      null,
      2,
    ),
    'utf8',
  );

  await writeEnv(databaseUrl);
  console.log(`MySQL 连接信息已准备：${databaseUrl}`);
}

async function startDatabase() {
  await prepareDatabase();
  const state = await readState();
  const user = state?.user ?? createUsername();
  const password = state?.password ?? createPassword();
  const databaseUrl = buildDatabaseUrl(user, password);

  if (await isPortOpen(port)) {
    console.log(`检测到 MySQL 已在 localhost:${port} 运行：${databaseUrl}`);
    console.log('保持该命令运行，按 Ctrl+C 退出。');
    setInterval(() => {}, 60_000);
    return;
  }

  console.log('开始启动持久化 MySQL。首次运行会从 MySQL CDN 下载二进制文件，可能需要几分钟...');

  let startedChild;
  let startedBinaryPath;
  try {
    const mysqlOptions = createMysqlOptions(user);
    const binaryPath = await resolveMysqlBinary(mysqlOptions);
    startedBinaryPath = binaryPath;
    const initialized = await ensurePersistentDataDir(binaryPath);
    const initSqlFile = await writeStartupInitSql(user, password);
    const { child, socket } = await spawnPersistentMysql(binaryPath, initSqlFile);
    startedChild = child;

    await waitForDatabaseConnection(user, password);

    await writeFile(
      stateFile,
      JSON.stringify(
        {
          host: '127.0.0.1',
          port: Number(port),
          user,
          password,
          database: databaseName,
          databaseUrl,
          dataDir: mysqlDataDir,
          binaryPath,
          mysqlVersion,
          persistent: true,
          initialized,
          socket,
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeEnv(databaseUrl);

    console.log(`MySQL 已启动：${databaseUrl}`);
    console.log(`数据目录：${mysqlDataDir}`);
    console.log('保持该命令运行，后端即可连接数据库。按 Ctrl+C 停止。');

    keepProcessAlive(child, binaryPath);
  } catch (error) {
    if (startedChild && startedBinaryPath) {
      // 启动中途失败时主动停止 mysqld，避免留下占用端口的孤儿进程。
      await shutdownMysql(startedBinaryPath, startedChild);
    }
    console.error('MySQL 启动失败：');
    console.error(error);
    process.exitCode = 1;
  }
}

async function resolveMysqlBinary(mysqlOptions) {
  if (!getBinaryURL || !downloadBinary || !Logger || !defaultMysqlOptions) {
    throw new Error('mysql-memory-server 内部下载器加载失败，请检查依赖版本。');
  }
  const logger = new Logger(mysqlOptions.logLevel);
  const binaryInfo = getBinaryURL(mysqlOptions.version, mysqlOptions.arch);
  // 下载器会优先复用已下载的 MySQL 二进制，缺失时才访问 MySQL CDN。
  return downloadBinary(binaryInfo, mysqlOptions, logger);
}

async function ensurePersistentDataDir(binaryPath) {
  await mkdir(mysqlDataDir, { recursive: true });
  const mysqlSystemDir = resolve(mysqlDataDir, 'mysql');
  const initialized = (await pathExists(resolve(mysqlDataDir, 'auto.cnf'))) || (await pathExists(mysqlSystemDir));
  if (initialized) {
    return false;
  }

  const entries = await readdir(mysqlDataDir);
  if (entries.length > 0) {
    throw new Error(`持久化数据目录不是空目录，且未发现 MySQL 初始化标记：${mysqlDataDir}`);
  }

  // 只在首次启动时初始化数据目录，后续启动复用同一个 datadir 来保留生成记录。
  await execFileChecked(binaryPath, ['--no-defaults', `--datadir=${mysqlDataDir}`, '--initialize-insecure'], {
    timeout: 240_000,
  });
  return true;
}

async function writeStartupInitSql(user, password) {
  await ensureRuntimeDir();
  const initSqlFile = resolve(mysqlRuntimeDir, 'init.sql');
  await writeFile(initSqlFile, buildInitSql(user, password), 'utf8');
  return initSqlFile;
}

async function spawnPersistentMysql(binaryPath, initSqlFile) {
  await ensureRuntimeDir();
  const socket = process.platform === 'win32' ? `MySQL-${randomUUID()}` : resolve(mysqlRuntimeDir, 'mysql.sock');
  const logFile = resolve(mysqlRuntimeDir, 'mysql.log');
  const errorLogFile = resolve(mysqlRuntimeDir, 'mysql-error.log');
  const pidFile = resolve(mysqlRuntimeDir, 'mysql.pid');
  await rm(logFile, { force: true });
  await rm(errorLogFile, { force: true });
  await rm(pidFile, { force: true });

  const args = [
    '--no-defaults',
    `--port=${port}`,
    `--datadir=${mysqlDataDir}`,
    `--socket=${socket}`,
    `--general-log-file=${logFile}`,
    '--general-log=1',
    `--init-file=${initSqlFile}`,
    '--bind-address=127.0.0.1',
    '--innodb-doublewrite=OFF',
    `--log-error=${errorLogFile}`,
    `--pid-file=${pidFile}`,
    '--mysqlx=OFF',
  ];
  if (process.platform !== 'win32') {
    args.push(`--user=${os.userInfo().username}`);
  }

  const child = spawn(binaryPath, args, { stdio: 'inherit' });
  child.once('exit', (code) => {
    if (code && code !== 0) {
      console.error(`MySQL 进程已退出，退出码：${code}。错误日志：${errorLogFile}`);
    }
  });
  return { child, socket };
}

async function waitForDatabaseConnection(user, password, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: Number(port),
        user,
        password,
        database: databaseName,
      });
      await connection.end();
      return;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }

  throw new Error(
    `等待 MySQL 应用账号可连接超时：${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function keepProcessAlive(child, binaryPath) {
  let shuttingDown = false;
  const timer = setInterval(() => {}, 60_000);

  const stop = async (code = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(timer);
    await shutdownMysql(binaryPath, child);
    process.exit(code);
  };

  process.on('SIGINT', () => void stop(0));
  process.on('SIGTERM', () => void stop(0));
  child.once('exit', (code) => {
    clearInterval(timer);
    if (!shuttingDown) {
      process.exit(code ?? 0);
    }
  });
}

async function shutdownMysql(binaryPath, child) {
  const mysqlAdminPath = resolve(dirname(binaryPath), `mysqladmin${process.platform === 'win32' ? '.exe' : ''}`);
  try {
    // root 是 --initialize-insecure 创建的本地管理账号，仅用于优雅关闭开发库。
    await execFileChecked(mysqlAdminPath, ['--protocol=tcp', '-h', '127.0.0.1', '-P', port, '-u', 'root', 'shutdown'], {
      timeout: 15_000,
    });
  } catch {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

async function createDatabase() {
  await ensureDataDir();
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: state.port,
    user: state.user,
    password: state.password,
  });
  // 数据库创建语句幂等，可重复执行。
  await connection.query(
    'CREATE DATABASE IF NOT EXISTS aieditimage CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  );
  await connection.end();
  console.log('aieditimage 数据库已确认存在。');
}

const command = process.argv[2] ?? 'help';

if (command === 'prepare') {
  await prepareDatabase();
} else if (command === 'start') {
  await startDatabase();
} else if (command === 'sql') {
  await createDatabase();
} else {
  printHelp();
}
