import type { ClothingItem } from "@/types/clothing";

export function ClothingCard({ item }: { item: ClothingItem }) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">{item.name}</h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            item.available
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {item.available ? "Available" : "Unavailable"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
        <dt className="text-zinc-500">Category</dt>
        <dd>{item.category}</dd>
        <dt className="text-zinc-500">Color</dt>
        <dd>{item.color}</dd>
        <dt className="text-zinc-500">Season</dt>
        <dd>{item.season}</dd>
        <dt className="text-zinc-500">Formality</dt>
        <dd>{item.formality}</dd>
      </dl>
    </li>
  );
}
