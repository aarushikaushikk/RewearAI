'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NETWORK_ERROR_MESSAGE } from '@/components/auth/authFormErrors';
import { ExplanationPanel } from '@/components/outfits/ExplanationPanel';
import { FeedbackControl, parseOutfitFeedback } from '@/components/outfits/FeedbackControl';
import { MarkAsWornButton } from '@/components/outfits/MarkAsWornButton';
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
import { MAX_SHOWN_OUTFITS } from '@/lib/validation/outfitValidation';
import {
  OCCASIONS,
  PALETTES,
  type InsufficientReason,
  type Occasion,
  type OutfitExplanationDto,
  type OutfitItemDto,
  type OutfitRecommendationDto,
  type OutfitRole,
} from '@/types/outfit';
import { FORMALITIES, SEASONS } from '@/types/wardrobe';

/** A recommended item as received; its image is checked when shown, so it may be missing. */
type ShownItem = Omit<OutfitItemDto, 'image'> & { image?: { url?: unknown } };

/** The explanation is checked separately: an outfit without a usable one is still shown (US13). */
type GeneratedOutfit = Omit<Extract<OutfitRecommendationDto, { status: 'ok' }>, 'items' | 'explanation'> & {
  items: ShownItem[];
  explanation?: OutfitExplanationDto;
};

type ViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; outfit: GeneratedOutfit }
  | { status: 'insufficient'; occasion: Occasion; reason?: InsufficientReason }
  | { status: 'error'; message: string; sessionEnded?: boolean };

type ErrorState = Extract<ViewState, { status: 'error' }>;

/** A server answer: a view, or that every combination has been shown (US8). */
type Answer = ViewState | { status: 'no_alternative' };

/** Try another (US8): the current outfit stays on screen through every state. */
type AnotherState = { status: 'idle' } | { status: 'loading' } | { status: 'none' } | ErrorState;

const ROLE_LABELS: Record<OutfitRole, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

// US12: why generation stopped, shown after the general insufficient-wardrobe message.
const INSUFFICIENT_REASON_MESSAGES: Record<InsufficientReason, string> = {
  no_suitable_items: 'None of your available clothing is suitable for this occasion.',
  no_complete_outfit: 'An outfit needs a suitable top and bottom, or a suitable dress.',
};

/** A known reason, or undefined; own keys only, so names such as "toString" are rejected. */
function insufficientReason(value: unknown): InsufficientReason | undefined {
  return typeof value === 'string' && Object.hasOwn(INSUFFICIENT_REASON_MESSAGES, value)
    ? (value as InsufficientReason)
    : undefined;
}

const CHOOSE_OCCASION_MESSAGE = 'Choose an occasion to continue.';
const GENERATE_FAILED_MESSAGE = "We couldn't generate an outfit. Try again.";
const NO_ALTERNATIVE_MESSAGE = "There isn't another suitable combination right now.";

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
function answerFor(data: unknown, requested: Occasion): Answer {
  if (!isRecord(data) || data.occasion !== requested) {
    return { status: 'error', message: GENERATE_FAILED_MESSAGE };
  }
  if (data.status === 'insufficient') {
    return { status: 'insufficient', occasion: requested, reason: insufficientReason(data.reason) };
  }
  if (data.status === 'no_alternative') {
    return { status: 'no_alternative' };
  }
  if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0 && data.items.every(isOutfitItem)) {
    return {
      status: 'ok',
      outfit: {
        ...(data as GeneratedOutfit),
        explanation: parseExplanation(data.explanation),
        // US14: a malformed rating is shown as none rather than guessed.
        feedback: parseOutfitFeedback(data.feedback),
      },
    };
  }
  return { status: 'error', message: GENERATE_FAILED_MESSAGE };
}

/** A distinct, non-empty list of values from `allowed`; own entries only, so "toString" is rejected. */
function distinctOf<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) {
    return undefined;
  }
  return value.every((v) => typeof v === 'string' && (allowed as readonly string[]).includes(v)) ? (value as T[]) : undefined;
}

/**
 * The explanation facts (US13), or undefined when they're missing or can't be true. The outfit
 * is then shown without the panel: no explanation is better than a wrong one.
 */
function parseExplanation(value: unknown): OutfitExplanationDto | undefined {
  if (!isRecord(value) || typeof value.alternative !== 'boolean') {
    return undefined;
  }
  const formalities = distinctOf(value.formalities, FORMALITIES);
  const seasons = distinctOf(value.seasons, SEASONS);
  const palette = typeof value.palette === 'string' ? PALETTES.find((p) => p === value.palette) : undefined;
  if (!formalities || !seasons || !palette || seasons.filter((season) => season !== 'All-season').length > 1) {
    return undefined;
  }
  return { formalities, seasons, palette, alternative: value.alternative };
}

