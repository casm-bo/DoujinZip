import { expect, it, vi, afterEach } from "vitest";
import {
  getAvailableLanguages,
  parseAvailableLanguages,
} from "../../../src/main/services/hitomi/languages";

afterEach(() => vi.unstubAllGlobals());
it("puts Korean, Japanese, English and Chinese before the remaining languages", () => {
  const codes = [
    "french",
    "chinese",
    "german",
    "japanese",
    "english",
    "korean",
  ];
  const script = `bitnumber_language=${JSON.stringify(Object.fromEntries(codes.map((value, index) => [index, value])))};language_localname={};`;
  expect(parseAvailableLanguages(script).map((item) => item.value)).toEqual([
    "korean",
    "japanese",
    "english",
    "chinese",
    "french",
    "german",
  ]);
  expect(
    parseAvailableLanguages(
      'bitnumber_language={"0":"english","1":"french"};language_localname={}',
    ).map((item) => item.value),
  ).toEqual(["english", "french"]);
});
it("parses, normalizes and deduplicates the server language list", () => {
  expect(
    parseAvailableLanguages(
      'var bitnumber_language = {"0":"korean","1":"portuguese brazil","2":"korean"}; var language_localname = {"korean":"한국어"};',
    ),
  ).toEqual(
    expect.arrayContaining([
      { value: "korean", label: "한국어" },
      { value: "portuguese_brazil", label: "portuguese brazil" },
    ]),
  );
});
it("rejects malformed or empty lists", () => {
  for (const script of [
    "",
    "bitnumber_language={};language_localname={}",
    'bitnumber_language={"0":"<bad>"};language_localname={}',
  ])
    expect(() => parseAvailableLanguages(script)).toThrow();
});
it("retries failed requests and caches a successful response", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValue({
      ok: true,
      text: async () =>
        'bitnumber_language={"0":"korean"};language_localname={"korean":"한국어"}',
    });
  vi.stubGlobal("fetch", fetcher);
  await expect(getAvailableLanguages()).rejects.toThrow("503");
  expect(await getAvailableLanguages()).toEqual([
    { value: "korean", label: "한국어" },
  ]);
  await getAvailableLanguages();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
