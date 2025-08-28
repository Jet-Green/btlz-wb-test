// src/service/googleSheetsService.ts

import { google } from "googleapis";
import path from "path";
import db from "#postgres/knex.js";
import env from "#config/env/env.js";

const KEY_FILE_PATH = path.join(process.cwd(), "src/config/credentials", env.SPREADSHEET_CREDENTIALS_NAME);
const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheetsApi = google.sheets({ version: "v4", auth });

const SHEET_NAME = "stocks_coefs";

async function getAllTariffsForExport() {
    const allTariffs = await db("warehouse_tariffs as wt")
        .join("tariff_snapshots as ts", "wt.snapshot_id", "ts.id")
        .select(
            db.raw("TO_CHAR(ts.snapshot_date, 'YYYY-MM-DD') as snapshot_date"),
            "ts.dt_next_box",
            "ts.dt_till_max",
            "wt.warehouse_name",
            "wt.geo_name",
            "wt.box_delivery_base",
            "wt.box_delivery_coef_expr",
            "wt.box_delivery_liter",
            "wt.box_delivery_marketplace_base",
            "wt.box_delivery_marketplace_coef_expr",
            "wt.box_delivery_marketplace_liter",
            "wt.box_storage_base",
            "wt.box_storage_coef_expr",
            "wt.box_storage_liter",
        )
        .orderBy([
            { column: "ts.snapshot_date", order: "desc" },
            { column: "wt.box_delivery_coef_expr", order: "asc" },
        ]);

    return allTariffs;
}
export const spreadsheetService = {
    async updateMainTariffSheet() {
        console.log("Starting update for spreadsheets...");

        const spreadsheets = await db("spreadsheets").select("spreadsheet_id");
        const spreadsheetIds = spreadsheets.map((s) => s.spreadsheet_id);
        if (spreadsheetIds.length === 0) {
            console.log("No spreadsheets configured.");
            return;
        }

        const allTariffs = await getAllTariffsForExport();
        if (allTariffs.length === 0) {
            console.log("No tariff data found in the database.");
            return;
        }

        const headerRow = [
            "Дата тарифа",
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

        const dataRows = allTariffs.map((t) => [
            t.snapshot_date,
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

        for (const sheetId of spreadsheetIds) {
            try {
                console.log(`Processing spreadsheet: ${sheetId}`);

                const spreadsheetInfo = await sheetsApi.spreadsheets.get({
                    spreadsheetId: sheetId,
                    fields: "sheets.properties.title",
                });
                const existingSheetTitles = spreadsheetInfo.data.sheets?.map((s) => s.properties?.title) || [];

                if (!existingSheetTitles.includes(SHEET_NAME)) {
                    await sheetsApi.spreadsheets.batchUpdate({
                        spreadsheetId: sheetId,
                        requestBody: {
                            requests: [
                                {
                                    addSheet: { properties: { title: SHEET_NAME } },
                                },
                            ],
                        },
                    });
                }

                await sheetsApi.spreadsheets.values.clear({
                    spreadsheetId: sheetId,
                    range: SHEET_NAME,
                });

                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId: sheetId,
                    range: `${SHEET_NAME}!A1`,
                    valueInputOption: "USER_ENTERED",
                    requestBody: {
                        values: valuesToInsert,
                    },
                });

                console.log(`Successfully rebuilt sheet '${SHEET_NAME}' in spreadsheet: ${sheetId} with ${allTariffs.length} rows.`);
            } catch (error: any) {
                console.error(`Failed to update sheet ${sheetId}. Error:`, error.message);
            }
        }
    },
};
