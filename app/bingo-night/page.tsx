import type { Metadata } from "next";
import { checkSectionAccess } from "@/lib/section-gate";
import { SectionUnavailable } from "@/components/layout/SectionUnavailable";
import { BingoNightPlayer } from "@/components/bingo-night/BingoNightPlayer";

export const metadata: Metadata = {
  title: "Bingo Night",
  description: "Play Gn0me Home Bingo Night live: type your RSN, get a card and shout BINGO. No account needed.",
};

export const dynamic = "force-dynamic";

export default async function BingoNightPage() {
  if (!(await checkSectionAccess("bingo_night"))) return <SectionUnavailable />;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      <BingoNightPlayer />
    </div>
  );
}
