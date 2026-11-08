import {
  ACCEPTED_IMAGE_LABEL,
  AcceptedImageType,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_LABEL,
} from '@/types/upload';

export type ImageValidationResult =
  | { isValid: true; type: AcceptedImageType }
  | {
      isValid: false;
      code: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_TYPE';
      error: string;
    };

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** Identifies the image type from its leading bytes; the file name and declared type are untrusted. */
function detectImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) {
    return 'image/webp';
  }
  return null;
}

/**
 * Checks an uploaded file's size and contents. The browser checks the declared
 * type first for a quick message, but only this check is trusted.
 */
export function validateImageBytes(bytes: Uint8Array): ImageValidationResult {
  if (bytes.length === 0) {
    return { isValid: false, code: 'EMPTY_FILE', error: 'Choose an image to upload.' };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      isValid: false,
      code: 'FILE_TOO_LARGE',
      error: `This image is larger than ${MAX_IMAGE_LABEL}. Choose a smaller image.`,
    };
  }
  const type = detectImageType(bytes);
  if (!type) {
    return {
      isValid: false,
      code: 'UNSUPPORTED_TYPE',
      error: `This file type isn't supported. Choose a ${ACCEPTED_IMAGE_LABEL} image.`,
    };
  }
  return { isValid: true, type };
}
