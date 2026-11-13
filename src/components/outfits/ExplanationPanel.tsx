'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { displayName } from '@/components/outfits/outfitDisplay';
import { ALLOWED_IMAGE_HOST } from '@/components/outfits/OutfitItemImage';
import { getBrowserClassifier } from '@/services/classification/browser/getBrowserClassifier';
import { isClassifierModelCached } from '@/services/classification/browser/modelCache';
import { reasonLine } from '@/services/outfits/explanationText';
import { scoreOutfitPhotos } from '@/services/stylist/browser/scoreOutfitPhotos';
import { composeStylistNote, type StylistItem, type StylistNote } from '@/services/stylist/composeStylistNote';
import type { Occasion, OutfitExplanationDto, OutfitRole } from '@/types/outfit';
import type { Color } from '@/types/wardrobe';

/** What the panel needs from each recommended item; its photo may be missing. */
export interface ExplainedItem {
  id: string;
  role: OutfitRole;
  name: string | null;
  color: Color;
  style: string;
  image?: { url?: unknown };
}

interface ExplanationPanelProps {
  occasion: Occasion;
  explanation: OutfitExplanationDto;
  items: readonly ExplainedItem[];
  /** The piece featured in the previous outfit, so Try another features a different one. */
  previousFeatured?: string;
  /** Told which piece this note features. */
  onFeatured?: (itemId: string) => void;
}

const DISCLOSURE = 'Styling note chosen with on-device AI from your saved item details and photos.';

/** Only photos from the wardrobe's own image host are given to the model. */
function photoUrl(item: ExplainedItem): string | undefined {
  const url = item.image?.url;
  if (typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === ALLOWED_IMAGE_HOST ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why these items? (US13, DESIGN §5.6): a factual reason line and a two-sentence stylist note.
 * The note is built at once from saved metadata. If US3's photo model is already downloaded,
 * it may then refine the wording and featured piece, never contradicting saved styles; the
 * disclosure appears only when it did. Any model failure keeps the basic note silently.
 */
export function ExplanationPanel({ occasion, explanation, items, previousFeatured, onFeatured }: ExplanationPanelProps) {
  const headingId = useId();
  const stylistItems = useMemo<StylistItem[]>(
    () => items.map((item) => ({ id: item.id, role: item.role, name: displayName(item), color: item.color, style: item.style })),
    [items],
  );
  const palette = explanation.palette;
  const basic = useMemo(
    () => composeStylistNote(stylistItems, palette, { previousFeatured }),
    [stylistItems, palette, previousFeatured],
  );
  const [refined, setRefined] = useState<{ for: StylistNote; note: StylistNote } | null>(null);
  // Ignores photo scores for an outfit that has since been replaced.
  const attempt = useRef(0);

  useEffect(() => {
    const id = ++attempt.current;
    const photos = items.map((item) => ({ id: item.id, role: item.role, url: photoUrl(item) }));
    void (async () => {
      if (!(await isClassifierModelCached())) return;
      const scores = await scoreOutfitPhotos(photos, getBrowserClassifier());
      if (id !== attempt.current || !scores) return;
      const note = composeStylistNote(stylistItems, palette, { scores, previousFeatured });
      if (note.aiAssisted) setRefined({ for: basic, note });
    })();
  }, [items, stylistItems, palette, previousFeatured, basic]);

  const note = refined?.for === basic ? refined.note : basic;

  useEffect(() => {
    onFeatured?.(note.featuredId);
  }, [note.featuredId, onFeatured]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h3 id={headingId} className="text-lg font-semibold text-text">
        Why these items?
      </h3>
      <p className="text-text">
        {reasonLine(occasion, explanation, items.map((item) => item.color))}
      </p>
      <div aria-live="polite" className="flex flex-col gap-2">
        <p className="text-text">
          <span>{note.mood}</span> <span>{note.piece}</span>
        </p>
        {note.aiAssisted && (
          <p className="text-sm text-text-muted">
            <span aria-hidden="true">✦ </span>
            {DISCLOSURE}
          </p>
        )}
      </div>
    </section>
  );
}
