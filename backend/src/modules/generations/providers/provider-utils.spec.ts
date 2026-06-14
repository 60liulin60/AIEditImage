import { BadGatewayException } from '@nestjs/common';
import {
  assertPublicProviderUrl,
  detectImageBytes,
  extractProviderMessage,
  isPrivateProviderHost,
  PRIVATE_PROVIDER_HOST_ERROR,
  UNSUPPORTED_PROVIDER_URL_PROTOCOL_ERROR,
} from './provider-utils';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_BYTES = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary');

describe('provider-utils', () => {
  it('detects supported image bytes by magic number', () => {
    expect(detectImageBytes(PNG_BYTES)?.mimeType).toBe('image/png');
    expect(detectImageBytes(JPEG_BYTES)?.mimeType).toBe('image/jpeg');
    expect(detectImageBytes(WEBP_BYTES)?.mimeType).toBe('image/webp');
    expect(detectImageBytes(Buffer.from('<svg></svg>'))).toBeNull();
  });

  it('detects private IPv4 and IPv6 provider hosts', () => {
    expect(isPrivateProviderHost('localhost')).toBe(true);
    expect(isPrivateProviderHost('127.0.0.1')).toBe(true);
    expect(isPrivateProviderHost('169.254.169.254')).toBe(true);
    expect(isPrivateProviderHost('[::1]')).toBe(true);
    expect(isPrivateProviderHost('fe90::1')).toBe(true);
    expect(isPrivateProviderHost('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateProviderHost('api.openai.com')).toBe(false);
  });

  it('rejects malformed and private provider image URLs', () => {
    expect(() => assertPublicProviderUrl('not-a-url')).toThrow(BadGatewayException);
    expect(() => assertPublicProviderUrl('not-a-url')).toThrow(UNSUPPORTED_PROVIDER_URL_PROTOCOL_ERROR);
    expect(() => assertPublicProviderUrl('file:///etc/passwd')).toThrow(UNSUPPORTED_PROVIDER_URL_PROTOCOL_ERROR);
    expect(() => assertPublicProviderUrl('http://[::ffff:127.0.0.1]/image.png')).toThrow(PRIVATE_PROVIDER_HOST_ERROR);
  });

  it('prefers specific provider details over generic openai_error placeholders', () => {
    expect(
      extractProviderMessage(
        {
          error: {
            message: 'openai_error',
            detail: 'image field is required',
          },
        },
        'fallback',
      ),
    ).toBe('image field is required');

    expect(extractProviderMessage({ error: 'openai_error' }, 'fallback')).toBe('openai_error');
  });
});
