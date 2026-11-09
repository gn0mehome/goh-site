import { BingoNightConsole } from "@/components/admin/bingo-night/BingoNightConsole";

export default async function BingoNightConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BingoNightConsole id={id} />;
}
