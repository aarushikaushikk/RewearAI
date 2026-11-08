import { ACCEPTED_IMAGE_LABEL, MAX_IMAGE_LABEL } from '@/types/upload';

export { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';

export const UNSUPPORTED_TYPE_MESSAGE = `This file type isn't supported. Choose a ${ACCEPTED_IMAGE_LABEL} image.`;
export const TOO_LARGE_MESSAGE = `This image is larger than ${MAX_IMAGE_LABEL}. Choose a smaller image.`;

const UPLOAD_FAILED_MESSAGE = "Your image didn't upload. Please try again.";
const SAVE_FAILED_MESSAGE = "We couldn't save this item. Try again.";

// Messages are chosen here rather than shown from the response, so server text
// can never reach the user.
const SHARED_STATUS_MESSAGES: Record<number, string> = {
  401: 'Your session has ended. Sign in again to continue.',
  403: "We couldn't verify this request. Refresh the page and try again.",
  503: 'Service temporarily unavailable. Please try again later.',
};

const UPLOAD_STATUS_MESSAGES: Record<number, string> = {
  ...SHARED_STATUS_MESSAGES,
  400: 'Choose an image to upload.',
  413: TOO_LARGE_MESSAGE,
  415: UNSUPPORTED_TYPE_MESSAGE,
};

const SAVE_STATUS_MESSAGES: Record<number, string> = {
  ...SHARED_STATUS_MESSAGES,
  400: 'Review or correct the highlighted details before saving.',
  404: "We couldn't find that image. Please upload it again.",
};

export function getUploadErrorMessage(status: number): string {
  return UPLOAD_STATUS_MESSAGES[status] ?? UPLOAD_FAILED_MESSAGE;
}

/** Wrong type or too large: sending the same photo again cannot succeed. */
export function isRetryableUploadStatus(status: number): boolean {
  return status !== 400 && status !== 413 && status !== 415;
}

export function getSaveErrorMessage(status: number): string {
  return SAVE_STATUS_MESSAGES[status] ?? SAVE_FAILED_MESSAGE;
}

/** Field ids match the error keys, in the order the fields appear on screen. */
const FIELD_ORDER = ['category', 'color', 'style', 'season', 'formality'];

export function focusFirstInvalidField(errors: Record<string, string>): void {
  const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
  if (firstInvalid) {
    document.getElementById(firstInvalid)?.focus();
  }
}
