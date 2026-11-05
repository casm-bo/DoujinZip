export interface HitomiLanguage {
  value: string;
  label: string;
}

export function parseAvailableLanguages(script: string): HitomiLanguage[] {
  const read = (name: string): Record<string, unknown> => {
    const match = script.match(new RegExp(`\\b${name}\\s*=\\s*(\\{[^}]*\\})`));
    if (!match) throw new Error("언어 목록 응답 형식이 올바르지 않습니다.");
    return JSON.parse(match[1]);
  };
  const names = read("bitnumber_language");
  const labels = read("language_localname");
  const languages = new Map<string, HitomiLanguage>();
  for (const raw of Object.values(names)) {
    if (typeof raw !== "string") throw new Error("잘못된 언어 코드입니다.");
    const value = raw.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z]+(?:_[a-z]+)*$/.test(value) || value === "all")
      throw new Error("잘못된 언어 코드입니다.");
    const label = labels[raw];
    languages.set(value, {
      value,
      label: typeof label === "string" && label.trim() ? label : raw,
    });
  }
  if (!languages.size) throw new Error("서버 언어 목록이 비어 있습니다.");
  return [...languages.values()].sort((a, b) => a.label.localeCompare(b.label));
}

let cached: { items: HitomiLanguage[]; at: number } | undefined;
export async function getAvailableLanguages(): Promise<HitomiLanguage[]> {
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000)
    return cached.items;
  const response = await fetch(
    "https://ltn.gold-usergeneratedcontent.net/language_support.js",
    {
      headers: { Referer: "https://hitomi.la/" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok)
    throw new Error(`언어 목록을 가져오지 못했습니다 (${response.status}).`);
  const script = await response.text();
  if (script.length > 65_536) throw new Error("언어 목록 응답이 너무 큽니다.");
  const items = parseAvailableLanguages(script);
  cached = { items, at: Date.now() };
  return items;
}
