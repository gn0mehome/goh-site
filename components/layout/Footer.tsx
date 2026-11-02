import Link from "next/link";
import { CLAN_NAME, CLAN_CHAT, WOM_GROUP_URL, DISCORD_INVITE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="bg-bark-brown border-t-2 border-bark-brown-light mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Clan Info */}
          <div>
            <h3 className="font-display text-xl text-gold-light mb-3">{CLAN_NAME}</h3>
            <p className="text-parchment-dark text-sm leading-relaxed">
              An Old School RuneScape clan focused on PvM, community events, and
              having a good time. All levels welcome.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display text-lg text-gold-display mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/guides" className="text-parchment hover:text-gold-light transition-colors">
                  Guides & Resources
                </Link>
              </li>
              <li>
                <Link href="/events" className="text-parchment hover:text-gold-light transition-colors">
                  Events Calendar
                </Link>
              </li>
              <li>
                <Link href="/members" className="text-parchment hover:text-gold-light transition-colors">
                  Member Roster
                </Link>
              </li>
              <li>
                <Link href="/hiscores" className="text-parchment hover:text-gold-light transition-colors">
                  Clan Hiscores
                </Link>
              </li>
              <li>
                <Link href="/competitions" className="text-parchment hover:text-gold-light transition-colors">
                  WOM Competitions
                </Link>
              </li>
              <li>
                <a
                  href={WOM_GROUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-parchment hover:text-gold-light transition-colors"
                >
                  Wise Old Man Group
                </a>
              </li>
            </ul>
          </div>

          {/* Join Us */}
          <div>
            <h4 className="font-display text-lg text-gold-display mb-3">Join Us</h4>
            <ul className="space-y-2 text-sm text-parchment">
              <li>
                <span className="text-parchment-dark">Clan Chat:</span>{" "}
                <span className="font-mono text-gold-light">{CLAN_CHAT}</span>
              </li>
              <li>
                <a
                  href={DISCORD_INVITE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gold-light transition-colors"
                >
                  Join our Discord
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-bark-brown-light mt-8 pt-6 text-center text-xs text-parchment-dark">
          <p>&copy; {new Date().getFullYear()} {CLAN_NAME}. Not affiliated with Jagex Ltd.</p>
          <p className="mt-1">
            <Link href="/privacy" className="hover:text-gold-light transition-colors">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
