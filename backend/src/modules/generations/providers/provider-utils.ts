export function joinApiUrl(baseUrl: string, path: string): string {
  // 去掉首尾多余斜杠，避免用户填入 /v1/ 时拼接出双斜杠。
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function getImageExtension(mimeType: string): string {
  // 扩展名只用于落盘文件名，不信任原始上传文件名。
  const extensionMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return extensionMap[mimeType] ?? 'png';
}

export function extractProviderMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = record.error as Record<string, unknown> | undefined;
    if (typeof error?.message === 'string') {
      return error.message;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }
  return fallback;
}
