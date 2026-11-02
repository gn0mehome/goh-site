import { DISCORD_SERVER_ID } from "@/lib/constants";

/**
 * Discord's live server widget: who's online, voice channels and a Join
 * button. Loaded lazily, in a gold frame that matches the hero.
 */
export function DiscordWidget({ height = 460, className = "" }: { height?: number; className?: string }) {
  return (
    <div className={`rounded-xl border-2 border-gold/70 bg-[#2b2d31] p-1 shadow-2xl shadow-black/30 ${className}`}>
      <iframe
        src={`https://discord.com/widget?id=${DISCORD_SERVER_ID}&theme=dark`}
        title="Gn0me Home on Discord: who's online"
        width="350"
        height={height}
        loading="lazy"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        className="block w-full max-w-[350px] rounded-lg border-0"
      />
    </div>
  );
}
