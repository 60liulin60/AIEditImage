import { BadGatewayException } from '@nestjs/common';

export interface ImageByteInfo {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: 'png' | 'jpg' | 'webp';
}

const IMAGE_BYTE_TYPES: ImageByteInfo[] = [
  { mimeType: 'image/png', extension: 'png' },
  { mimeType: 'image/jpeg', extension: 'jpg' },
  { mimeType: 'image/webp', extension: 'webp' },
];

export const PRIVATE_PROVIDER_HOST_ERROR = 'Provider 地址不允许访问本地或内网地址';
export const UNSUPPORTED_PROVIDER_URL_PROTOCOL_ERROR = 'Provider 图片地址协议不受支持';
const PROVIDER_REQUEST_TIMEOUT_MS = 60000;
// 这类值通常只是网关占位错误，不足以指导排障；如果还有更具体字段，优先返回具体字段。
const GENERIC_PROVIDER_ERROR_MESSAGES = new Set(['error', 'failed', 'unknown error', 'provider_error', 'openai_error']);

export function joinApiUrl(baseUrl: string, path: string): string {
  // 去掉首尾多余斜杠，避免用户填入 /v1/ 时拼接出双斜杠。
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function getImageExtension(mimeType: string): string {
  // 扩展名只用于落盘文件名，不信任原始上传文件名。
  return IMAGE_BYTE_TYPES.find((type) => type.mimeType === mimeType)?.extension ?? 'png';
}

export function extractProviderMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = record.error as Record<string, unknown> | undefined;

    const candidates = [
      error?.detail,
      error?.details,
      error?.reason,
      error?.message,
      record.detail,
      record.details,
      record.reason,
      record.message,
      record.error_description,
      record.msg,
      error?.code,
      error?.type,
      record.code,
      typeof record.error === 'string' ? record.error : undefined,
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);

    const specificMessage = candidates.find((message) => !GENERIC_PROVIDER_ERROR_MESSAGES.has(message.toLowerCase()));
    if (specificMessage) {
      return specificMessage;
    }

    if (candidates[0]) {
      return candidates[0];
    }
  }
  return fallback;
}

export function createProviderAbortSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS);
}

export function normalizeProviderError(error: unknown, fallback: string): never {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    throw new BadGatewayException('图片接口调用超时');
  }
  if (error instanceof Error && error.name === 'AbortError') {
    throw new BadGatewayException('图片接口调用超时');
  }
  throw error instanceof Error ? error : new BadGatewayException(fallback);
}

export function detectImageBytes(bytes: Buffer): ImageByteInfo | null {
  // 魔数校验覆盖当前落盘支持的 PNG、JPG、WEBP 三类图片格式。
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return IMAGE_BYTE_TYPES[0];
  }
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return IMAGE_BYTE_TYPES[1];
  }
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return IMAGE_BYTE_TYPES[2];
  }
  return null;
}

export function isSupportedImageBytes(bytes: Buffer): boolean {
  return detectImageBytes(bytes) !== null;
}

export function assertPublicProviderUrl(url: string): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new BadGatewayException(UNSUPPORTED_PROVIDER_URL_PROTOCOL_ERROR);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new BadGatewayException(UNSUPPORTED_PROVIDER_URL_PROTOCOL_ERROR);
  }
  if (isPrivateProviderHost(parsedUrl.hostname)) {
    throw new BadGatewayException(PRIVATE_PROVIDER_HOST_ERROR);
  }
}

export function isPrivateProviderHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
    return true;
  }
  if (isPrivateIpv6Host(normalizedHostname)) {
    return true;
  }

  return isPrivateIpv4Host(normalizedHostname);
}

// 本机回环地址：本地 API 中转（如 localhost:8317）可作 baseUrl，但仍禁止用作上游回传的图片下载地址。
export function isLoopbackProviderHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
    return true;
  }
  if (normalizedHostname === '::1') {
    return true;
  }

  const ipv4MappedPrefix = '::ffff:';
  if (normalizedHostname.startsWith(ipv4MappedPrefix)) {
    return isLoopbackIpv4Host(normalizedHostname.slice(ipv4MappedPrefix.length));
  }

  return isLoopbackIpv4Host(normalizedHostname);
}

function isLoopbackIpv4Host(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  // 仅放行 127.0.0.0/8，避免把 10/172/192 等局域网或元数据网段当成本地网关。
  return parts[0] === 127;
}

function isPrivateIpv4Host(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6Host(hostname: string): boolean {
  const ipv4MappedPrefix = '::ffff:';
  if (hostname.startsWith(ipv4MappedPrefix)) {
    return isPrivateIpv4Host(hostname.slice(ipv4MappedPrefix.length)) || isPrivateIpv4MappedHexHost(hostname.slice(ipv4MappedPrefix.length));
  }

  if (hostname === '::1') {
    return true;
  }

  const firstHextet = Number.parseInt(hostname.split(':')[0], 16);
  if (!Number.isInteger(firstHextet)) {
    return false;
  }

  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

function isPrivateIpv4MappedHexHost(hostname: string): boolean {
  const hextets = hostname.split(':');
  if (hextets.length !== 2) {
    return false;
  }

  const first = Number.parseInt(hextets[0], 16);
  const second = Number.parseInt(hextets[1], 16);
  if (!Number.isInteger(first) || !Number.isInteger(second) || first < 0 || first > 0xffff || second < 0 || second > 0xffff) {
    return false;
  }

  return isPrivateIpv4Host(`${first >> 8}.${first & 0xff}.${second >> 8}.${second & 0xff}`);
}
