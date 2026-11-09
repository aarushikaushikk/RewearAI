// Client-safe: no server imports.

interface NamedItem {
  name?: string | null;
  color: string;
  category: string;
}

/**
 * What to call an item in headings, links and alt text: its name, or its color
 * and category ("White Top") when it has none. Never invents other detail.
 */
export function itemDisplayName(item: NamedItem): string {
  return item.name?.trim() || `${item.color} ${item.category}`;
}
