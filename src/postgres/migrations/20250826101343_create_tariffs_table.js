/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.createTable("tariff_snapshots", (table) => {
        table.increments("id").primary();

        // Дата, за которую были запрошены тарифы.
        table.date("snapshot_date").notNullable();

        table.timestamp("dt_next_box").nullable();
        table.timestamp("dt_till_max").nullable();

        table.timestamps(true, true);
    });

    await knex.schema.createTable("warehouse_tariffs", (table) => {
        table.increments("id").primary();

        table.integer("snapshot_id").unsigned().notNullable().references("id").inTable("tariff_snapshots").onDelete("CASCADE"); // При удалении удалятся и все связанные с ним тарифы

        table.decimal("box_delivery_base", 10, 2).notNullable();
        table.decimal("box_delivery_coef_expr", 10, 2).notNullable();
        table.decimal("box_delivery_liter", 10, 2).notNullable();
        table.decimal("box_delivery_marketplace_base", 10, 2).notNullable();
        table.decimal("box_delivery_marketplace_coef_expr", 10, 2).notNullable();
        table.decimal("box_delivery_marketplace_liter", 10, 2).notNullable();
        table.decimal("box_storage_base", 10, 2).notNullable();
        table.decimal("box_storage_coef_expr", 10, 2).notNullable();
        table.decimal("box_storage_liter", 10, 2).notNullable();

        table.string("geo_name").notNullable();
        table.string("warehouse_name").notNullable();

        table.unique(["snapshot_id", "warehouse_name"]); // уникальная связка
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.dropTableIfExists("warehouse_tariffs");
    await knex.schema.dropTableIfExists("tariff_snapshots");
}
