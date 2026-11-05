import { afterEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";
import sharp from "sharp";

const { port } = vi.hoisted(() => ({
  port: { on: vi.fn(), postMessage: vi.fn() },
}));
vi.mock("worker_threads", () => ({ parentPort: port }));
await import("../../../src/main/workers/thumbnailWorker.js");
const run = port.on.mock.calls[0][1] as (task: {
  sourcePath: string;
  thumbnailPath: string;
  bookId: number;
  thumbnailDirPath: string;
}) => Promise<void>;
let directory: string;

afterEach(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
  port.postMessage.mockClear();
});

it("reads the naturally first ZIP page in memory and writes only the finished thumbnail", async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "cover-worker-"));
  const archivePath = path.join(directory, "book.CBZ");
  const red = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(archivePath);
    const archive = archiver("zip");
    output.on("close", resolve).on("error", reject);
    archive.on("error", reject).pipe(output);
    archive.append(blue, { name: "10.png" });
    archive.append(red, { name: "2.png" });
    void archive.finalize();
  });
  const thumbnailPath = path.join(directory, "thumbnails", "1.webp");
  await run({
    sourcePath: archivePath,
    thumbnailPath,
    bookId: 1,
    thumbnailDirPath: path.dirname(thumbnailPath),
  });
  expect(port.postMessage).toHaveBeenLastCalledWith({
    status: "success",
    bookId: 1,
    thumbnailPath,
  });
  const { data, info } = await sharp(await fs.readFile(thumbnailPath))
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.width).toBe(512);
  expect(data[0]).toBeGreaterThan(240);
  expect(data[2]).toBeLessThan(15);
  expect(await fs.readdir(directory)).toEqual(["book.CBZ", "thumbnails"]);
  expect(await fs.readdir(path.dirname(thumbnailPath))).toEqual(["1.webp"]);
});

it("preserves the existing thumbnail when archive decoding fails", async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "cover-worker-"));
  const thumbnailPath = path.join(directory, "1.webp");
  await fs.writeFile(thumbnailPath, "previous");
  await run({
    sourcePath: path.join(directory, "missing.zip"),
    thumbnailPath,
    bookId: 1,
    thumbnailDirPath: directory,
  });
  expect(port.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "error" }),
  );
  expect(await fs.readFile(thumbnailPath, "utf8")).toBe("previous");
  expect(await fs.readdir(directory)).toEqual(["1.webp"]);
});
