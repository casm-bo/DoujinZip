import fs from "fs/promises";
import os from "os";
import path from "path";
import { createWriteStream } from "fs";
import archiver from "archiver";
import type { Knex } from "knex";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb, seedBook } from "../../../src/main/db/test-utils.js";
import { up as verifyExistingContent } from "../../../src/main/db/migrations/20261105000002_verify_existing_content.js";
import {
  inspectContent,
  saveContent,
} from "../../../src/main/services/libraryContent.js";

let directory: string;
let db: Knex;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "content-test-"));
  db = await createTestDb();
});
afterEach(async () => {
  await db.destroy();
  await fs.rm(directory, { recursive: true, force: true });
});

it("reuses unchanged versions and updates added, replaced, reordered and removed pages", async () => {
  await fs.writeFile(path.join(directory, "2.jpg"), "original");
  const book = await seedBook(db, {
    path: directory,
    current_page: 1,
    is_favorite: true,
  });
  const save = async () =>
    db.transaction((trx) => saveContent(trx, book.id, awaitManifest));
  let awaitManifest = await inspectContent(directory);
  await save();
  const original = await db("Book").where("id", book.id).first();
  await save();
  expect(await db("Book").where("id", book.id).first()).toEqual(original);
  await fs.writeFile(path.join(directory, "1.jpg"), "added");
  awaitManifest = await inspectContent(directory);
  await save();
  let updated = await db("Book").where("id", book.id).first();
  expect(updated.page_count).toBe(2);
  expect(updated.content_revision).toBe(2);
  expect(updated.content_token).not.toBe(original.content_token);
  expect(updated.current_page).toBe(1);
  expect(updated.is_favorite).toBe(1);
  await fs.writeFile(
    path.join(directory, "2.jpg"),
    "replacement with different size",
  );
  awaitManifest = await inspectContent(directory);
  await save();
  await fs.rename(path.join(directory, "1.jpg"), path.join(directory, "3.jpg"));
  awaitManifest = await inspectContent(directory);
  await save();
  await fs.unlink(path.join(directory, "2.jpg"));
  await fs.unlink(path.join(directory, "3.jpg"));
  awaitManifest = await inspectContent(directory);
  await save();
  updated = await db("Book").where("id", book.id).first();
  expect(updated.page_count).toBe(0);
  expect(updated.content_revision).toBe(5);
});

it("invalidates default covers only when the first page changes, and preserves custom covers", async () => {
  await fs.writeFile(path.join(directory, "1.jpg"), "first");
  const book = await seedBook(db, { path: directory });
  const first = await inspectContent(directory);
  await db.transaction((trx) => saveContent(trx, book.id, first));
  await db("Book")
    .where("id", book.id)
    .update({ cover_path: path.join(directory, "thumb.webp") });
  await fs.writeFile(path.join(directory, "2.jpg"), "second");
  expect(
    (
      await db.transaction((trx) =>
        saveContent(trx, book.id, {
          ...first,
          pages: [...first.pages, { name: "2.jpg", signature: "new" }],
        }),
      )
    ).staleCover,
  ).toBeNull();
  const custom = path.join(directory, "presentation-covers", "synthetic.image");
  await db("Book").where("id", book.id).update({ cover_path: custom });
  await fs.writeFile(path.join(directory, "1.jpg"), "new first image");
  const changed = await inspectContent(directory);
  await db.transaction((trx) => saveContent(trx, book.id, changed));
  expect((await db("Book").where("id", book.id).first()).cover_path).toBe(
    custom,
  );
});

it("reads archive metadata without decoding images and reuses unchanged archive manifests", async () => {
  const file = path.join(directory, "book.cbz");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(file);
    const zip = archiver("zip");
    output.on("close", resolve);
    output.on("error", reject);
    zip.on("error", reject);
    zip.pipe(output);
    zip.append("image", { name: "10.jpg" });
    zip.append("image", { name: "2.jpg" });
    zip.append("metadata", { name: "info.txt" });
    void zip.finalize();
  });
  const manifest = await inspectContent(file);
  expect(manifest.pages.map((page) => page.name)).toEqual(["2.jpg", "10.jpg"]);
  expect(await inspectContent(file, manifest)).toBe(manifest);
});

it("does not modify stored content on inaccessible source errors", async () => {
  const book = await seedBook(db, { path: directory });
  const original = await db("Book").where("id", book.id).first();
  await expect(
    inspectContent(path.join(directory, "missing")),
  ).rejects.toThrow();
  expect(await db("Book").where("id", book.id).first()).toEqual(original);
});

it("marks legacy backup rows for verification without changing user data", async () => {
  const book = await seedBook(db, {
    path: directory,
    is_favorite: true,
    current_page: 3,
  });
  await verifyExistingContent(db);
  const migrated = await db("Book").where("id", book.id).first();
  expect(JSON.parse(migrated.content_manifest)).toEqual({
    source: "pending",
    pages: [],
  });
  expect(migrated.content_revision).toBe(0);
  expect(migrated.is_favorite).toBe(1);
  expect(migrated.current_page).toBe(3);
});
