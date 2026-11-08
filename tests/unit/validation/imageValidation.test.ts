import { describe, expect, it } from 'vitest';
import { validateImageBytes } from '@/lib/validation/imageValidation';
import { MAX_IMAGE_BYTES } from '@/types/upload';
import {
  GIF_BYTES,
  HEIC_BYTES,
  JPEG_BYTES,
  PDF_BYTES,
  PNG_BYTES,
  WEBP_BYTES,
  jpegOfSize,
} from '../../helpers/imageBytes';

const UNSUPPORTED = "This file type isn't supported. Choose a JPEG, PNG, or WebP image.";

describe('validateImageBytes', () => {
  it.each([
    ['JPEG', JPEG_BYTES, 'image/jpeg'],
    ['PNG', PNG_BYTES, 'image/png'],
    ['WebP', WEBP_BYTES, 'image/webp'],
  ])('accepts a %s image and reports its type', (_label, bytes, type) => {
    expect(validateImageBytes(bytes)).toEqual({ isValid: true, type });
  });

  it.each([
    ['GIF', GIF_BYTES],
    ['HEIC', HEIC_BYTES],
    ['PDF', PDF_BYTES],
  ])('rejects a %s file as unsupported', (_label, bytes) => {
    expect(validateImageBytes(bytes)).toEqual({
      isValid: false,
      code: 'UNSUPPORTED_TYPE',
      error: UNSUPPORTED,
    });
  });

  it('reads the file contents, so a PDF renamed to .jpg is still rejected', () => {
    expect(validateImageBytes(PDF_BYTES).isValid).toBe(false);
  });

  it('rejects an empty file', () => {
    expect(validateImageBytes(new Uint8Array())).toEqual({
      isValid: false,
      code: 'EMPTY_FILE',
      error: 'Choose an image to upload.',
    });
  });

  it('accepts an image exactly at the size limit', () => {
    expect(validateImageBytes(jpegOfSize(MAX_IMAGE_BYTES)).isValid).toBe(true);
  });

  it('rejects an image over the size limit', () => {
    expect(validateImageBytes(jpegOfSize(MAX_IMAGE_BYTES + 1))).toEqual({
      isValid: false,
      code: 'FILE_TOO_LARGE',
      error: 'This image is larger than 4 MB. Choose a smaller image.',
    });
  });
});
