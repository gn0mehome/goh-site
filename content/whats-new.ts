/**
 * The staff "What's New" log, shown at /whats-new (staff only) and used by
 * the page-to-page walkthrough.
 *
 * Add an entry here in the same change as any update staff or members will
 * notice -- newest day first, newest entry first within a day. Keep the
 * wording for clan staff, not developers: what changed, where it is, and how
 * to try it. Each entry's `id` must be unique and must never change (it's
 * how "seen" state is remembered in each browser).
 */

export type WhatsNewKind = "new" | "improved" | "fixed" | "privacy";

/** Who can actually use the change -- shown as a label so staff know whether a link will open for them. */
export type WhatsNewAudience = "everyone" | "staff" | "admin";

export interface WhatsNewLink {
  label: string;
  href: string;
}

export interface WhatsNewEntry {
  id: string;
  /** YYYY-MM-DD, the day it went live. */
  date: string;
  kind: WhatsNewKind;
  audience: WhatsNewAudience;
  title: string;
  summary: string;
  /** Short "how to try it" steps, in order. */
  tryIt?: string[];
  /** Pages to open. The first is where the walkthrough takes you. */
  links: WhatsNewLink[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  // ── November 9, 2026 ──────────────────────────────────────────────
  {
    id: "2026-11-09-theme-contrast-fixes",
    date: "2026-11-09",
    kind: "fixed",
    audience: "everyone",
    title: "Easier-to-read text in every theme",
    summary:
      "We checked the text on over 50 pages in every theme, in light and dark, and fixed what was hard to read. The day names on the Events calendar were nearly invisible in dark mode; the Login button had dark text on dark gold; big gold numbers and headings (like the homepage stats) were too pale on light pages; and a few other spots were too faint. Everything now meets the usual readability standard.",
    tryIt: ["Open the Events calendar in dark mode (moon button in the menu): the day names along the top are easy to read."],
    links: [{ label: "Events", href: "/events" }],
  },
  {
    id: "2026-11-09-site-themes",
    date: "2026-11-09",
    kind: "new",
    audience: "everyone",
    title: "Holiday themes for the site, in light and dark",
    summary:
      "The site has the same seasonal themes as the stream overlays: Gn0me Home, Halloween, Thanksgiving, Winter Holidays, Valentine's Day, St. Patrick's Day and 4th of July, each with a light and a dark version (the moon button in the menu switches). The homepage banner gets faded seasonal icons to match: leaves for Thanksgiving, Christmas trees and menorahs for the winter holidays, bats and pumpkins, hearts, shamrocks, and stars and fireworks. Admins pick what everyone sees under Admin › Settings › Site Theme, including Auto, which changes with the holidays. Anyone signed in can pick their own theme on My Account, or keep Default to go with the clan's choice. Light or dark is now remembered from your first page load, so it no longer flashes light first.",
    tryIt: [
      "Admins: go to Admin › Settings › Site Theme, click a theme to try it on the page, then Save site theme.",
      "Members: open My Account, pick a theme under Site theme (or Default) and press Save my theme.",
      "Press the moon button in the menu to see the dark version.",
    ],
    links: [
      { label: "Site Theme (admin)", href: "/admin/site-theme" },
      { label: "My Account", href: "/account" },
    ],
  },
  {
    id: "2026-11-09-bingo-night-desktop",
    date: "2026-11-09",
    kind: "improved",
    audience: "everyone",
    title: "Bingo Night fits on a computer screen",
    summary:
      "Playing Bingo Night on a laptop or desktop no longer means scrolling up and down. On wider screens the card sits on the left, with the last call, the BINGO button and everything called so far beside it, and the words on the card get bigger to fill the squares. Phones look the same as before.",
    tryIt: ["Open gn0mehome.com/bingo-night on a computer while a game is live and get a card."],
    links: [{ label: "Bingo Night", href: "/bingo-night" }],
  },
  {
    id: "2026-11-09-bingo-night-item-pictures",
    date: "2026-11-09",
    kind: "new",
    audience: "staff",
    title: "Bingo Night: item pictures on word cards",
    summary:
      "Word games can now show OSRS item pictures. Tick Show item pictures from the OSRS Wiki when setting up a word game: the site looks up each word on the wiki and shows its inventory picture on the players' cards, on the stream view's board and big latest call, and in the host console. Every Friendsgiving Feast food has one; places, bosses and other non-items stay as text. You see all the pictures before saving and can click any to remove it. It works for your own word lists too, and can be switched on or off even while a game is live.",
    tryIt: [
      "Go to Admin › Events › Bingo Night, press + New game (or Edit), choose Words and a word set.",
      "Tick Show item pictures from the OSRS Wiki and check the preview. Click a picture you don't want to remove it.",
      "Save, launch, and open the bingo page on your phone to see the pictures on your card.",
    ],
    links: [
      { label: "Bingo Night (host)", href: "/admin/bingo-night" },
      { label: "Bingo Night (play)", href: "/bingo-night" },
    ],
  },
  {
    id: "2026-11-09-bingo-night-stream-words-fit",
    date: "2026-11-09",
    kind: "fixed",
    audience: "staff",
    title: "Bingo Night stream view fits word games",
    summary:
      "On the Bingo Night stream view, word games with a long list pushed the QR code and \"Scan or go to\" line off the bottom of the screen, and long words ran into each other under Last 5 calls. The word board now shrinks to fit, and the last calls wrap onto a second line.",
    tryIt: ["Launch a word game, open the stream view from the host console and draw a few calls: the QR code stays in the bottom corner."],
    links: [{ label: "Bingo Night (host)", href: "/admin/bingo-night" }],
  },
  {
    id: "2026-11-09-clan-bingo-rename",
    date: "2026-11-09",
    kind: "improved",
    audience: "everyone",
    title: "Bingo is now called Clan Bingo",
    summary:
      "With Bingo Night added, the team bingo boards are now called Clan Bingo everywhere, so the two are easy to tell apart. Clan Bingo is the team board game with tiles, sign-ups and screenshots; Bingo Night is the live call-and-mark game anyone can play. Nothing else changed, and the addresses are the same.",
    tryIt: [
      "Open the Events menu: Clan Bingo and Bingo Night sit side by side.",
      "In the admin, Clan Bingo is under Competitions and Clan Bingo Submissions is under Review Queue.",
    ],
    links: [
      { label: "Clan Bingo", href: "/bingo" },
      { label: "Bingo Night", href: "/bingo-night" },
    ],
  },
  {
    id: "2026-11-09-bingo-night",
    date: "2026-11-09",
    kind: "new",
    audience: "staff",
    title: "Bingo Night: live bingo anyone can play",
    summary:
      "A new live bingo game for clan nights, built for the Friendsgiving Feast. Players open gn0mehome.com/bingo-night on their phone, type their RSN and get a card. No account is needed, so guests from other clans can play too. Cards have G N O M E across the top and are either numbers (G-4, O-38) or OSRS words (OSRS Classic, Friendsgiving Feast, or your own list). Any staff member can host: set up the game under Admin › Events › Bingo Night, press Launch when the event starts, pick each round's pattern (single line up to coverall, with how long each usually takes), then Start round and Draw. Every BINGO is checked automatically against what was actually called and lands in your claims queue as valid or not; you confirm the winner and their name goes up on the stream. Open the stream view and screen-share it in Discord voice; it has a QR code people can scan to join. To invite people ahead of time, the Bingo Night page in the admin has an invite QR code for the game, the website or any other link, which you can copy, save as an image for Discord, or show full screen. Only one person holds the controls at a time, and another staff member can take over if the host drops. The page is empty when no game is live. This is separate from the team Bingo boards, which haven't changed.",
    tryIt: [
      "Go to Admin › Events › Bingo Night and press + New game. Name it, pick numbers or words and a colour theme, and save it as a draft.",
      "Press Launch, then Open round 1 with a pattern and press Open stream view.",
      "On your phone, open gn0mehome.com/bingo-night and get a card. Back in the console, press Start round and Draw a few times, then press BINGO on your phone and watch the claim come in.",
      "Press End game when you're done. Games stay in the list, and Copy makes a fresh draft for next time.",
    ],
    links: [
      { label: "Bingo Night (host)", href: "/admin/bingo-night" },
      { label: "Bingo Night (play)", href: "/bingo-night" },
    ],
  },
  {
    id: "2026-11-09-edit-bot-posts",
    date: "2026-11-09",
    kind: "new",
    audience: "staff",
    title: "Fix typos in the bot's Discord posts",
    summary:
      "Discord only lets whoever sent a message change it, so the bot's posts couldn't be fixed once they were up. Now they can. Everything the bot posts from the site (announcements, events, competitions, the weekly SOTW/BotW posts and more) is kept in a list under Admin › Discord Posts › Bot Posts, where you can change the text, and the title of a forum post, and save it straight to Discord. Editing doesn't ping anyone again, and images stay as they are. For posts made before today, paste the message's link. The Weekly SOTW/BotW page has the same thing at the bottom, just for the weekly posts. Polls can't be edited: Discord doesn't allow it. Who can use the Bot Posts page is set by the new Edit Bot Posts permission, given to every rank that can manage events.",
    tryIt: [
      "Go to Admin › Discord Posts › Bot Posts and press Edit next to a post, or paste a message link (in Discord, right-click the message, then Copy Message Link) and press Load message.",
      "Change the text and press Save to Discord.",
      "For the weekly posts, scroll to Edit a weekly post at the bottom of Weekly SOTW/BotW.",
    ],
    links: [
      { label: "Bot Posts", href: "/admin/bot-posts" },
      { label: "Weekly SOTW/BotW", href: "/admin/weekly-competition" },
    ],
  },
  // ── November 7, 2026 ──────────────────────────────────────────────
  {
    id: "2026-11-07-weekly-poll-auto-competition",
    date: "2026-11-07",
    kind: "new",
    audience: "staff",
    title: "The weekly SOTW/BotW poll now sets up the winning competition",
    summary:
      "On Weekly SOTW/BotW, the voting poll's options are now picked from lists instead of typed: skills for Skill of the Week, or the bosses from Boss Difficulty (Hard and Easy, with the one that's due next at the top) for Boss of the Week. One option can hold two bosses, like Nightmare + Phosani's, which makes two competitions if it wins. The site watches the poll, and when it closes the winner is set up on Wise Old Man for the whole clan: starting 8 PM Eastern on the poll's Sunday, running a week, with the usual title. A new section at the bottom shows each poll's votes and what happened. If there's a tie or nobody votes, it waits there for you to pick. You can also turn automatic setup off, set the number of winners to pay out, and choose whether to announce it.",
    tryIt: [
      "Go to Admin › Competitions › Weekly SOTW/BotW and pick the poll's options with + Add an option.",
      "Post as usual. The poll then shows under When the voting poll closes, with its closing time.",
      "After it closes, check the same section: the competition is linked there, or a tie is waiting for you to pick.",
    ],
    links: [{ label: "Weekly SOTW/BotW", href: "/admin/weekly-competition" }],
  },
  {
    id: "2026-11-07-wom-edit-verification-fix",
    date: "2026-11-07",
    kind: "fixed",
    audience: "staff",
    title: "Editing clan competitions works again",
    summary:
      "Saving changes to a whole-clan competition in WOM Competitions (title, boss, dates) failed with \"Incorrect verification code\". The same went for deleting one, adding or removing players, and refreshing participants' stats. Wise Old Man checks clan competitions against the clan group's code, and the site now uses it.",
    tryIt: ["Go to Admin › Competitions › WOM Competitions, open a competition, change its title and press Save Changes."],
    links: [{ label: "WOM Competitions", href: "/admin/wom-competitions" }],
  },
  {
    id: "2026-11-07-weekly-competition-builder",
    date: "2026-11-07",
    kind: "improved",
    audience: "staff",
    title: "WOM Competitions: quick setup for Skill and Boss of the Week",
    summary:
      "The competition builder now starts by asking what kind of competition it is. Pick Skill of the Week or Boss of the Week and it fills in the rest: the start defaults to next Sunday at 8 PM Eastern, the end to a week later, and the title follows the usual format (for example Boss of the Week | 11/8 | Perilous Moons), updating as you change the boss or date. Boss of the Week lists the bosses from the Boss Difficulty settings, grouped into Hard and Easy, and says which kind is due next after the last boss week. On the Boss Difficulty page you can give a boss the name the clan uses for it in titles. You can still type your own title, or pick Custom for anything else.",
    tryIt: [
      "Go to Admin › Competitions › WOM Competitions and pick Boss of the Week.",
      "Choose a boss from the Hard or Easy list and check the title and dates it filled in.",
      "To change how a boss is named in titles, go to Settings › Boss Difficulty and press rename for titles next to it.",
    ],
    links: [
      { label: "WOM Competitions", href: "/admin/wom-competitions" },
      { label: "Boss Difficulty", href: "/admin/boss-difficulty" },
    ],
  },
  // ── November 6, 2026 ──────────────────────────────────────────────
  {
    id: "2026-11-06-dashboard-exports",
    date: "2026-11-06",
    kind: "new",
    audience: "admin",
    title: "Export the admin dashboards as a picture, spreadsheet or PDF",
    summary:
      "Clan Overview, Player Activity and SOTW & BotW now have an Export button. Picture (PNG) saves the dashboard as an image with a Gn0me Home title bar, ready to post in Discord. Spreadsheet (Excel) saves every table as its own sheet with the filters you picked, including the full lists that the page shortens. Print / Save as PDF gives a clean printout without the site menu, sidebar or filters. Pick Save as PDF as the printer to get a file.",
    tryIt: [
      "Open the admin Dashboard and pick a tab (Clan Overview, Player Activity or SOTW & BotW).",
      "Set the filters the way you want them, then press Export at the top right.",
      "Pick Picture, Spreadsheet or Print / Save as PDF.",
    ],
    links: [
      { label: "Dashboard › SOTW & BotW", href: "/admin/competition-insights" },
      { label: "Dashboard › Player Activity", href: "/admin/activity" },
      { label: "Dashboard › Clan Overview", href: "/admin" },
    ],
  },
  {
    id: "2026-11-06-boss-difficulty-settings",
    date: "2026-11-06",
    kind: "new",
    audience: "admin",
    title: "Boss Difficulty: mark bosses and raids as easy or hard",
    summary:
      "A new settings page lists every boss and raid with an Easy / Hard switch, for the Boss of the Week rotation. Until you save it, each boss shows a suggestion. The SOTW & BotW Dashboard tab uses these to compare easy weeks with hard weeks. If one week was different from usual, change just that week from its dropdown under Every competition on the Dashboard tab.",
    tryIt: [
      "Go to Admin › Settings › Boss Difficulty.",
      "Search for a boss or filter by Easy, Hard or Not saved yet, and flip any that are wrong.",
      "Press Save, then open Dashboard › SOTW & BotW and pick Easy vs hard bosses under Compare weeks.",
    ],
    links: [
      { label: "Boss Difficulty", href: "/admin/boss-difficulty" },
      { label: "Dashboard › SOTW & BotW", href: "/admin/competition-insights" },
    ],
  },
  {
    id: "2026-11-06-sotw-botw-insights",
    date: "2026-11-06",
    kind: "new",
    audience: "admin",
    title: "SOTW & BotW tab on the admin Dashboard",
    summary:
      "A new SOTW & BotW tab on the admin Dashboard shows how the clan takes part in Skill and Boss of the Week. It has the number of competitions, how many different people competed, the average per week, and what share of entrants actually gained. Charts show competitors per week and how many were first-timers versus returning. A Compare weeks section puts skilling weeks next to bossing weeks, or easy boss weeks next to hard ones (turnout, competitors per week, first-timers and more), with a dot for every competition so you can see the spread. A table ranks the most frequent competitors with their wins and top-3 finishes, a list shows regulars who've skipped the latest few, and every competition is listed with its top 3. Filter by SOTW, BotW or both, and by date range. Results are copied from Wise Old Man automatically when you open the page.",
    tryIt: [
      "Open the admin panel's Dashboard and pick the SOTW & BotW tab (next to Player Activity).",
      "Wait a moment while it catches up with Wise Old Man (the first visit loads every past competition).",
      "Switch between Skill of the Week, Boss of the Week and Both, or change the date range, and click a column in Most frequent competitors to sort it.",
      "In Compare weeks, switch between Skilling vs bossing and Easy vs hard bosses.",
    ],
    links: [{ label: "Dashboard › SOTW & BotW", href: "/admin/competition-insights" }],
  },
  // ── November 3, 2026 ──────────────────────────────────────────────
  {
    id: "2026-11-03-discord-widget-hidden",
    date: "2026-11-03",
    kind: "improved",
    audience: "everyone",
    title: "Discord widget hidden from the homepage for now",
    summary:
      "The live Discord panel at the top of the homepage is switched off for now, and the welcome is back in the middle of the banner. The gold Join Our Discord button is still there.",
    tryIt: ["Open the homepage: the banner shows the welcome and the Join Our Discord and View Members buttons."],
    links: [{ label: "Homepage", href: "/" }],
  },
  // ── November 2, 2026 ──────────────────────────────────────────────
  {
    id: "2026-11-02-discord-widget",
    date: "2026-11-02",
    kind: "new",
    audience: "everyone",
    title: "See who's online in Discord from the homepage",
    summary:
      "The top of the homepage now shows our Discord server live: who's online, who's in voice, and a Join button. On a computer it sits next to the welcome; on a phone, tap See who's online in Discord under the buttons to open it. The Join Our Discord button is now gold so it's easier to spot.",
    tryIt: ["Open the homepage and look to the right of the welcome (or tap See who's online in Discord on a phone)."],
    links: [{ label: "Homepage", href: "/" }],
  },
  // ── October 31, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-31-contests-and-wom-competitions",
    date: "2026-10-31",
    kind: "improved",
    audience: "everyone",
    title: "Activities is now Contests; WOM Competitions has its own page",
    summary:
      "The Activities page is now called Contests and only shows clan-run contests: team bingos, quest races and art contests, plus the always-running hiscores, attendance and gallery. Skill & Boss of the Week and every other Wise Old Man competition now live on one page, WOM Competitions, with what's live, coming up and past. In the Events menu you'll find Calendar, Contests, Bingo, WOM Competitions, Hiscores and the Attendance Leaderboard. Old Activities links still work and open Contests.",
    tryIt: [
      "Open the Events menu and pick Contests to see live bingos, quest races and art contests.",
      "Open Events › WOM Competitions for Skill & Boss of the Week and past winners.",
    ],
    links: [
      { label: "Contests", href: "/contests" },
      { label: "WOM Competitions", href: "/competitions" },
    ],
  },
  {
    id: "2026-10-31-art-entry-visibility",
    date: "2026-10-31",
    kind: "improved",
    audience: "staff",
    title: "Art contests: staff choose who can see the entries",
    summary:
      "Who can see the artwork (everyone, or clan members only) is now a setting staff pick for each art contest, instead of a choice each artist makes when entering. It covers every entry in that contest, in the vote and in the gallery afterwards. Contests that already had a clan-only entry were set to clan members only, so nothing became more public. Artists still choose how they're credited and whether their piece goes in the gallery.",
    tryIt: [
      "Go to Admin › Art Contests and open a contest.",
      "In Setup, under Entering, pick Everyone or Clan members only for Who can see the entries, then press Save.",
      "Open the contest page: the entry form now says who will see the piece instead of asking.",
    ],
    links: [{ label: "Admin › Art Contests", href: "/admin/art" }],
  },
  // ── October 29, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-29-art-contests",
    date: "2026-10-29",
    kind: "new",
    audience: "staff",
    title: "Art contests and the Gn0mie Gallery",
    summary:
      "Staff can now run art contests on the site. Members upload their artwork with a title and description and choose who can see it (everyone or clan members only), how they're credited (their RSN, a name they pick, or anonymous) and whether it goes in the gallery afterwards. Staff approve the entries that follow the rules, then open voting: each contest sets how many votes people get, who can vote (clan members, anyone signed in, or once per IP), whether counts show live, and how voters' comments are shown. When a contest finishes, its results show on the contest page, and pieces whose artists said yes appear in the new Gn0mie Gallery. Nothing is posted to Discord automatically.",
    tryIt: [
      "Go to Admin › Art Contests, press New art contest and fill in the setup.",
      "Press Open entries and share the contest page; entries waiting for review show in the Entries tab.",
      "Approve the pieces you want in the vote, then press Open voting, and Finish and show results when it's done.",
    ],
    links: [
      { label: "Admin › Art Contests", href: "/admin/art" },
      { label: "Gn0mie Gallery", href: "/gallery" },
      { label: "Activities", href: "/activities" },
    ],
  },
  {
    id: "2026-10-28-login-error-details",
    date: "2026-10-28",
    kind: "improved",
    audience: "everyone",
    title: "Failed logins now show the exact error",
    summary:
      "Whenever a login can't finish, for any reason (a cancelled Discord prompt, a Discord or Supabase error, or something unexpected on our side), the login page now shows what happened plus the exact error underneath. If someone gets stuck, ask them for a screenshot of that box.",
    links: [{ label: "Login", href: "/login" }],
  },
  // ── October 28, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-28-login-loop-message",
    date: "2026-10-28",
    kind: "fixed",
    audience: "everyone",
    title: "Login explains why it didn't work instead of looping",
    summary:
      "If a Discord login can't finish, the login page now says why instead of quietly showing the button again. The most common cause is a Discord account without a verified email: the message tells people to verify it in Discord (User Settings › My Account) and try again.",
    links: [{ label: "Login", href: "/login" }],
  },
  // ── October 22, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-22-news-posts",
    date: "2026-10-22",
    kind: "improved",
    audience: "everyone",
    title: "News posts open in full, with Discord formatting and emoji",
    summary:
      "The Latest News cards on the homepage now show posts the way they look in Discord: bold and headings, lists, quotes, custom server emoji, channel names instead of long links, member names for @mentions, and readable dates. Click a card (or Read more) to open the whole post.",
    tryIt: ["Open the homepage, scroll to Latest News and click a post."],
    links: [{ label: "Homepage", href: "/" }],
  },
  // ── October 21, 2026 (evening) ────────────────────────────────────
  {
    id: "2026-10-21-readable-charts",
    date: "2026-10-21",
    kind: "fixed",
    audience: "staff",
    title: "Easier-to-read charts",
    summary:
      "Chart labels, grid lines and legends now follow the light and dark themes instead of staying dim grey, so they're readable in dark mode. On Player Activity the labels are larger, player names have more room, and big numbers are shortened (14M instead of 14000000).",
    links: [{ label: "Player Activity", href: "/admin/activity" }],
  },
  // ── October 21, 2026 (later) ──────────────────────────────────────
  {
    id: "2026-10-21-rank-labels",
    date: "2026-10-21",
    kind: "new",
    audience: "admin",
    title: "Rename ranks however you like",
    summary:
      "A new Rank Labels page lets you choose what each rank is called across the site (for example Gold Key as \"Supreme Overlord\"), and the description shown for it on the Rank Structure page. Ranks still come from Wise Old Man; only the names shown change. Empty boxes keep the standard names.",
    tryIt: ["Go to Admin › Settings › Rank Labels, type a new name next to a rank and press Save labels."],
    links: [
      { label: "Rank Labels", href: "/admin/rank-labels" },
      { label: "Rank Structure", href: "/rank-structure" },
    ],
  },
  // ── October 21, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-21-key-ranks",
    date: "2026-10-21",
    kind: "improved",
    audience: "everyone",
    title: "New rank order: Gold Key and Silver Key at the top",
    summary:
      "The site now uses the clan's new ranks, highest first: Gold Key, Silver Key, Yew, Pine, Oak, Council, then Gnome Child. Gold Key is the in-game Owner rank and Silver Key is Deputy Owner, matching the key icons in game and on Wise Old Man. Council (the Summoner rank) now sits below Oak and starts with Oak's permissions. Rank badges, the rank list, Gn0meBook, Roles & Access and the bot's voice room staff roles all use the new names.",
    tryIt: ["Open Admin › Roles & Access to check each rank's permissions, especially Council's."],
    links: [
      { label: "Roles & Access", href: "/admin/permissions" },
      { label: "Rank Structure", href: "/rank-structure" },
    ],
  },
  // ── October 20, 2026 (night) ──────────────────────────────────────
  {
    id: "2026-10-20-droptracker-api",
    date: "2026-10-20",
    kind: "improved",
    audience: "admin",
    title: "Bingo drops straight from DropTracker",
    summary:
      "With the clan's DropTracker API key added, the site reads drops straight from DropTracker every 5 minutes while a bingo is live, as well as from the Discord posts. Each drop counts once, and drops aren't missed if the bot was offline for a while. Quests still come from the Discord post and WikiSync.",
    tryIt: ["Go to Admin › Settings › Clan Feed and press Check now under DropTracker API."],
    links: [{ label: "Admin › Clan Feed", href: "/admin/clan-feed" }],
  },
  // ── October 20, 2026 (late) ───────────────────────────────────────
  {
    id: "2026-10-20-clan-points-hidden",
    date: "2026-10-20",
    kind: "improved",
    audience: "everyone",
    title: "Clan Points is switched off for now",
    summary:
      "The Clan Points leaderboard has been taken off the site while we rethink it: it's gone from the Events menu, the Activities page and the admin sidebar, and its old link now goes to Activities. Nothing has been deleted, so it can come back later.",
    links: [{ label: "Activities", href: "/activities" }],
  },
  // ── October 20, 2026 (evening) ────────────────────────────────────
  {
    id: "2026-10-20-quest-events-whole-clan",
    date: "2026-10-20",
    kind: "improved",
    audience: "staff",
    title: "Quest events can include the whole clan",
    summary:
      "On a quest event's Players step there's now an \"Add everyone in the clan\" link, and a setting called \"Everyone in the clan takes part\". With the setting on, everyone on the clan's Wise Old Man group is added, and anyone who joins the clan mid-event is added automatically (to the smallest team, in a team event). Newcomers only score quests they finish after they're added.",
    tryIt: [
      "Open a quest event in Admin › Quest Events and go to Players.",
      "Tick Everyone in the clan takes part, or press Add everyone in the clan and then Save players.",
    ],
    links: [{ label: "Admin › Quest Events", href: "/admin/quests" }],
  },
  // ── October 20, 2026 (later) ──────────────────────────────────────
  {
    id: "2026-10-20-clan-feed",
    date: "2026-10-20",
    kind: "new",
    audience: "admin",
    title: "Clan Feed: DropTracker drops and clan broadcasts count automatically",
    summary:
      "The bot can now read the Discord channels where DropTracker (or a clan-chat forwarder) posts. When a player on a bingo team gets an item that's on a tile's item list, the tile ticks off by itself, or goes to the review queue if you'd rather check first. Quest completions posted there count for quest event players too, even if they don't use WikiSync or Discord. A log shows every post the bot read and what it counted for, and you can paste a post to test it.",
    tryIt: [
      "Go to Admin › Settings › Clan Feed (DropTracker) and add your DropTracker channel.",
      "Paste a post into Try a message to see what it would count for.",
      "On a bingo's Basics step, choose what happens to drops from the feed: count them, send them for review, or ignore them.",
    ],
    links: [
      { label: "Admin › Clan Feed", href: "/admin/clan-feed" },
      { label: "Admin › Clan Bingo", href: "/admin/bingo" },
    ],
  },
  // ── October 20, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-20-quest-events",
    date: "2026-10-20",
    kind: "new",
    audience: "staff",
    title: "Quest events: run a quest race on the site",
    summary:
      "Staff can now run quest competitions. Pick solo or teams, choose how quests score (by difficulty with your own points, by quest points, or the same for every quest), and count every quest or a list you pick. Members join from the event page, and their quests tick off by themselves through the WikiSync RuneLite plugin, checked every half hour. Anyone without WikiSync can send a screenshot of the quest complete scroll, which lands in a new review queue. Each finished quest is posted to Discord once a channel is set.",
    tryIt: [
      "Go to Admin › Quest Events and press New quest event.",
      "Set the dates, format and scoring, then pick which quests count.",
      "On Players, open sign-ups (or add people yourself). For teams, press Balance teams to even out how many quests each team has left.",
      "On Launch, press Go live. Screenshots to check show up under Review Queue › Quest Screenshots.",
      "To post finished quests in Discord, pick a channel for Quest Event Announcements in Admin › Discord Channels.",
    ],
    links: [
      { label: "Admin › Quest Events", href: "/admin/quests" },
      { label: "Quest Screenshots", href: "/admin/quests/submissions" },
      { label: "Discord Channels", href: "/admin/alert-channels" },
    ],
  },
  {
    id: "2026-10-20-activities-page",
    date: "2026-10-20",
    kind: "new",
    audience: "everyone",
    title: "New Activities page",
    summary:
      "Events › Activities is a new page listing everything members can take part in: live and upcoming bingos, quest events and Wise Old Man competitions, with countdowns, plus links to the always-on things like Clan Points and the hiscores. It's the place to send people who ask what's going on.",
    tryIt: ["Open the Events menu and pick Activities."],
    links: [{ label: "Activities", href: "/activities" }],
  },
  // ── October 19, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-19-delete-testimonials",
    date: "2026-10-19",
    kind: "improved",
    audience: "admin",
    title: "Delete testimonials",
    summary:
      "Testimonials can now be deleted from the admin page, whether they're waiting, approved, featured or rejected. Handy for clearing out ones made for testing. An approved one comes off the site straight away.",
    tryIt: ["Go to Admin › Testimonials, open one with View, and press Delete testimonial, then Yes, delete it."],
    links: [{ label: "Admin › Testimonials", href: "/admin/testimonials" }],
  },
  {
    id: "2026-10-19-raffle-to-weekly-post",
    date: "2026-10-19",
    kind: "improved",
    audience: "admin",
    title: "Save the raffle draw, and the weekly post picks up the winners",
    summary:
      "After drawing winners on the Raffles page, you can now save the draw as that week's raffle in one step. It gets a name and prize filled in for you, the winners go to Prize Payouts as unpaid (with an optional Discord DM), and it appears in the raffle list. The Weekly SOTW/BotW page then fills its raffle winners and GP amount from the latest raffle, so nobody has to retype names. The draw has moved to the top of the Raffles page.",
    tryIt: [
      "Go to Admin › Raffles, press Last Week, set the number of winners and press Draw winners.",
      "Check the name and prize, then press Save raffle.",
      "Open Admin › Weekly SOTW/BotW: the raffle winners box is already filled in from it.",
    ],
    links: [
      { label: "Admin › Raffles", href: "/admin/raffles" },
      { label: "Weekly SOTW/BotW", href: "/admin/weekly-competition" },
    ],
  },
  {
    id: "2026-10-19-date-presets-fill-boxes",
    date: "2026-10-19",
    kind: "improved",
    audience: "everyone",
    title: "This Week and This Month now show their dates",
    summary:
      "On the attendance leaderboard and the admin Player Activity page, pressing This Week or This Month now fills in the From and To dates, so you can see exactly what's being counted. Weeks run Sunday to Saturday and months are the whole calendar month, the same as the Raffles page. All Time clears the dates.",
    tryIt: ["Open the leaderboard and press This Week: the From and To boxes show Sunday to Saturday."],
    links: [
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "Admin › Player Activity", href: "/admin/activity" },
    ],
  },
  {
    id: "2026-10-19-bingo-builder",
    date: "2026-10-19",
    kind: "improved",
    audience: "admin",
    title: "Bingo: a new board builder, team balancing and review queue",
    summary:
      "Bingo has been rebuilt. Start a board blank or as a copy of an old one, and it saves as you go, so you can fill a few tiles at a time. Click a square and search for an item, boss or skill: the name, icon and tracking fill in for you. Boss KC, XP and clue tiles now track themselves from Wise Old Man, and tiles can be worth different points, with bonuses for finished lines and blackouts. Open sign-ups to let members join, then press Balance teams to spread players evenly by their efficient hours. The review queue shows one screenshot at a time, with A to approve and S to send back with a reason.",
    tryIt: [
      "Go to Admin › Bingo and press New bingo.",
      "On the Board step, click a square and type something like \"vorkath\" or \"whip\".",
      "On Sign-ups & teams, open sign-ups or add players, then press Balance teams.",
      "On Launch, check the list and press Go live when it's ready.",
    ],
    links: [
      { label: "Admin › Clan Bingo", href: "/admin/bingo" },
      { label: "Clan Bingo submissions", href: "/admin/bingo/submissions" },
    ],
  },
  {
    id: "2026-10-19-bingo-board",
    date: "2026-10-19",
    kind: "improved",
    audience: "everyone",
    title: "Bingo: join from the site, track your team, send proof from Discord",
    summary:
      "The Bingo page now opens on your team's board, with your score, rank and a countdown. Tiles show item and boss icons, progress bars, and what's waiting on staff or was sent back. Tap a tile to see what counts and drop or paste a screenshot. Members can also join a bingo during sign-ups, follow the race on the Standings, All teams and Activity tabs, and send proof from Discord with /bingo submit, or check their team with /bingo board.",
    tryIt: [
      "Open Bingo from the menu.",
      "When a bingo has sign-ups open, press Join this bingo.",
      "Once it's live, tap a tile on your board and paste a screenshot with Ctrl+V.",
    ],
    links: [{ label: "Clan Bingo", href: "/bingo" }],
  },
  // ── October 18, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-18-raffle-draw",
    date: "2026-10-18",
    kind: "improved",
    audience: "admin",
    title: "Raffle attendance: Sunday-to-Saturday weeks and a built-in draw",
    summary:
      "On the Raffles page, weeks now run Sunday to Saturday: This Week is the current week and the new Last Week is the full week before it. This Month covers the whole calendar month. Each button fills in the From and To dates so you can see exactly what's included. A new Random draw picks as many different winners as you ask for, giving everyone one entry per event they attended in that range.",
    tryIt: [
      "Go to Admin › Raffles; the draw is at the top of the page.",
      "Press Last Week (or This Week) and check the dates it fills in.",
      "Under Random draw, set the number of winners and press Draw winners.",
    ],
    links: [{ label: "Admin › Raffles", href: "/admin/raffles" }],
  },
  {
    id: "2026-10-18-voice-rooms",
    date: "2026-10-18",
    kind: "new",
    audience: "admin",
    title: "Temporary muted voice rooms in Discord",
    summary:
      "Members can type /vc in Discord to make a temporary voice room. Everyone joins muted except the creator and staff, who can let people speak with /room speak and mute them again with /room mute. Rooms can also be locked, renamed, resized or handed over, and empty rooms are removed automatically. Admins choose the category rooms go in, who can create them, who counts as staff, cleanup timing and a log channel.",
    tryIt: [
      "Go to Admin › Voice Rooms, pick the category for new rooms, and save.",
      "In Discord, type /vc, then join the room it makes.",
      "From inside the room, try /room speak @someone, /room lock and /room info.",
    ],
    links: [{ label: "Admin › Voice Rooms", href: "/admin/voice-rooms" }],
  },
  // ── October 13, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-13-gn0mebook-character",
    date: "2026-10-13",
    kind: "new",
    audience: "everyone",
    title: "Show your 3D character on your Gn0meBook profile (beta)",
    summary:
      "Every member can now design their OSRS character in 3D in My Account (appearance like the in-game character creator, plus gear in every slot) and choose to show it on their Gn0meBook profile. It's off until you turn it on. Anyone who hasn't designed one yet shows the clan's gnome outfit.",
    tryIt: [
      "Open My Account and scroll to Profile character. Set your appearance and gear, then save.",
      "Open My Gn0meBook Profile, tick \"Show my OSRS character on my profile\" and save.",
      "View your Gn0meBook profile and drag the character to turn it.",
    ],
    links: [
      { label: "My Gn0meBook Profile", href: "/gn0mebook/edit" },
      { label: "My Account › Profile character", href: "/account#outfit" },
      { label: "Gn0meBook", href: "/gn0mebook" },
    ],
  },
  {
    id: "2026-10-13-member-profiles-beta",
    date: "2026-10-13",
    kind: "new",
    audience: "staff",
    title: "Member profiles (beta)",
    summary:
      "A profile page for every clan member, in the style of Warcraft Logs: their OSRS character in 3D wearing their gear, plus every skill and boss coloured by where they rank in the clan (gold is best in the clan, then pink, orange, purple, blue, green and grey). It also shows EHP, EHB and their gains over the last week or month. Members who haven't made their character show the clan's gnome fashionscape. Staff only while we test it.",
    tryIt: [
      "Open the Member Profiles (Beta) list and search for a member.",
      "Look at the coloured ranks next to each boss and skill, and switch Recent gains between week and month.",
      "Drag a character to turn it.",
      "Make your own in My Account, under Profile character: on Appearance, pick your body type, head, jaw, torso, arms, hands, legs and feet, and your hair, clothing and skin colours, like the in-game character creator; on Gear, click a slot and search for an item.",
      "Admins: set the clan's default outfit in Admin › Default Clan Outfit, and refresh rankings in Admin › Member Profiles (Beta).",
    ],
    links: [
      { label: "Member Profiles (Beta)", href: "/members/beta" },
      { label: "My Account › Profile character", href: "/account#outfit" },
      { label: "Admin › Default Clan Outfit", href: "/admin/default-outfit" },
      { label: "Admin › Member Profiles (Beta)", href: "/admin/profiles-beta" },
    ],
  },
  // ── October 12, 2026 ──────────────────────────────────────────────
  {
    id: "2026-10-12-dark-mode-text",
    date: "2026-10-12",
    kind: "fixed",
    audience: "everyone",
    title: "Dark mode text is readable again",
    summary:
      "In dark mode some cards kept a light background while their text turned light, so it was hard to read. This showed up on What's New, survey results, the handbook, Clan Rules and other pages. Those cards now switch to dark too.",
    tryIt: ["Switch to dark mode with the moon button in the top bar.", "Open What's New and check the cards are easy to read."],
    links: [{ label: "What's New", href: "/whats-new" }],
  },
  {
    id: "2026-10-12-home-newsletter",
    date: "2026-10-12",
    kind: "new",
    audience: "everyone",
    title: "Newsletter shoutout on the home page",
    summary:
      "The home page's Clan at a Glance section now shows the latest Weekly Glider issue, with its cover, date and headline, and links to read it or browse past issues. It updates automatically when a new issue is published.",
    tryIt: ["Open the home page and scroll to Clan at a Glance.", "Press 'Read the latest issue'."],
    links: [
      { label: "Home page", href: "/" },
      { label: "Newsletter", href: "/newsletter" },
    ],
  },
  {
    id: "2026-10-12-event-images-kept",
    date: "2026-10-12",
    kind: "fixed",
    audience: "admin",
    title: "Editing an event no longer removes its image",
    summary:
      "Saving an event or a recurring series on the site sometimes wiped the cover image from the Discord event, or images from the Discord post. Images now only change when you change them in the form.",
    tryIt: [
      "Go to Admin › Events and edit an event that has a cover image in Discord.",
      "Change something else, like the description, and save.",
      "Check the Discord event and post: the image is still there.",
    ],
    links: [{ label: "Admin › Events", href: "/admin/events" }],
  },
  {
    id: "2026-10-12-whats-new",
    date: "2026-10-12",
    kind: "new",
    audience: "staff",
    title: "This What's New page",
    summary:
      "A staff-only list of site changes, newest first, with links to try each one. The walkthrough takes you to each new thing in turn, with a guide in the corner of the screen. New changes are added here as they go live.",
    tryIt: [
      "Open your account menu (top right) and pick What's New. The red number counts changes you haven't seen.",
      "Press Start walkthrough, then use Next and Back in the guide.",
      "Minimise the guide with – if it's in the way, or close it with ✕.",
    ],
    links: [{ label: "What's New", href: "/whats-new" }],
  },
  {
    id: "2026-10-12-clan-pages",
    date: "2026-10-12",
    kind: "new",
    audience: "everyone",
    title: "Rank Structure and Clan Rules pages",
    summary:
      "The Clan menu now has Rank Structure and Clan Rules pages, open to everyone. Until new graphics are uploaded they show the current rank list and the rules from the old handbook.",
    tryIt: [
      "Open the Clan menu in the top bar.",
      "Pick Rank Structure, then Clan Rules.",
      "Tap any uploaded image to see it full size.",
    ],
    links: [
      { label: "Rank Structure", href: "/rank-structure" },
      { label: "Clan Rules", href: "/clan-rules" },
    ],
  },
  {
    id: "2026-10-12-clan-pages-admin",
    date: "2026-10-12",
    kind: "new",
    audience: "admin",
    title: "Upload the Rank Structure and Clan Rules",
    summary:
      "Upload finished graphics or a PDF for each page. A PDF is turned into page images automatically and also offered as a download.",
    tryIt: [
      "Go to Admin › Rank Structure & Rules.",
      "Choose images or a PDF under the page you want to update.",
      "Reorder if needed, then press Publish.",
    ],
    links: [{ label: "Rank Structure & Rules admin", href: "/admin/clan-pages" }],
  },
  {
    id: "2026-10-12-shoutouts",
    date: "2026-10-12",
    kind: "improved",
    audience: "everyone",
    title: '"Review a Gn0mie" is now "Submit Gn0mie Shoutouts"',
    summary:
      "Renamed to match the Discord channel, and it has a new address. Old links still work. Testimonials moved from the Members menu to the Feedback menu.",
    tryIt: ["Open the Members menu and pick Submit Gn0mie Shoutouts.", "Open the Feedback menu to find Testimonials."],
    links: [
      { label: "Gn0mie Shoutouts", href: "/gnomie-shoutouts" },
      { label: "Testimonials", href: "/testimonials" },
    ],
  },
  {
    id: "2026-10-12-handbook",
    date: "2026-10-12",
    kind: "new",
    audience: "staff",
    title: "New Staff Handbook reader",
    summary:
      "The handbook is now uploaded as a PDF or page images and read in a page viewer, with a contents list, page-by-page navigation, links to a specific page, and 'continue where you left off'.",
    tryIt: [
      "Open the Staff Handbook.",
      "Use the contents list (on phones, tap the page counter at the bottom).",
      "Use the arrow keys or the ‹ › buttons to turn pages.",
      "Press 'Copy link to page' to share an exact page.",
    ],
    links: [
      { label: "Staff Handbook", href: "/staff-handbook" },
      { label: "Upload an edition (admin)", href: "/admin/handbook" },
    ],
  },
  {
    id: "2026-10-12-checkin-codes",
    date: "2026-10-12",
    kind: "new",
    audience: "staff",
    title: "One-click event check-in codes",
    summary:
      "Show, copy, generate or remove an event's check-in code without opening the event editor. The code is shown large enough to read out during the event.",
    tryIt: [
      "Open the Events calendar and click an event.",
      "In the pop-up, use Copy, New code or Remove under the check-in code.",
    ],
    links: [
      { label: "Events calendar", href: "/events" },
      { label: "Admin › Events", href: "/admin/events" },
    ],
  },
  {
    id: "2026-10-12-events-home",
    date: "2026-10-12",
    kind: "improved",
    audience: "everyone",
    title: "Checking in to events is easier",
    summary:
      "Home page event cards open the full event details and have a Check In button. Events that are underway stay on the home page, tagged 'Happening now', until they end. Calendar events now look clickable.",
    tryIt: ["Scroll to the events on the home page.", "Click a card for details, or press Check In."],
    links: [
      { label: "Home page", href: "/" },
      { label: "Events calendar", href: "/events" },
    ],
  },
  {
    id: "2026-10-12-surveys",
    date: "2026-10-12",
    kind: "improved",
    audience: "admin",
    title: "Better survey results",
    summary:
      "Surveys can have up to 50 questions. Results now show who chose each answer, written answers as separate cards with names and a search box, and a 'By respondent' view to step through each person's answers.",
    tryIt: [
      "Go to Admin › Surveys and press View Results on a survey.",
      "Switch between 'By question' and 'By respondent'.",
    ],
    links: [{ label: "Admin › Surveys", href: "/admin/surveys" }],
  },
  {
    id: "2026-10-12-privacy-ips",
    date: "2026-10-12",
    kind: "privacy",
    audience: "admin",
    title: "IP addresses are no longer shown",
    summary:
      "Survey results, the feedback inbox and Gn0mie shoutouts no longer show anyone's IP address, and exports leave them out. Ban IP still works without revealing the address. These submissions can now only be read through the admin pages.",
    links: [{ label: "Admin › Feedback", href: "/admin/feedback" }],
  },
  {
    id: "2026-10-12-newsletter",
    date: "2026-10-12",
    kind: "new",
    audience: "everyone",
    title: "The Weekly Glider newsletter page",
    summary:
      "The newsletter has its own page: the latest issue first, every past issue in the archive, readable on phone and desktop. Issues are uploaded as a PDF or page images.",
    tryIt: [
      "Open Clan › Newsletter.",
      "Tap a page to zoom in, or scroll down for older issues.",
      "Admins: upload new issues from Admin › Newsletter.",
    ],
    links: [
      { label: "Newsletter", href: "/newsletter" },
      { label: "Admin › Newsletter", href: "/admin/newsletter" },
    ],
  },
  {
    id: "2026-10-12-weekly-turnover",
    date: "2026-10-12",
    kind: "improved",
    audience: "admin",
    title: "Weekly SOTW/BotW turnover, rebuilt",
    summary:
      "Posts the results reply, the new competition thread, the raffle winners announcement and next week's voting poll, formatted like our hand-written posts. Pick competitions from dropdowns, including combined weeks, and preview and edit everything before it posts.",
    tryIt: [
      "Go to Admin › Weekly SOTW/BotW.",
      "Choose the finished and next competitions, the poll type, and the raffle winners.",
      "Press Generate Preview, check the posts, then Post Everything.",
    ],
    links: [{ label: "Admin › Weekly SOTW/BotW", href: "/admin/weekly-competition" }],
  },
  {
    id: "2026-10-12-admin-panel",
    date: "2026-10-12",
    kind: "improved",
    audience: "admin",
    title: "Admin panel reorganised",
    summary:
      "The sidebar is grouped, with one group open at a time and Dashboard on top. Red badges count items waiting for review, the Dashboard has a 'Needs attention' panel, and Prize Payouts is split into Payouts, Raffles, and Prize & DM Defaults. Each admin section now checks its own permission.",
    links: [{ label: "Admin Dashboard", href: "/admin" }],
  },
  {
    id: "2026-10-12-channel-pickers",
    date: "2026-10-12",
    kind: "improved",
    audience: "admin",
    title: "Tidier Discord channel pickers",
    summary:
      "Every 'post to channel' dropdown is grouped by Discord category, with active threads under their channel and a filter box.",
    links: [{ label: "Admin › Discord Channels", href: "/admin/alert-channels" }],
  },
];
