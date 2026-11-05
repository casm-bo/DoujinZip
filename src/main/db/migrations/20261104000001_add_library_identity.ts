import { randomUUID } from "node:crypto";
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("LibraryIdentity", (table) => {
    table.integer("singleton").primary();
    table.text("library_id").notNullable();
  });
  await knex("LibraryIdentity").insert({ singleton: 1, library_id: randomUUID() });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("LibraryIdentity");
}
