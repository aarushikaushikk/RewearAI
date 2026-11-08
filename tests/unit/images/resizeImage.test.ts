import { describe, expect, it } from 'vitest';
import { fitWithin } from '@/lib/images/resizeImage';

describe('fitWithin', () => {
  it('keeps an image that already fits', () => {
    expect(fitWithin(1200, 900, 2000)).toEqual({ width: 1200, height: 900 });
  });

  it('scales a landscape phone photo by its width', () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it('scales a portrait phone photo by its height', () => {
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it('rounds to whole pixels', () => {
    expect(fitWithin(3000, 2001, 2000)).toEqual({ width: 2000, height: 1334 });
  });
});
