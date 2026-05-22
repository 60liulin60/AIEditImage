# AIEditImage 优化计划

## 背景

当前项目是一个图片生成 Web 应用：

- 后端：NestJS + Prisma + MySQL，包含认证、用户管理、图片生成模块。
- 前端：Vue 3 + Vite + Pinia + Element Plus，支持本地保存 API 配置、提交生成任务、轮询生成结果。

已重点查看的文件：

- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/generations/generations.controller.ts`
- `backend/src/modules/generations/generations.service.ts`
- `backend/src/modules/generations/providers/openai-image.provider.ts`
- `backend/src/modules/generations/providers/gemini-image.provider.ts`
- `backend/src/modules/generations/dto/create-generation.dto.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/views/GenerateView.vue`
- `frontend/src/utils/api-config-store.ts`
- `frontend/src/api/http.ts`

## 优化建议

### 1. 高优先级：后端 SSRF 风险

相关位置：

- `backend/src/modules/generations/dto/create-generation.dto.ts`
- `backend/src/modules/generations/providers/openai-image.provider.ts`
- `backend/src/modules/generations/providers/gemini-image.provider.ts`

当前前端可以提交任意 `baseUrl`，后端会直接 `fetch`。这有 SSRF 风险，例如访问内网地址、本机服务、云元数据地址等。

建议：

- 后端限制 `baseUrl` 只能是允许的 Provider 域名或管理员配置的白名单。
- 禁止 `localhost`、`127.0.0.1`、内网 IP、link-local 地址。
- 最好不要让普通用户直接传 `baseUrl` 到后端，而是后端保存/管理 Provider 配置。

### 2. 高优先级：API Key 从浏览器传给后端

相关位置：

- `frontend/src/views/GenerateView.vue`
- `backend/src/modules/generations/dto/create-generation.dto.ts`

当前 API Key 存在浏览器 IndexedDB，生成时解密后传给后端。虽然没有写入数据库，但仍有风险：

- 浏览器 XSS 后可读取/解密 Key。
- 请求链路、代理、日志误配置可能暴露 Key。
- 后端 DTO 接收 `apiKey`，未来日志或异常处理中容易误泄露。

建议二选一：

- 方案 A：保留 BYOK，但后端明确禁止记录 body，并为 `apiKey` 做敏感字段过滤。
- 方案 B：改为后端托管密钥，前端只选择配置 ID。更适合多用户/生产部署。

### 3. 中高优先级：上传图片只校验 MIME，不校验文件魔数

相关位置：

- `backend/src/modules/generations/generations.controller.ts`

Multer 阶段只看 `file.mimetype`，这个值可伪造。虽然后端输出图片做了魔数校验，但输入参考图没有做。

建议：

- 在 `GenerationsService.create()` 或单独 pipe 中校验上传文件头。
- PNG/JPEG/WEBP 都做 magic bytes 检查。
- 拒绝伪造 MIME 的文件。

### 4. 中高优先级：后台生成任务无并发控制/队列

相关位置：

- `backend/src/modules/generations/generations.service.ts`

当前 `void this.processGeneration(...)` 直接启动后台任务。并发多时可能导致：

- 外部 API 并发过高。
- 内存中图片 buffer 堆积。
- 服务重启后 PENDING 任务丢失。
- 无统一重试、超时、取消机制。

建议：

- 短期：增加简单并发限制和 `AbortSignal` 超时。
- 中期：引入 BullMQ 或数据库任务轮询队列。
- 长期：生成任务独立 Worker 化。

### 5. 中优先级：外部 fetch 缺少超时

相关位置：

- `backend/src/modules/generations/providers/openai-image.provider.ts`
- `backend/src/modules/generations/providers/gemini-image.provider.ts`

当前 `fetch` 没有超时控制，外部服务卡住时后台任务可能长时间占用资源。

建议：

- 使用 `AbortController` 设置超时。
- 区分调用超时、下载超时、上游错误。
- 失败时写入友好错误信息。

### 6. 中优先级：图片读取流缺少错误处理

相关位置：

- `backend/src/modules/generations/generations.controller.ts`
- `backend/src/modules/generations/generations.service.ts`

`createReadStream` 如果文件不存在或读取失败，当前 `pipe(response)` 可能造成未处理 stream error。

建议：

- 在 service 中先 `stat` 文件，缺失时返回 `NotFoundException`。
- 或在 controller 中监听 `image.stream.on('error')`。

### 7. 中优先级：前端生成页文件较大，可拆分

相关位置：

- `frontend/src/views/GenerateView.vue`

`GenerateView.vue` 同时负责表单 UI、API 配置读取、文件处理、任务提交、轮询、结果展示、提示词模板展示。

建议拆分：

- `GenerateForm.vue`
- `PromptTemplateList.vue`
- `LatestGenerationResult.vue`
- `useGenerationPolling.ts`
- `useApiConfigs.ts`

### 8. 中优先级：前端 localStorage 存 AES-GCM key 安全收益有限

相关位置：

- `frontend/src/utils/api-config-store.ts`

当前 API Key 加密存 IndexedDB，但 AES 密钥也明文 JWK 存 localStorage。这个设计可以防止“直接看 IndexedDB 明文”，但无法防 XSS 或本机浏览器被读取。

建议：

- UI 上明确提示“密钥仅本机保存，不适合共享设备”。
- 如果面向生产，建议改为用户输入主密码派生密钥，或后端托管密钥。
- 不要把这个设计描述为强安全加密，只能算轻量本地混淆/本机保护。

### 9. 低中优先级：DTO 校验可以更严格

相关位置：

- `backend/src/modules/generations/dto/create-generation.dto.ts`

当前 `prompt`、`model` 只有 `MinLength(1)`，前端限制了 prompt 2000，但后端没有同步限制。

建议：

- `prompt` 增加 `@MaxLength(2000)`。
- `model` 增加合理长度限制。
- `size` 使用枚举或正则限制，例如 `1024x1024`。
- `baseUrl` 加白名单或自定义校验。

### 10. 低优先级：构建产物与临时目录需要确认忽略

项目根目录包含：

- `node_modules`
- `backend/dist`
- `frontend/dist`
- `.tmp/mysqlmsn/...`

建议：

- 检查 `.gitignore` 是否覆盖这些目录。
- 确保 `uploads`、`.env`、数据库连接文件等敏感/运行时文件不会被提交。

## 继续任务 Plan

### Phase 1：安全与稳定性最小修复

目标：不大改架构，先堵主要风险。

1. 检查 `.gitignore`，确认 `node_modules`、`dist`、`.tmp`、`uploads`、`.env` 已忽略。
2. 后端增加 Provider URL 安全校验：
   - 禁止本地/内网地址。
   - 限制协议优先使用 `https`，开发环境按需允许 `http`。
   - 支持官方 OpenAI、Gemini 域名和显式配置的白名单。
3. 后端增加上传图片魔数校验。
4. Provider fetch 增加超时。
5. 图片 stream 增加读取错误处理。
6. 增加或更新对应单元测试。

验收标准：

- 非法 `baseUrl` 被拒绝。
- 伪造 MIME 的上传文件被拒绝。
- 外部 API 超时后任务进入 FAILED 状态。
- 缺失图片文件不会造成未处理异常。
- 后端测试通过。

### Phase 2：优化生成任务生命周期

目标：避免后台任务失控。

1. 为 `processGeneration` 增加并发限制。
2. 统一任务超时策略。
3. 增加 PENDING 任务超时标记逻辑。
4. 考虑服务重启后的 PENDING 恢复策略。
5. 如果后续任务量增加，再引入队列 Worker。

验收标准：

- 并发生成请求不会无限制同时调用外部 Provider。
- 超时任务会被明确标记失败。
- 服务异常重启后不会长期残留无意义 PENDING 记录。

### Phase 3：前端可维护性重构

目标：降低 `GenerateView.vue` 复杂度。

1. 抽出轮询逻辑到 composable。
2. 抽出 API 配置读取逻辑到 composable。
3. 抽出上传/表单组件。
4. 为纯函数补 Vitest 测试，例如轮询间隔解析、配置存储异常路径。

验收标准：

- `GenerateView.vue` 只负责页面组合和少量状态协调。
- 轮询逻辑可单独测试。
- API 配置读取错误有明确 UI 提示。

### Phase 4：密钥管理策略决策

目标：明确产品安全模型。

需要先确定产品定位：

- 本地 BYOK 模式：用户自己的浏览器保存 Key，适合个人工具。
- 后端托管模式：管理员配置 Provider，用户只发起生成，适合多人系统/生产部署。

建议：

- 如果项目主要是个人/本机使用，保留 BYOK，但补充安全提示和敏感日志保护。
- 如果项目要多人使用或部署到公网，优先改成后端托管密钥。

## 推荐下一步

优先执行 Phase 1。它改动范围相对可控，同时能显著降低安全和稳定性风险。
