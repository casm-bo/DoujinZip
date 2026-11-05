import type { Knex } from "knex";

export async function up(db: Knex): Promise<void> {
  await db("Book").whereNull("content_token").update({
    content_manifest: JSON.stringify({ source: "pending", pages: [] }),
  });
}

export async function down(): Promise<void> {}
