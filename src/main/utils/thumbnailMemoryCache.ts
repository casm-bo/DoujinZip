export class ThumbnailMemoryCache {
  private readonly entries = new Map<string, Buffer>();
  private bytes = 0;

  get sizeBytes(): number {
    return this.bytes;
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  constructor(private readonly maxBytes: number) {}

  get(key: string): Buffer | undefined {
    const image = this.entries.get(key);
    if (image) {
      this.entries.delete(key);
      this.entries.set(key, image);
    }
    return image;
  }

  set(key: string, image: Buffer): boolean {
    const previous = this.entries.get(key);
    if (previous) {
      this.bytes -= previous.length;
      this.entries.delete(key);
    }
    if (image.length > this.maxBytes) return false;
    while (this.bytes + image.length > this.maxBytes) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.length;
      this.entries.delete(oldest);
    }
    this.entries.set(key, image);
    this.bytes += image.length;
    return true;
  }
}

export const downloadThumbnailCache = new ThumbnailMemoryCache(
  256 * 1024 * 1024,
);
