/** Artist names may contain spaces; the next prefixed condition ends the name. */
export function normalizeArtistSearchQuery(query: string): string {
  return query.replace(
    /(-?artist:)\s*(.+?)(?=\s+-?(?:id|artist|group|type|language|series|character|tag|male|female):|$)/gi,
    (_, prefix: string, name: string) =>
      prefix + name.trim().replace(/[\s_]+/gu, "_"),
  );
}
