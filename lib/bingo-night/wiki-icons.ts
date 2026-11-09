// Finds OSRS Wiki item pictures for Bingo Night words. Server only.
//
// 1. The wiki's item list (the same one the GE price tools use) gives each
//    tradeable item's inventory picture.
// 2. Anything not on it (untradeables like "Fire cape") is looked up as a
//    wiki file named after the word, kept only if it's icon-sized, so a word
//    like "Varrock" doesn't pull in a big scenery picture.

const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const IMAGES = "https://oldschool.runescape.wiki/images/";
const USER_AGENT = "Gn0meHome-Website - bingo night item pictures";
const MAX_ICON = 64; // inventory pictures are about 36×32

let mapping: { byName: Map<string, string>; at: number } | null = null;

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const wikiImageUrl = (file: string) => IMAGES + encodeURIComponent(file.replace(/ /g, "_")).replace(/%2F/g, "/");
/** Only pictures from the OSRS Wiki are allowed in a game. */
export const isWikiImage = (url: unknown): url is string => typeof url === "string" && url.startsWith(IMAGES) && url.length < 300;

async function itemPictures(): Promise<Map<string, string>> {
  if (mapping && Date.now() - mapping.at < 6 * 3_600_000) return mapping.byName;
  const res = await fetch(MAPPING_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`OSRS Wiki item list: ${res.status}`);
  const list = (await res.json()) as { name?: string; icon?: string }[];
  const byName = new Map<string, string>();
  for (const it of list) if (it.name && it.icon && !byName.has(key(it.name))) byName.set(key(it.name), wikiImageUrl(it.icon));
  mapping = { byName, at: Date.now() };
  return byName;
}

/** Icon-sized wiki files named after these words (50 per request). */
async function filePictures(words: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let i = 0; i < words.length; i += 50) {
    const chunk = words.slice(i, i + 50);
    const url = `${WIKI_API}?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=size|url&titles=${encodeURIComponent(chunk.map((w) => `File:${w}.png`).join("|"))}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) continue;
    const body = (await res.json()) as {
      query?: { normalized?: { from: string; to: string }[]; pages?: { title: string; missing?: boolean; imageinfo?: { width: number; height: number; url: string }[] }[] };
    };
    const back = new Map((body.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of body.query?.pages ?? []) {
      const info = p.imageinfo?.[0];
      if (p.missing || !info || info.width > MAX_ICON || info.height > MAX_ICON) continue;
      const asked = (back.get(p.title) ?? p.title).replace(/^File:/, "").replace(/\.png$/, "");
      if (isWikiImage(info.url)) found.set(key(asked), info.url);
    }
  }
  return found;
}

/** Words whose item goes by another name on the wiki. */
const ALIASES: Record<string, string> = { "party hat": "red partyhat", "gnome ball": "gnomeball" };

/** A picture URL (or null) for each word, in the same order. */
export async function findWordPictures(words: string[]): Promise<(string | null)[]> {
  const items = await itemPictures();
  const icons = words.map((w) => {
    const k = key(w);
    return items.get(k) ?? items.get(ALIASES[k] ?? "") ?? items.get(`cooked ${k}`) ?? null;
  });
  const rest = [...new Set(words.filter((_, i) => !icons[i]).map((w) => w.trim()))];
  if (rest.length) {
    const files = await filePictures(rest);
    words.forEach((w, i) => {
      if (!icons[i]) icons[i] = files.get(key(w)) ?? null;
    });
  }
  return icons;
}
