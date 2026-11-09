'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SelectField } from '@/components/ui/SelectField';
import {
  focusFirstInvalidField,
  getDeleteErrorMessage,
  getLoadErrorMessage,
  getUpdateErrorMessage,
  LOAD_ITEM_FAILED_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '@/components/wardrobe/wardrobeFormErrors';
import { ItemDetailsInput, validateItemDetails } from '@/lib/validation/wardrobeValidation';
import { itemDisplayName } from '@/lib/wardrobe/itemDisplayName';
import { CATEGORIES, COLORS, FORMALITIES, SEASONS, WardrobeItemDto } from '@/types/wardrobe';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; error: string }
  | { status: 'loaded'; item: WardrobeItemDto };

type Details = Required<ItemDetailsInput>;
type Message = { variant: 'success' | 'error'; text: string };

const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 text-base font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const WARDROBE_DELETED_PATH = '/wardrobe?deleted=1';

function detailsOf(item: WardrobeItemDto): Details {
  return {
    name: item.name ?? '',
    category: item.category,
    color: item.color,
    style: item.style,
    season: item.season,
    formality: item.formality,
  };
}

function itemUrl(itemId: string): string {
  return `/api/wardrobe/${encodeURIComponent(itemId)}`;
}

/**
 * Clothing Detail / Edit (DESIGN §5.5, wireframe 04, US4). Loads one of the
 * user's items, saves edited details with the Add Clothing rules, and deletes
 * the item and its photo after confirmation. Availability is shown here; changing
 * it is US6 (#11).
 */
export function ClothingDetail({ itemId }: { itemId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch(itemUrl(itemId), { headers: { Accept: 'application/json' } });
      if (response.status === 404) {
        setState({ status: 'missing' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'failed', error: getLoadErrorMessage(response.status, LOAD_ITEM_FAILED_MESSAGE) });
        return;
      }
      const { data } = (await response.json()) as { data: WardrobeItemDto };
      setState({ status: 'loaded', item: data });
    } catch {
      setState({ status: 'failed', error: LOAD_ITEM_FAILED_MESSAGE });
    }
  }, [itemId]);

  useEffect(() => {
    // Loading on mount is this effect's purpose; the state it sets comes from the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/wardrobe"
        className="inline-flex min-h-11 w-fit items-center text-base font-medium text-primary underline underline-offset-4 hover:no-underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
      >
        Back to My Wardrobe
      </Link>
      <DetailContent state={state} onRetry={() => void load()} />
    </div>
  );
}

function DetailContent({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" className="text-text-muted">
          Loading this item…
        </p>
      );
    case 'missing':
      return (
        <section aria-labelledby="missing-heading" className="flex flex-col items-start gap-3">
          <h1 id="missing-heading" className="text-[1.75rem] md:text-3xl font-bold text-text">
            We couldn&apos;t find this clothing item
          </h1>
          <p className="text-text-muted">It may have been deleted, or the link may be wrong.</p>
        </section>
      );
    case 'failed':
      return (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error" message={state.error} />
          <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
            Retry
          </button>
        </div>
      );
    default:
      return <ClothingEditor key={state.item.id} initialItem={state.item} />;
  }
}

