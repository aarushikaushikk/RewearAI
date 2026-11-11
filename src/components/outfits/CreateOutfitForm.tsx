'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import {
  displayName,
  OCCASION_LABELS,
  SECONDARY_ACTION,
  SIGN_IN_SESSION_ENDED_PATH,
} from '@/components/outfits/outfitDisplay';
import { OutfitItemImage } from '@/components/outfits/OutfitItemImage';
import { SaveOutfitButton } from '@/components/outfits/SaveOutfitButton';
import { Alert } from '@/components/ui/Alert';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectField } from '@/components/ui/SelectField';
import {
  OCCASIONS,
  type Occasion,
  type OutfitItemDto,
  type OutfitRecommendationDto,
  type OutfitRole,
} from '@/types/outfit';

/** A recommended item as received; its image is checked when shown, so it may be missing. */
type ShownItem = Omit<OutfitItemDto, 'image'> & { image?: { url?: unknown } };

type GeneratedOutfit = Omit<Extract<OutfitRecommendationDto, { status: 'ok' }>, 'items'> & { items: ShownItem[] };

type ViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; outfit: GeneratedOutfit }
  | { status: 'insufficient'; occasion: Occasion }
  | { status: 'error'; message: string; sessionEnded?: boolean };

const ROLE_LABELS: Record<OutfitRole, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

const CHOOSE_OCCASION_MESSAGE = 'Choose an occasion to continue.';
const GENERATE_FAILED_MESSAGE = "We couldn't generate an outfit. Try again.";

// Messages are chosen here, never taken from the response, so server text can't reach the user.
const STATUS_MESSAGES: Record<number, string> = {
  400: CHOOSE_OCCASION_MESSAGE,
  401: 'Your session has ended. Sign in again to continue.',
  403: "We couldn't verify this request. Refresh the page and try again.",
  503: 'Service temporarily unavailable. Please try again later.',
};

const occasionFromLabel = (label: string): Occasion | undefined =>
  OCCASIONS.find((occasion) => OCCASION_LABELS[occasion] === label);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks what's needed to name and label an item. The role must be one of ROLE_LABELS' own
 * keys, so inherited names such as "toString" are rejected. A missing or unusable image is
 * allowed: OutfitItemImage shows a placeholder for it.
 */
function isOutfitItem(value: unknown): value is ShownItem {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.role === 'string' &&
    Object.hasOwn(ROLE_LABELS, value.role) &&
    (value.image === undefined || isRecord(value.image)) &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.color === 'string' &&
    typeof value.style === 'string'
  );
}

/** Accepts only a well-formed answer for the occasion that was requested. */
function viewFor(data: unknown, requested: Occasion): ViewState {
  if (!isRecord(data) || data.occasion !== requested) {
    return { status: 'error', message: GENERATE_FAILED_MESSAGE };
  }
  if (data.status === 'insufficient') {
    return { status: 'insufficient', occasion: requested };
  }
  if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0 && data.items.every(isOutfitItem)) {
    return { status: 'ok', outfit: data as GeneratedOutfit };
  }
  return { status: 'error', message: GENERATE_FAILED_MESSAGE };
}

/**
 * Create Outfit (DESIGN §5.6, wireframe 08): choose an occasion, generate, and review the
 * recommended items, and save the outfit (US9). Mark as worn, Try another and feedback
 * belong to later stories.
 */
export function CreateOutfitForm() {
  const [selected, setSelected] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [view, setView] = useState<ViewState>({ status: 'idle' });
  // Blocks a second request before React re-renders the disabled button.
  const inFlight = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const isLoading = view.status === 'loading';

  // Moves keyboard and screen reader users to the new outfit.
  useEffect(() => {
    if (view.status === 'ok') {
      resultHeading.current?.focus();
    }
  }, [view]);

  async function generate(occasion: Occasion) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setView({ status: 'loading' });

    let next: ViewState;
    try {
      const response = await fetch('/api/outfits/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ occasion }),
      });
      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
        next = viewFor(body?.data, occasion);
      } else {
        next = {
          status: 'error',
          message: STATUS_MESSAGES[response.status] ?? GENERATE_FAILED_MESSAGE,
          sessionEnded: response.status === 401,
        };
      }
    } catch {
      next = { status: 'error', message: NETWORK_ERROR_MESSAGE };
    }

    inFlight.current = false;
    setView(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const occasion = occasionFromLabel(selected);
    if (!occasion) {
      setFieldError(CHOOSE_OCCASION_MESSAGE);
      document.getElementById('occasion')?.focus();
      return;
    }
    setFieldError(undefined);
    void generate(occasion);
  }

  function handleOccasionChange(label: string) {
    setSelected(label);
    setFieldError(undefined);
    // A result for the previous occasion would be misleading next to the new choice.
    setView({ status: 'idle' });
  }

  const occasion = occasionFromLabel(selected);

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label="Choose an occasion"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-start sm:p-6"
      >
        <div className="flex-1">
          <SelectField
            id="occasion"
            label="Occasion"
            value={selected}
            options={OCCASIONS.map((o) => OCCASION_LABELS[o])}
            onChange={handleOccasionChange}
            required
            error={fieldError}
            disabled={isLoading}
          />
        </div>
        {/* Aligns the button with the select, below its label, on wider screens. */}
        <div className="sm:pt-6">
          <PrimaryButton isLoading={isLoading} className="sm:w-auto">
            Generate Outfit
          </PrimaryButton>
        </div>
      </form>

      {view.status === 'error' && (
        <div className="flex flex-col gap-3">
          <Alert variant="error" message={view.message} focusOnMount />
          {/* Retrying can't succeed once the session has ended, so offer Sign in instead. */}
          {view.sessionEnded ? (
            <Link href={SIGN_IN_SESSION_ENDED_PATH} className={`${SECONDARY_ACTION} self-start`}>
              Sign in
            </Link>
          ) : (
            occasion && (
              <button
                type="button"
                onClick={() => void generate(occasion)}
                className={`${SECONDARY_ACTION} self-start`}
              >
                Try again
              </button>
            )
          )}
        </div>
      )}

      {view.status === 'insufficient' && (
        <section role="status" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <p className="text-text">
            There aren&apos;t enough available items for a {view.occasion} outfit yet.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/wardrobe" className={SECONDARY_ACTION}>
              View wardrobe
            </Link>
            <Link href="/wardrobe/new" className={SECONDARY_ACTION}>
              Add clothing
            </Link>
          </div>
        </section>
      )}

      {view.status === 'ok' && (
        <section aria-labelledby="outfit-heading" className="flex flex-col gap-4">
          <h2
            id="outfit-heading"
            ref={resultHeading}
            tabIndex={-1}
            className="text-xl md:text-2xl font-semibold text-text"
          >
            Your outfit for {OCCASION_LABELS[view.outfit.occasion]}
          </h2>
          <ul aria-label="Items in this outfit" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {view.outfit.items.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="relative aspect-[4/5] bg-background">
                  <OutfitItemImage
                    // A new URL gets a fresh attempt, even if an earlier photo failed to load.
                    key={String(item.image?.url)}
                    url={item.image?.url}
                    name={displayName(item)}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                </div>
                <div className="p-3">
                  <p className="font-semibold text-text">{displayName(item)}</p>
                  <p className="text-sm text-text-muted">{ROLE_LABELS[item.role]}</p>
                </div>
              </li>
            ))}
          </ul>
          {/* Generating again unmounts this section, so each new outfit starts unsaved. */}
          <SaveOutfitButton occasion={view.outfit.occasion} itemIds={view.outfit.items.map((item) => item.id)} />
        </section>
      )}
    </div>
  );
}
