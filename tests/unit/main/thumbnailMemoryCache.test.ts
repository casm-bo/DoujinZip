import { describe, expect, it } from "vitest";
import { ThumbnailMemoryCache } from "../../../src/main/utils/thumbnailMemoryCache.js";

describe("thumbnail memory cache", () => {
  it("evicts the least recently used image within the byte limit", () => {
    const cache = new ThumbnailMemoryCache(6);
    cache.set("a", Buffer.from("aaa"));
    cache.set("b", Buffer.from("bbb"));
    cache.get("a");
    cache.set("c", Buffer.from("ccc"));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")?.toString()).toBe("aaa");
    expect(cache.sizeBytes).toBe(6);
  });

  it("accounts for replacements, rejects oversized images and clears memory", () => {
    const cache = new ThumbnailMemoryCache(6);
    cache.set("a", Buffer.from("aaa"));
    cache.set("a", Buffer.from("a"));
    expect(cache.sizeBytes).toBe(1);
    expect(cache.set("large", Buffer.alloc(7))).toBe(false);
    expect(cache.get("large")).toBeUndefined();
    expect(cache.sizeBytes).toBe(1);
    cache.clear();
    expect(cache.sizeBytes).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});
