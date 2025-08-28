import { google } from "googleapis";
import path from "path";
import knexConfig from "../config/knex/knexfile.js";
import knex from "knex";
import env from "#config/env/env.js";

const db = knex(knexConfig);

const KEY_FILE_PATH = path.join(process.cwd(), "src/config/credentials", env.SPREADSHEET_CREDENTIALS_NAME);

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheetsApi = google.sheets({ version: "v4", auth });

async function getTariffsForExport(forDate: string) {
    const snapshot = await db("tariff_snapshots").where("snapshot_date", forDate).first();
    if (!snapshot) return [];

    const tariffs = await db("warehouse_tariffs").where("snapshot_id", snapshot.id).orderBy("box_delivery_coef_expr", "asc");

    return tariffs.map((tariff) => ({
        ...tariff,
        dt_next_box: snapshot.dt_next_box,
        dt_till_max: snapshot.dt_till_max,
    }));
}

export const spreadsheetService = {
    async insertOne(sheetId: string) {
        let candidate = await db("spreadsheets").where("spreadsheet_id", sheetId).first();
        if (candidate) throw new Error(`spreadsheet with id ${sheetId} already exists`);
        await db("spreadsheets").insert({ "spreadsheet_id": sheetId });
    },
    async syncAllGoogleSheets() {
        console.log("Starting Google Sheets full synchronization process...");

        const spreadsheets = await db("spreadsheets").select("spreadsheet_id");
        const spreadsheetIds = spreadsheets.map((s) => s.spreadsheet_id);
        if (spreadsheetIds.length === 0) {
            console.log("No spreadsheets configured. Exiting.");
            return;
        }

        const allSnapshots = await db("tariff_snapshots").select(db.raw("TO_CHAR(snapshot_date, 'YYYY-MM-DD') as snapshot_date"));
        const allDbDates = allSnapshots.map((s) => s.snapshot_date);

        if (allDbDates.length === 0) {
            console.log("No data found in the database to sync. Exiting.");
            return;
        }

        const today = new Date().toISOString().split("T")[0];

        for (const sheetId of spreadsheetIds) {
            try {
                console.log(`\n--- Processing Spreadsheet: ${sheetId} ---`);

                const spreadsheetInfo = await sheetsApi.spreadsheets.get({
                    spreadsheetId: sheetId,
                    fields: "sheets.properties.title",
                });
                const existingSheetTitles = new Set(spreadsheetInfo.data.sheets?.map((s) => s.properties?.title) || []);

                for (const targetDate of allDbDates) {
                    const isToday = targetDate === today;
                    const sheetExists = existingSheetTitles.has(targetDate);

                    if (isToday || !sheetExists) {
                        if (isToday) {
                            console.log(`Updating sheet for TODAY: '${targetDate}'...`);
                        } else {
                            console.log(`Sheet for historical date '${targetDate}' is MISSING. Creating it...`);
                        }

                        // Получаем данные для конкретной даты
                        const tariffs = await getTariffsForExport(targetDate);
                        if (tariffs.length === 0) {
                            console.log(`No data for '${targetDate}', skipping sheet creation/update.`);
                            continue; // Переходим к следующей дате
                        }

                        // Готовим данные для вставки
                        const headerRow = [
                            "Склад",
                            "Регион",
                            "Дата след. тарифа",
                            "Дата макс. тарифа",
                            "Логистика FBO, база ₽",
                            "Коэф. логистики FBO, %",
                            "Логистика FBO, доп. литр ₽",
                            "Логистика FBS, база ₽",
                            "Коэф. логистики FBS, %",
                            "Логистика FBS, доп. литр ₽",
                            "Хранение, база ₽",
                            "Коэф. хранения, %",
                            "Хранение, доп. литр ₽",
                        ];
                        const dataRows = tariffs.map((t) => [
                            t.warehouse_name,
                            t.geo_name,
                            t.dt_next_box,
                            t.dt_till_max,
                            t.box_delivery_base,
                            t.box_delivery_coef_expr,
                            t.box_delivery_liter,
                            t.box_delivery_marketplace_base,
                            t.box_delivery_marketplace_coef_expr,
                            t.box_delivery_marketplace_liter,
                            t.box_storage_base,
                            t.box_storage_coef_expr,
                            t.box_storage_liter,
                        ]);
                        const valuesToInsert = [headerRow, ...dataRows];

                        if (!sheetExists) {
                            await sheetsApi.spreadsheets.batchUpdate({
                                spreadsheetId: sheetId,
                                requestBody: { requests: [{ addSheet: { properties: { title: targetDate } } }] },
                            });
                        }

                        await sheetsApi.spreadsheets.values.clear({ spreadsheetId: sheetId, range: targetDate });
                        await sheetsApi.spreadsheets.values.update({
                            spreadsheetId: sheetId,
                            range: `${targetDate}!A1`,
                            valueInputOption: "USER_ENTERED",
                            requestBody: { values: valuesToInsert },
                        });

                        console.log(`Successfully processed sheet for '${targetDate}'.`);
                    } else {
                        // Это случай, когда лист для старой даты уже существует
                        console.log(`Sheet for historical date '${targetDate}' already exists. Skipping.`);
                    }
                }
            } catch (error: any) {
                console.error(`Failed to process spreadsheet ${sheetId}. Error:`, error.message);
            }
        }
        console.log("\nGoogle Sheets full synchronization process finished.");
    },
};
