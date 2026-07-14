# AIEditImage

AIEditImage 是一个前后端分离的图片生成工作台，支持在页面配置 GPT / Nano Banana / Grok 的请求地址、模型和 API Key，使用提示词与参考图生成图片，并把生成结果保存到后端文件目录与 SQLite 元数据表中。

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Element Plus、SCSS、TailwindCSS、pnpm
- 后端：NestJS、TypeScript、Prisma、SQLite、pnpm
- 数据库：Prisma + SQLite 单文件（默认 `backend/data/aieditimage.db`），无需下载 MySQL 二进制
- 存储：API Key 加密保存到浏览器 IndexedDB；图片文件保存到 `backend/uploads/generated`；SQLite 保存生成记录元数据

## 参考项目

- [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)：参考多 API 配置、参考图上传、历史回看和错误提示体验。
- [PicoTrex/Awesome-Nano-Banana-images](https://github.com/PicoTrex/Awesome-Nano-Banana-images)：参考 Nano Banana 创意分类和提示词模板。

## 环境准备

准备 Node.js 20+ 和 pnpm 10+，然后安装依赖：

```bash
pnpm install
```

## 数据库

不需要手动安装或下载 MySQL。

默认连接串写在 `backend/.env`：

```env
DATABASE_URL="file:../data/aieditimage.db"
```

路径相对 `backend/prisma/schema.prisma` 解析，实际文件位于 `backend/data/aieditimage.db`。

`pnpm dev` 会自动：

- 确保 `backend/data` 目录存在
- 执行 `prisma db push` 同步表结构
- 执行 `pnpm seed:admin` 准备管理员账号

如需手动同步：

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

> 说明：从 MySQL 切换到 SQLite **不会自动迁移**旧库数据。旧的 `backend/mysql/` 目录可手动删除；管理员账号通过 seed 重新创建。

## 启动命令

```bash
pnpm dev                 # 同步 SQLite 后同时启动前端、后端
pnpm dev:backend         # 同步 SQLite 后启动后端
pnpm dev:backend:nest    # 只启动 NestJS，不执行 db push / seed
pnpm dev:frontend        # 只启动前端
pnpm build               # 构建前后端
```

默认地址：

- 前端：Vite 默认从 http://localhost:5173 开始，如果端口被占用会自动切换到下一个可用端口
- 后端：http://localhost:3033/api
- SQLite：`backend/data/aieditimage.db`

## 功能说明

- 管理员登录后可创建和禁用用户。
- 普通用户只能查看自己生成的图片。
- API Key 使用浏览器 Web Crypto `AES-GCM` 加密后保存到 IndexedDB，不会写入后端数据库。
- 生成接口会短暂接收明文 API Key 调用上游，后端不会保存或记录该 Key。
- GPT 默认模型为 `gpt-image-2`，默认请求地址为 `https://api.openai.com/v1`。
- Nano Banana 默认模型为 `gemini-2.5-flash-image-preview`，默认请求地址为 `https://generativelanguage.googleapis.com/v1beta`。
- Grok 默认模型为 `grok-imagine-image`，默认请求地址为 `https://api.x.ai/v1`；文生图走 `/images/generations`，图生图走 `/images/edits`，参考图最多 5 张。
