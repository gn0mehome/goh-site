// Bingo Night word lists (Admin › Settings › Bingo Night Word Lists). Server only.
// A game copies its list's words when it's saved, so editing a list never
// changes a game that's already set up or live.

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateWords, WORD_SETS } from "./core";
import { BingoError } from "./server";

export interface WordList {
  id: string;
  name: string;
  words: string[];
  updated_at: string | null;
  updated_by: string | null;
}

/** The built-in lists, used until the word-lists table exists. */
const BUILT_IN: WordList[] = Object.entries(WORD_SETS).map(([id, s]) => ({ id, name: s.name, words: s.words, updated_at: null, updated_by: null }));

/** Every word list, in order. Falls back to the built-in lists if the table isn't there yet. */
export async function listWordLists(sb: SupabaseClient): Promise<WordList[]> {
  const { data, error } = await sb.from("bingo_night_word_lists").select("id, name, words, updated_at, updated_by").order("sort").order("name");
  if (error) return BUILT_IN;
  return (data ?? []).map((r) => ({ ...r, words: Array.isArray(r.words) ? (r.words as string[]) : [] }));
}

/** One list by id, or null. */
export async function getWordList(sb: SupabaseClient, id: string): Promise<WordList | null> {
  return (await listWordLists(sb)).find((l) => l.id === id) ?? null;
}

/** Creates or updates a list after checking its name and words. Returns its id. */
export async function saveWordList(sb: SupabaseClient, input: { id?: unknown; name?: unknown; words?: unknown }, by: string): Promise<string> {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) throw new BingoError("Give the list a name.");
  const checked = validateWords(Array.isArray(input.words) ? (input.words as string[]).map(String) : String(input.words ?? ""));
  if (!checked.ok) throw new BingoError(checked.errors.slice(0, 4).join(" "));
  const others = (await listWordLists(sb)).filter((l) => l.id !== input.id);
  if (others.some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new BingoError(`There's already a list called "${name}".`);
  const row = { name, words: checked.words, updated_by: by, updated_at: new Date().toISOString() };
  if (typeof input.id === "string" && input.id) {
    const { data, error } = await sb.from("bingo_night_word_lists").update(row).eq("id", input.id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new BingoError("That list doesn't exist any more.", 404);
    return input.id;
  }
  const { data, error } = await sb.from("bingo_night_word_lists").insert({ ...row, created_by: by, sort: 100 }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteWordList(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("bingo_night_word_lists").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
