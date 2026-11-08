// Minimal file signatures for image validation tests; not decodable images.

function withPadding(signature: number[], length = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  bytes.set(signature);
  return bytes;
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

export const JPEG_BYTES = withPadding([0xff, 0xd8, 0xff, 0xe0]);
export const PNG_BYTES = withPadding([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const WEBP_BYTES = withPadding([...ascii('RIFF'), 0x24, 0x00, 0x00, 0x00, ...ascii('WEBP')]);
export const GIF_BYTES = withPadding(ascii('GIF89a'));
export const HEIC_BYTES = withPadding([0x00, 0x00, 0x00, 0x18, ...ascii('ftypheic')]);
export const PDF_BYTES = withPadding(ascii('%PDF-1.7'));

/** A JPEG signature padded to `length` bytes, for size-limit tests. */
export function jpegOfSize(length: number): Uint8Array<ArrayBuffer> {
  return withPadding([0xff, 0xd8, 0xff, 0xe0], length);
}
