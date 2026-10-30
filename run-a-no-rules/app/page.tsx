import WardrobeBrowser from "@/components/WardrobeBrowser";
import { clothingItems } from "@/data/clothing";

export default function WardrobePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">ReWear — My Wardrobe</h1>
      <WardrobeBrowser items={clothingItems} />
    </main>
  );
}
