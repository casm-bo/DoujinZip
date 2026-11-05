import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { text } from "node:stream/consumers";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/main/db/index.ts", () => ({ default: null }));
vi.mock("../../../src/main/handlers/bookHandler.ts", () => ({
  handleDeleteBook: vi.fn(),
}));

import { createTestDb, seedBook } from "../../../src/main/db/test-utils.js";
import {
  inspectContent,
  saveContent,
} from "../../../src/main/services/libraryContent.js";
import { DesktopLibraryService } from "../../../src/main/services/companion/companionLibraryService.js";
import { DesktopCompanionSyncService } from "../../../src/main/services/companion/companionSyncService.js";

describe("Android reinstall recovery", () => {
  let db: Knex;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("requires reinspection after restore and issues a fresh cache token without resetting user data", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "restore-content-"));
    try {
      await fs.writeFile(path.join(root, "1.jpg"), "image");
      const book = await seedBook(db, {
        path: root,
        is_favorite: true,
        current_page: 1,
      });
      const manifest = await inspectContent(root);
      await db.transaction((trx) => saveContent(trx, book.id, manifest));
      const old = await db("Book").where("id", book.id).first();
      await db("Book")
        .where("id", book.id)
        .update({
          content_token: null,
          content_manifest: JSON.stringify({ source: "pending", pages: [] }),
        });
      const library = new DesktopLibraryService(db);
      await expect(library.listBooks()).rejects.toThrow(
        "verify restored content",
      );
      expect(await library.getPageCount(book.id)).toBeNull();
      await db.transaction((trx) => saveContent(trx, book.id, manifest));
      const restored = await db("Book").where("id", book.id).first();
      expect(restored.content_token).not.toBe(old.content_token);
      expect(restored.content_revision).toBe(old.content_revision + 1);
      expect(restored.is_favorite).toBe(1);
      expect(restored.current_page).toBe(1);
      expect(
        (await library.listBooks()).find((item) => item.id === book.id)
          ?.contentVersion,
      ).toBe(restored.content_token);
    } finally {
      await db("Book").where("path", root).del();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("assigns a persistent identity per library database", async () => {
    const other = await createTestDb();
    try {
      const identity = await db("LibraryIdentity").first();
      expect(identity.library_id).toMatch(/^[a-f0-9-]{36}$/);
      expect((await other("LibraryIdentity").first()).library_id).not.toBe(
        identity.library_id,
      );
      await db.migrate.latest();
      expect(await db("LibraryIdentity").first()).toEqual(identity);
    } finally {
      await other.destroy();
    }
  });

  it("restores server-saved series and all book state into a fresh bootstrap", async () => {
    const book = await seedBook(db, { page_count: 20 });
    const stored = await db("Book").where("id", book.id).first();
    const sync = new DesktopCompanionSyncService(db);
    const library = new DesktopLibraryService(db);

    await library.saveSeriesAssignments([
      {
        mutationId: "series-before-reinstall",
        bookSyncId: stored.sync_id,
        name: "Recovery series",
        order: 3,
        baseVersion: 0,
      },
    ]);
    await sync.applyMutations("old-android-install", [
      {
        mutationId: "state-before-reinstall",
        bookSyncId: stored.sync_id,
        baseVersion: 1,
        currentPage: 8,
        isFavorite: true,
        isRead: true,
        isHidden: true,
        customTitle: "Recovered title",
        seriesFavorite: true,
      },
    ]);

    const freshClientBootstrap = await new DesktopCompanionSyncService(
      db,
    ).bootstrap();
    const freshClientLibrary = await new DesktopLibraryService(db).listBooks();

    expect(freshClientBootstrap.books[0]).toMatchObject({
      syncId: stored.sync_id,
      currentPage: 8,
      isFavorite: true,
      isRead: true,
      isHidden: true,
      customTitle: "Recovered title",
      seriesFavorite: true,
      version: 2,
    });
    expect(freshClientLibrary[0].seriesCollection).toMatchObject({
      name: "Recovery series",
      order: 3,
    });
  });
});

describe("Companion thumbnail paths", () => {
  it("ignores an old catalog path even when its thumbnail was copied", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cover-fixture-"));
    const legacy = path.join(root, "legacy");
    const thumbnails = path.join(root, "thumbnails");
    const pages = path.join(root, "pages");
    const oldCover = path.join(legacy, "42.webp");
    const currentCover = path.join(thumbnails, "42.webp");
    const book = { path: pages, cover_path: oldCover };
    const lookup = {
      select: () => lookup,
      where: () => lookup,
      first: async () => book,
    };
    const db = (() => lookup) as unknown as Knex;
    const library = new DesktopLibraryService(
      db,
      undefined,
      undefined,
      () => thumbnails,
    );
    try {
      await Promise.all(
        [legacy, thumbnails, pages].map((dir) => fs.mkdir(dir)),
      );
      await fs.writeFile(path.join(pages, "1.png"), "original page");
      await fs.writeFile(oldCover, "other catalog");
      await fs.copyFile(oldCover, currentCover);
      expect(await text((await library.getCover(42))!.stream)).toBe(
        "original page",
      );

      book.cover_path = currentCover;
      await fs.writeFile(currentCover, "current cover");
      expect(await text((await library.getCover(42))!.stream)).toBe(
        "current cover",
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
