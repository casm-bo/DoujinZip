export function getThumbnailUrl(
  coverPath: string | null | undefined,
  version: string | number = 0,
): string {
  const parts = coverPath?.split(/[/\\]/);
  const fileName = parts?.at(-1);
  if (!fileName) return "";
  const kind =
    parts?.at(-2) === "presentation-covers" &&
    /^[a-f0-9]{64}\.image$/.test(fileName)
      ? "presentation-cover"
      : "thumbnail";
  const query = version ? `?v=${encodeURIComponent(String(version))}` : "";
  return `doujinzip://${kind}/${encodeURIComponent(fileName)}${query}`;
}
