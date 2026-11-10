import { WordListsEditor } from "@/components/admin/bingo-night/WordListsEditor";

export default function BingoNightWordListsPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-gnome-green mb-1">Bingo Night Word Lists</h1>
      <p className="text-bark-brown-light mb-6">
        The word lists hosts can pick for a word game of Bingo Night. A game copies its list when it&apos;s saved, so changing or deleting a list here never changes a
        game that&apos;s already set up or live. To use your changes in a game you&apos;ve already set up, open the game and save it again.
      </p>
      <WordListsEditor />
    </div>
  );
}
