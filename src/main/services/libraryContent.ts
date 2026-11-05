import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import type { Knex } from "knex";
import yauzl from "yauzl";
import { isImageFile, sortImageFiles } from "../utils/imageFiles.js";
import { naturalSort } from "../utils/index.js";

export interface ContentManifest {
  source: string;
  pages: { name: string; signature: string }[];
}

async function digestFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function inspectContent(
  source: string,
  previous?: ContentManifest | null,
  force = false,
): Promise<ContentManifest> {
  const stat = await fs.stat(source);
  const signature = `${stat.size}:${stat.mtimeMs}`;
  if (stat.isDirectory()) {
    const pages: ContentManifest["pages"] = [];
    // Bound metadata I/O even for large folders and network drives.
    for (const name of sortImageFiles(await fs.readdir(source))) {
      const file = path.join(source, name);
      const info = await fs.stat(file);
      if (!info.isFile()) continue;
      pages.push({
        name,
        signature: force
          ? await digestFile(file)
          : `${info.size}:${info.mtimeMs}`,
      });
    }
    return { source: "folder", pages };
  }
  if (!/\.(zip|cbz)$/i.test(source))
    throw new Error("Unsupported library content");
  // shortcut: unchanged size/mtime skips archive inspection; force rescans bypass it.
  if (!force && previous?.source === signature) return previous;
  const pages = await new Promise<ContentManifest["pages"]>(
    (resolve, reject) => {
      yauzl.open(source, { lazyEntries: true }, (error, zip) => {
        if (error || !zip)
          return reject(error ?? new Error("Cannot open archive"));
        const entries: ContentManifest["pages"] = [];
        zip.on("error", reject);
        zip.on("entry", (entry) => {
          if (!entry.fileName.endsWith("/") && isImageFile(entry.fileName)) {
            entries.push({
              name: entry.fileName,
              signature: `${entry.uncompressedSize}:${entry.crc32}`,
            });
          }
          zip.readEntry();
        });
        zip.on("end", () =>
          resolve(entries.sort((a, b) => naturalSort(a.name, b.name))),
        );
        zip.readEntry();
      });
    },
  );
  return {
    source: force ? `${signature}:${await digestFile(source)}` : signature,
    pages,
  };
}

export async function saveContent(
  db: Knex,
  bookId: number,
  manifest: ContentManifest,
) {
  const book = await db("Book").where("id", bookId).first();
  if (!book) throw new Error("Book not found");
  const previous: ContentManifest | null = book.content_manifest
    ? JSON.parse(book.content_manifest)
    : null;
  const changed =
    !book.content_token ||
    JSON.stringify(previous?.pages) !== JSON.stringify(manifest.pages);
  const firstChanged =
    !previous ||
    JSON.stringify(previous.pages[0]) !== JSON.stringify(manifest.pages[0]);
  const serialized = JSON.stringify(manifest);
  if (changed || serialized !== book.content_manifest) {
    await db("Book")
      .where("id", bookId)
      .update({
        content_manifest: serialized,
        ...(changed
          ? {
              content_token: randomUUID(),
              content_revision: Number(book.content_revision || 0) + 1,
              page_count: manifest.pages.length,
            }
          : {}),
      });
  }
  const customCover =
    book.cover_path &&
    path.basename(path.dirname(book.cover_path)) === "presentation-covers";
  if (firstChanged && book.cover_path && !customCover) {
    await db("Book").where("id", bookId).update({ cover_path: null });
  }
  return {
    changed,
    firstChanged,
    staleCover:
      firstChanged && !customCover ? (book.cover_path as string | null) : null,
  };
}
