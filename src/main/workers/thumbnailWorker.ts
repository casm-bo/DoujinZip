import fs from "fs/promises";
import sharp from "sharp";
import { parentPort } from "worker_threads";
import { readZipPage } from "../utils/zipPages.js";

if (parentPort) {
  parentPort.on(
    "message",
    async (task: {
      sourcePath: string;
      thumbnailPath: string;
      bookId: number;
      thumbnailDirPath: string;
    }) => {
      const { sourcePath, thumbnailPath, bookId, thumbnailDirPath } = task;
      const pendingThumbnailPath = `${thumbnailPath}.tmp`;

      let result:
        | { status: "success"; bookId: number; thumbnailPath: string }
        | { status: "error"; bookId: number; error: string };

      try {
        // 썸네일 디렉토리가 없으면 생성 (워커 스레드에서 직접 처리)
        await fs.mkdir(thumbnailDirPath, { recursive: true });

        // 원본 이미지를 버퍼로 읽어 sharp에 전달하여 파일 핸들 문제를 방지
        const imageBuffer = /\.(cbz|zip)$/i.test(sourcePath)
          ? (await readZipPage(sourcePath, 0))?.buffer
          : await fs.readFile(sourcePath);
        if (!imageBuffer) throw new Error("Archive has no cover image");
        await sharp(imageBuffer)
          .resize(512)
          .webp()
          .toFile(pendingThumbnailPath);
        await fs.copyFile(pendingThumbnailPath, thumbnailPath);

        result = { status: "success", bookId, thumbnailPath };
      } catch (error) {
        console.error(
          `[Worker] Failed to generate thumbnail for book ${bookId}:`,
          error,
        );
        result = {
          status: "error",
          bookId,
          error: (error as Error).message,
        };
      } finally {
        await fs.rm(pendingThumbnailPath, { force: true }).catch(() => {});
      }
      parentPort?.postMessage(result);
    },
  );
}
