import type { Metadata } from "next";
import { checkSectionAccess } from "@/lib/section-gate";
import { SectionUnavailable } from "@/components/layout/SectionUnavailable";
import { BingoNightDisplay } from "@/components/bingo-night/BingoNightDisplay";

export const metadata: Metadata = { title: "Bingo Night: Stream View" };
export const dynamic = "force-dynamic";

export default async function BingoNightDisplayPage() {
  if (!(await checkSectionAccess("bingo_night"))) return <SectionUnavailable />;
  return <BingoNightDisplay />;
}
