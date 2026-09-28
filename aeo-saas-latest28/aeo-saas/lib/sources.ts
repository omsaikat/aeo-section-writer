// Verify, in code, which answer engines actually use a key. The model proposes keys;
// the source labels shown to the user come only from this check, never from the model.
import type { EngineAnswer } from "./dataforseo";

const clean = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ");

/** True when every meaningful word of the key (stem match) appears in the text. */
export function mentions(text: string, key: string): boolean {
  const t = clean(text);
  const all = clean(key).split(/[\s-]+/).filter(Boolean);
  const words = all.filter((w) => w.length >= 3 || /\p{N}/u.test(w));
  // Keys made only of short words ("UV", "5G") must match as whole words.
  if (!words.length) return all.length > 0 && all.every((w) => ` ${t} `.includes(` ${w} `));
  return words.every((w) => t.includes(w.length > 5 ? w.slice(0, w.length - 2) : w));
}

export function sourcesFor(key: string, engines: EngineAnswer[]): string[] {
  return engines.filter((e) => e.present && mentions(e.text, key)).map((e) => e.engine);
}
