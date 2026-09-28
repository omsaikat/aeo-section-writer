// Google Ads / DataForSEO location codes and each market's default search language.
export type Market = { code: number; name: string; lang: string; iso: string };

export const MARKETS: Market[] = [
  { code: 2840, name: "United States", lang: "en", iso: "US" },
  { code: 2826, name: "United Kingdom", lang: "en", iso: "GB" },
  { code: 2124, name: "Canada", lang: "en", iso: "CA" },
  { code: 2036, name: "Australia", lang: "en", iso: "AU" },
  { code: 2356, name: "India", lang: "en", iso: "IN" },
  { code: 2050, name: "Bangladesh", lang: "bn", iso: "BD" },
  { code: 2586, name: "Pakistan", lang: "en", iso: "PK" },
  { code: 2784, name: "United Arab Emirates", lang: "en", iso: "AE" },
  { code: 2682, name: "Saudi Arabia", lang: "ar", iso: "SA" },
  { code: 2702, name: "Singapore", lang: "en", iso: "SG" },
  { code: 2458, name: "Malaysia", lang: "en", iso: "MY" },
  { code: 2360, name: "Indonesia", lang: "id", iso: "ID" },
  { code: 2276, name: "Germany", lang: "de", iso: "DE" },
  { code: 2250, name: "France", lang: "fr", iso: "FR" },
  { code: 2724, name: "Spain", lang: "es", iso: "ES" },
  { code: 2380, name: "Italy", lang: "it", iso: "IT" },
  { code: 2528, name: "Netherlands", lang: "nl", iso: "NL" },
  { code: 2076, name: "Brazil", lang: "pt", iso: "BR" },
  { code: 2484, name: "Mexico", lang: "es", iso: "MX" },
  { code: 2392, name: "Japan", lang: "ja", iso: "JP" },
];

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "auto", name: "Detect automatically" },
  { code: "en", name: "English" },
  { code: "bn", name: "Bengali" },
  { code: "hi", name: "Hindi" },
  { code: "ur", name: "Urdu" },
  { code: "ar", name: "Arabic" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "ja", name: "Japanese" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "th", name: "Thai" },
];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/** Best guess of the content's language from its script; Latin text falls back to the market language. */
export function detectLanguage(text: string, market: Market): string {
  const s = text.slice(0, 3000);
  const count = (re: RegExp) => s.match(re)?.length ?? 0;
  const scripts: [string, number][] = [
    ["bn", count(/[ঀ-৿]/g)],
    ["hi", count(/[ऀ-ॿ]/g)],
    [market.code === 2586 ? "ur" : "ar", count(/[؀-ۿ]/g)],
    ["th", count(/[฀-๿]/g)],
    ["ja", count(/[぀-ヿ]/g) * 3],
    ["zh-CN", count(/[一-鿿]/g)],
  ];
  scripts.sort((a, b) => b[1] - a[1]);
  if (scripts[0][1] > 20) {
    if (scripts[0][0] === "zh-CN" && count(/[぀-ヿ]/g) > 5) return "ja";
    return scripts[0][0];
  }
  // Latin script: score common function words so English copy for a German market stays English, and so on.
  const words = s.toLowerCase().match(/\p{L}+/gu) ?? [];
  let best = "", bestScore = 0;
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list.split(" "));
    const score = words.filter((w) => set.has(w)).length;
    if (score > bestScore) { best = code; bestScore = score; }
  }
  if (best && bestScore >= 3 && bestScore >= words.length * 0.08) return best;
  return market.lang === "bn" || market.lang === "ar" ? "en" : market.lang;
}

const STOPWORDS: Record<string, string> = {
  en: "the and of to in is are for with that this you your our we it on as be by from or an at",
  de: "der die das und ist sind für mit nicht ein eine einer den dem zu von auf ihre ihr wir sie auch",
  fr: "le la les et est sont pour avec une un des du de dans que qui vous votre nos notre sur pas",
  es: "el la los las y es son para con una un del de en que por su sus nuestro nuestra usted más",
  it: "il lo la gli le e è sono per con una un del della di in che non su nostro nostra vostro",
  nl: "de het een en is zijn voor met van op dat die niet ons onze uw jouw ook bij",
  pt: "o a os as e é são para com uma um do da de em que por seu sua nosso nossa você não",
  id: "dan yang di ini itu untuk dengan dari ke tidak kami anda adalah pada juga atau",
};
