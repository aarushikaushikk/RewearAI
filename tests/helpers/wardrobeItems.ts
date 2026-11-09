import type { WardrobeItemDto } from '@/types/wardrobe';

export function itemDto(overrides: Partial<WardrobeItemDto> = {}): WardrobeItemDto {
  const id = overrides.id ?? 'item_1';
  return {
    id,
    image: {
      url: `https://res.cloudinary.com/test/image/upload/v1/rewear/users/u1/${id}.jpg`,
      publicId: `rewear/users/u1/${id}`,
    },
    name: 'White Oxford Shirt',
    category: 'Top',
    color: 'White',
    style: 'Classic',
    season: 'All-season',
    formality: 'Smart casual',
    isAvailable: true,
    createdAt: '2026-11-08T10:00:00.000Z',
    updatedAt: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}
