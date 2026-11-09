import { BingoNightGames } from "@/components/admin/bingo-night/BingoNightGames";

export default function BingoNightAdminPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-gnome-green mb-1">Bingo Night</h1>
      <p className="text-bark-brown-light mb-6">
        Live bingo anyone can play at gn0mehome.com/bingo-night, no account needed. Set up a game here, launch it when the event starts, then call it from the host
        console and screen-share the stream view in Discord.
      </p>
      <BingoNightGames />
    </div>
  );
}
