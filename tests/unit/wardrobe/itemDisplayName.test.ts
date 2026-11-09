import { describe, expect, it } from 'vitest';
import { itemDisplayName } from '@/lib/wardrobe/itemDisplayName';

// The heading and alt text for an item (wireframe 04): its name, or color and category.
describe('itemDisplayName', () => {
  it("uses the item's name when it has one", () => {
    expect(itemDisplayName({ name: 'White Oxford Shirt', color: 'White', category: 'Top' })).toBe(
      'White Oxford Shirt',
    );
  });

  it.each([undefined, null, '', '   '])('builds "Color Category" when the name is %j', (name) => {
    expect(itemDisplayName({ name, color: 'White', category: 'Top' })).toBe('White Top');
  });

  it('trims a name', () => {
    expect(itemDisplayName({ name: '  Blue Jeans ', color: 'Blue', category: 'Bottom' })).toBe(
      'Blue Jeans',
    );
  });
});
