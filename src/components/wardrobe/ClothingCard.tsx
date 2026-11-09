import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { itemDisplayName } from '@/lib/wardrobe/itemDisplayName';
import type { WardrobeItemDto } from '@/types/wardrobe';

interface ClothingCardProps {
  item: WardrobeItemDto;
}

/**
 * One item in My Wardrobe (wireframe 03): the 4:5 photo, its name, and its
 * availability as text. The whole card opens the item's details.
 */
export function ClothingCard({ item }: ClothingCardProps) {
  const name = itemDisplayName(item);

  return (
    <Link
      href={`/wardrobe/${encodeURIComponent(item.id)}`}
      className="group flex h-full flex-col gap-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-border bg-background">
        <Image
          src={item.image.url}
          alt={name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-contain"
        />
      </div>
      <span className="font-semibold text-text group-hover:text-primary break-words">{name}</span>
      <span
        className={[
          'inline-flex w-fit items-center rounded-full border px-3 py-0.5 text-sm',
          item.isAvailable
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-text-muted bg-surface text-text-muted',
        ].join(' ')}
      >
        {item.isAvailable ? 'Available' : 'Unavailable'}
      </span>
    </Link>
  );
}