function ClothingEditor({ initialItem }: { initialItem: WardrobeItemDto }) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [details, setDetails] = useState<Details>(() => detailsOf(initialItem));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const name = itemDisplayName(item);
  const busy = isSaving || isDeleting;

  function setDetail(field: keyof Details, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    const validation = validateItemDetails(details);
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      focusFirstInvalidField(validation.errors);
      return;
    }
    setFieldErrors({});

    setIsSaving(true);
    try {
      const response = await fetch(itemUrl(item.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify(details),
      });
      if (response.ok) {
        const { data } = (await response.json()) as { data: WardrobeItemDto };
        setItem(data);
        setDetails(detailsOf(data));
        setMessage({ variant: 'success', text: 'Changes saved.' });
      } else {
        // The edits stay in the form so the user can retry.
        setMessage({ variant: 'error', text: getUpdateErrorMessage(response.status) });
      }
    } catch {
      setMessage({ variant: 'error', text: NETWORK_ERROR_MESSAGE });
    }
    setIsSaving(false);
  }

  async function handleDelete() {
    setIsDeleting(true);
    let errorText: string;
    try {
      const response = await fetch(itemUrl(item.id), {
        method: 'DELETE',
        headers: { Origin: window.location.origin },
      });
      // 404: it is already gone, which is what the user asked for.
      if (response.ok || response.status === 404) {
        router.push(WARDROBE_DELETED_PATH);
        router.refresh();
        return;
      }
      errorText = getDeleteErrorMessage(response.status);
    } catch {
      errorText = NETWORK_ERROR_MESSAGE;
    }
    setIsDeleting(false);
    setConfirmingDelete(false);
    setMessage({ variant: 'error', text: errorText });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
      <div className="relative h-72 w-full overflow-hidden rounded-xl border border-border bg-background md:h-auto md:aspect-[4/5]">
        <Image
          src={item.image.url}
          alt={name}
          fill
          sizes="(min-width: 768px) 40vw, 100vw"
          className="object-contain"
          priority
        />
      </div>

      <form
        onSubmit={handleSave}
        noValidate
        aria-labelledby="item-heading"
        className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
      >
        <h1 id="item-heading" className="text-[1.75rem] md:text-3xl font-bold text-text break-words">
          {name}
        </h1>

        {message && (
          <Alert
            key={message.text}
            variant={message.variant}
            message={message.text}
            onDismiss={() => setMessage(null)}
            focusOnMount
          />
        )}

        <FormField
          id="name"
          label="Name"
          type="text"
          value={details.name}
          onChange={(e) => setDetail('name', e.target.value)}
          optional
          error={fieldErrors.name}
          disabled={busy}
          placeholder={`e.g. ${item.color} ${item.category}`}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="category"
            label="Category"
            value={details.category}
            options={CATEGORIES}
            onChange={(v) => setDetail('category', v)}
            required
            error={fieldErrors.category}
            disabled={busy}
          />
          <SelectField
            id="color"
            label="Color"
            value={details.color}
            options={COLORS}
            onChange={(v) => setDetail('color', v)}
            required
            error={fieldErrors.color}
            disabled={busy}
          />
          <FormField
            id="style"
            label="Style"
            type="text"
            value={details.style}
            onChange={(e) => setDetail('style', e.target.value)}
            required
            error={fieldErrors.style}
            disabled={busy}
            placeholder="e.g. Button-down"
          />
          <SelectField
            id="season"
            label="Season"
            value={details.season}
            options={SEASONS}
            onChange={(v) => setDetail('season', v)}
            required
            error={fieldErrors.season}
            disabled={busy}
          />
          <SelectField
            id="formality"
            label="Formality"
            value={details.formality}
            options={FORMALITIES}
            onChange={(v) => setDetail('formality', v)}
            required
            error={fieldErrors.formality}
            disabled={busy}
          />
        </div>

        <p className="flex items-center gap-3 text-base text-text">
          <span className="font-medium">Availability</span>
          <span
            className={[
              'inline-flex items-center rounded-full border px-3 py-0.5 text-sm',
              item.isAvailable
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-text-muted bg-surface text-text-muted',
            ].join(' ')}
          >
            {item.isAvailable ? 'Available' : 'Unavailable'}
          </span>
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-danger bg-surface px-4 text-base font-medium text-danger hover:bg-danger-soft focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:order-first sm:mr-auto"
          >
            Delete item
          </button>
          <PrimaryButton isLoading={isSaving} disabled={isDeleting} className="sm:w-auto">
            Save changes
          </PrimaryButton>
        </div>
      </form>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this clothing item?"
        message={`This removes ${name} and its photo from your wardrobe. This can't be undone.`}
        confirmLabel="Delete clothing item"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingDelete(false)}
        isWorking={isDeleting}
      />
    </div>
  );
}