/** Asks for an outfit; with `shown` (US8), for one that isn't among those outfits. */
async function requestOutfit(body: { occasion: Occasion; shown?: string[][] }): Promise<Answer> {
  try {
    const response = await fetch('/api/outfits/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
      return answerFor(json?.data, body.occasion);
    }
    return {
      status: 'error',
      message: STATUS_MESSAGES[response.status] ?? GENERATE_FAILED_MESSAGE,
      sessionEnded: response.status === 401,
    };
  } catch {
    return { status: 'error', message: NETWORK_ERROR_MESSAGE };
  }
}

/**
 * Create Outfit (DESIGN §5.6, wireframe 08): choose an occasion, generate, review the
 * recommended items and why they were combined (US13), try another combination (US8), save the
 * outfit (US9), optionally mark it as worn (US10), and rate it Helpful or Not helpful (US14).
 */
export function CreateOutfitForm() {
  const [selected, setSelected] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [view, setView] = useState<ViewState>({ status: 'idle' });
  const [another, setAnother] = useState<AnotherState>({ status: 'idle' });
  // Blocks a second request before React re-renders the disabled button.
  const inFlight = useRef(false);
  // Item IDs of the outfits shown since Generate Outfit, sent so Try another doesn't repeat them.
  const shown = useRef<string[][]>([]);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  // The piece the current explanation features, and the one Try another should move on from.
  const featured = useRef<string | undefined>(undefined);
  const [rotateFrom, setRotateFrom] = useState<string | undefined>(undefined);
  const handleFeatured = useCallback((itemId: string) => {
    featured.current = itemId;
  }, []);
  const isLoading = view.status === 'loading';
  const isBusy = isLoading || another.status === 'loading';

  // Moves keyboard and screen reader users to the new outfit.
  useEffect(() => {
    if (view.status === 'ok') {
      resultHeading.current?.focus();
    }
  }, [view]);

  function show(next: ViewState) {
    if (next.status === 'ok') {
      shown.current = [...shown.current, next.outfit.items.map((item) => item.id)].slice(-MAX_SHOWN_OUTFITS);
    }
    setView(next);
  }

  function forgetShown() {
    shown.current = [];
    setAnother({ status: 'idle' });
  }

  async function generate(occasion: Occasion) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    forgetShown();
    setRotateFrom(undefined);
    setView({ status: 'loading' });

    const answer = await requestOutfit({ occasion });

    inFlight.current = false;
    // Nothing was shown yet, so "no alternative" can only be a faulty answer.
    show(answer.status === 'no_alternative' ? { status: 'error', message: GENERATE_FAILED_MESSAGE } : answer);
  }

  async function tryAnother(occasion: Occasion) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setAnother({ status: 'loading' });

    const answer = await requestOutfit({ occasion, shown: shown.current });

    inFlight.current = false;
    if (answer.status === 'no_alternative') {
      setAnother({ status: 'none' });
    } else if (answer.status === 'error') {
      setAnother(answer);
    } else {
      setAnother({ status: 'idle' });
      setRotateFrom(featured.current);
      show(answer);
    }
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
    forgetShown();
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
            disabled={isBusy}
          />
        </div>
        {/* Aligns the button with the select, below its label, on wider screens. */}
        <div className="sm:pt-6">
          <PrimaryButton isLoading={isLoading} disabled={isBusy} className="sm:w-auto">
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
          {view.reason && <p className="text-text">{INSUFFICIENT_REASON_MESSAGES[view.reason]}</p>}
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
          {view.outfit.explanation && (
            <ExplanationPanel
              occasion={view.outfit.occasion}
              explanation={view.outfit.explanation}
              items={view.outfit.items}
              previousFeatured={view.outfit.explanation.alternative ? rotateFrom : undefined}
              onFeatured={handleFeatured}
            />
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={() => void tryAnother(view.outfit.occasion)}
              disabled={another.status === 'loading'}
              aria-busy={another.status === 'loading' || undefined}
              className={`${SECONDARY_ACTION} self-start disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Try another
            </button>
            {/* Keyed by its items, so each new outfit starts unsaved. */}
            <SaveOutfitButton
              key={view.outfit.items.map((item) => item.id).join()}
              occasion={view.outfit.occasion}
              itemIds={view.outfit.items.map((item) => item.id)}
            />
          </div>
          <MarkAsWornButton
            key={`worn-${view.outfit.items.map((item) => item.id).join()}`}
            itemIds={view.outfit.items.map((item) => item.id)}
            occasion={view.outfit.occasion}
          />
          {/* Keyed by its items, so each new outfit starts from its own saved rating. */}
          <FeedbackControl
            key={`feedback-${view.outfit.items.map((item) => item.id).join()}`}
            occasion={view.outfit.occasion}
            itemIds={view.outfit.items.map((item) => item.id)}
            initial={view.outfit.feedback}
          />
          {another.status === 'none' && (
            <p role="status" className="text-text">
              {NO_ALTERNATIVE_MESSAGE}
            </p>
          )}
          {another.status === 'error' && (
            <div className="flex flex-col gap-3">
              <Alert variant="error" message={another.message} focusOnMount />
              {another.sessionEnded && (
                <Link href={SIGN_IN_SESSION_ENDED_PATH} className={`${SECONDARY_ACTION} self-start`}>
                  Sign in
                </Link>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
