// GPT 图片编辑最多允许 16 张参考图，和参考项目的多参考图体验保持一致。
export const GPT_MAX_REFERENCE_IMAGES = 16;

// Nano Banana 首版限制为 3 张参考图，降低上游失败率并保持表单清晰。
export const NANO_BANANA_MAX_REFERENCE_IMAGES = 3;

// 单张参考图最大 10MB，避免用户误传超大图片压垮后端内存。
export const MAX_REFERENCE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

// 只允许常见网页图片格式，便于上游 API 和前端预览稳定处理。
export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
