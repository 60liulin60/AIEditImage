# AIEditImage

AIEditImage 是一个前后端分离的图片生成工作台，支持在页面配置 GPT / Nano Banana 的请求地址、模型和 API Key，使用提示词与参考图生成图片，并把生成结果保存到后端文件目录与 MySQL 元数据表中。

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Element Plus、SCSS、TailwindCSS、pnpm
- 后端：NestJS、TypeScript、Prisma、MySQL、pnpm
- 数据库：通过 `mysql-memory-server` 下载的 MySQL 二进制由 pnpm 自动启动，不使用 Docker，不要求手动安装 MySQL；开发数据持久化保存到 `backend/mysql/data`
- 存储：API Key 加密保存到浏览器 IndexedDB；图片文件保存到 `backend/uploads/generated`；MySQL 保存生成记录元数据

## 参考项目

- [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)：参考多 API 配置、参考图上传、历史画廊和错误提示体验。
- [PicoTrex/Awesome-Nano-Banana-images](https://github.com/PicoTrex/Awesome-Nano-Banana-images)：参考 Nano Banana 创意分类和提示词模板。

## 环境准备

准备 Node.js 20+ 和 pnpm 10+，然后安装依赖：

```bash
pnpm install
```

## 数据库

不需要手动创建数据库账号和密码。

```bash
pnpm mysql:init
```

该命令会自动：

- 创建 `backend/mysql` 目录
- 生成数据库用户名和密码
- 写入 `backend/mysql/connection.json`
- 写入或更新 `backend/.env` 中的 `DATABASE_URL`

生成记录依赖 MySQL 元数据。`pnpm mysql` 和 `pnpm dev` 会复用 `backend/mysql/data` 作为固定数据目录，因此重启开发服务后历史图片记录不会再因为临时数据库重建而消失。

默认 MySQL 端口是 `3307`。启动开发环境时：

```bash
pnpm dev
```

`pnpm dev` 会自动启动 MySQL、后端和前端。只启动后端时：

```bash
pnpm dev:backend
```

`pnpm dev:backend` 也会先自动启动 MySQL，再启动 NestJS 后端。

## 初始化 Prisma 和管理员

`pnpm dev` 和 `pnpm dev:backend` 会在后端启动前自动执行 `prisma db push` 同步表结构，并执行 `pnpm seed:admin` 准备管理员账号。

如需手动同步，也可以执行：

```bash
pnpm --filter @aieditimage/backend db:sync
pnpm seed:admin
```

管理员账号来自 `backend/.env`：

```env
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change-me-123456"
```

正式使用前请修改 `backend/.env` 中的 `JWT_SECRET`、`ADMIN_EMAIL`、`ADMIN_PASSWORD`。

## 启动命令

```bash
pnpm dev                 # 同时启动 MySQL、前端、后端
pnpm dev:backend         # 启动 MySQL、同步表结构后再启动后端
pnpm dev:backend:nest    # 只启动 NestJS，不启动 MySQL
pnpm dev:frontend        # 只启动前端
pnpm mysql               # 只启动 pnpm 管理的本地 MySQL
pnpm mysql:init          # 自动生成数据库连接信息
pnpm build               # 构建前后端
```

默认地址：

- 前端：Vite 默认从 http://localhost:5173 开始，如果端口被占用会自动切换到下一个可用端口
- 后端：http://localhost:3033/api
- MySQL：`localhost:3307`

## 功能说明

- 管理员登录后可创建和禁用用户。
- 普通用户只能查看自己生成的图片。
- API Key 使用浏览器 Web Crypto `AES-GCM` 加密后保存到 IndexedDB，不会写入后端数据库。
- 生成接口会短暂接收明文 API Key 调用上游，后端不会保存或记录该 Key。
- GPT 默认模型为 `gpt-image-2`，默认请求地址为 `https://api.openai.com/v1`。
- Nano Banana 默认模型为 `gemini-2.5-flash-image-preview`，默认请求地址为 `https://generativelanguage.googleapis.com/v1beta`。
