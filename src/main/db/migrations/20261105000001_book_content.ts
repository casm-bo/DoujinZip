import type { Knex } from "knex";

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("Book", (table) => {
    table.text("content_manifest").nullable();
    table.string("content_token").nullable();
    table.integer("content_revision").notNullable().defaultTo(0);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("Book", (table) => {
    table.dropColumns("content_manifest", "content_token", "content_revision");
  });
}
