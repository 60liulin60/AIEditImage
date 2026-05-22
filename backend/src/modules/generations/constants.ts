// GPT 图片编辑最多允许 16 张参考图，和参考项目的多参考图体验保持一致。
export const GPT_MAX_REFERENCE_IMAGES = 16;

// Nano Banana 首版限制为 3 张参考图，降低上游失败率并保持表单清晰。
export const NANO_BANANA_MAX_REFERENCE_IMAGES = 3;

// 进程内同时执行的后台生成任务数，避免并发请求同时打满外部 Provider。
export const GENERATION_MAX_CONCURRENCY = 2;

// 单个后台生成任务的外层生命周期超时，兜底 Provider 层超时失效的场景。
export const GENERATION_TASK_TIMEOUT_MS = 90_000;

// 服务启动时将超过该窗口的 PENDING 任务标记为失败，因为内存中的参考图无法恢复。
export const GENERATION_STALE_PENDING_MS = 30 * 60_000;

// 单张参考图最大 10MB，避免用户误传超大图片压垮后端内存。
export const MAX_REFERENCE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

// 只允许常见网页图片格式，便于上游 API 和前端预览稳定处理。
export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
