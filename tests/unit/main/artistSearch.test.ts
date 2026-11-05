import { expect, it } from "vitest";
import { normalizeArtistSearchQuery } from "../../../src/shared/search";
import { isSyncedSubscription } from "../../../src/main/services/subscription/subscriptionSync";
import {
  normalizeQuery,
  validateSubscriptionQuery,
} from "../../../src/main/services/subscription/query";

it("normalizes spaced, negative and repeated artists while preserving other terms", () => {
  expect(
    normalizeArtistSearchQuery(
      "title artist:hi hello -artist:other name language:korean",
    ),
  ).toBe("title artist:hi_hello -artist:other_name language:korean");
  expect(
    normalizeArtistSearchQuery("artist: hi  hello female:sole_female"),
  ).toBe("artist:hi_hello female:sole_female");
});
it("validates and deduplicates both subscription spellings", () => {
  expect(validateSubscriptionQuery("artist:hi hello")).toEqual({ ok: true });
  expect(normalizeQuery("artist:hi hello")).toBe(
    normalizeQuery("artist:hi_hello"),
  );
  expect(
    isSyncedSubscription({
      id: "example",
      name: "Example",
      query: "artist:hi hello female:sole_female",
      languages: [],
      enabled: true,
      deleted: false,
      version: 1,
    }),
  ).toBe(true);
});
