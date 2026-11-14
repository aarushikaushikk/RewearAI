// US13: scores an outfit's photos with US3's on-device classifier, for composeStylistNote.
// Client-only. Photos are read by the model worker and never leave the browser.

import type { PhotoScores } from '@/services/stylist/composeStylistNote';
import { stylistLabels } from '@/services/stylist/stylistLibrary';
import type { ZeroShotImageClassifier } from '@/types/classification';
import type { OutfitRole } from '@/types/outfit';

/** About 60 ms per photo on a laptop CPU in the spike; past this, the basic note stays. */
export const DEFAULT_SCORING_BUDGET_MS = 10_000;

/**
 * Scores each piece that has a photo against its role's fixed label set. A photo that fails is
 * skipped; null means nothing could be scored in time, so the caller keeps the basic note.
 */
export async function scoreOutfitPhotos(
  items: readonly { id: string; role: OutfitRole; url?: string }[],
  classifier: ZeroShotImageClassifier | null,
  { timeoutMs = DEFAULT_SCORING_BUDGET_MS }: { timeoutMs?: number } = {},
): Promise<PhotoScores | null> {
  if (!classifier) {
    return null;
  }
  const score = async (): Promise<PhotoScores | null> => {
    const scores = new Map<string, Map<string, number>>();
    // One at a time: the worker runs requests in order anyway.
    for (const item of items) {
      if (!item.url) continue;
      try {
        const asked = stylistLabels(item.role);
        const known = new Set(asked);
        const labels = new Map<string, number>();
        for (const { label, score: value } of await classifier(item.url, asked)) {
          if (known.has(label) && Number.isFinite(value)) labels.set(label, value);
        }
        if (labels.size > 0) scores.set(item.id, labels);
      } catch {
        // This photo couldn't be read or scored; the other pieces still count.
      }
    }
    return scores.size > 0 ? scores : null;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([score(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
