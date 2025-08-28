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

/**
 * Получает и сортирует актуальные тарифы из БД для выгрузки.
 *
 * @param forDate Дата в формате 'YYYY-MM-DD'
 */
async function getTariffsForExport(forDate: string) {
    const snapshot = await db("tariff_snapshots").where("snapshot_date", forDate).first();

    if (!snapshot) {
        console.log(`No snapshot found for date ${forDate}.`);
        return [];
    }

    const tariffs = await db("warehouse_tariffs").where("snapshot_id", snapshot.id).orderBy("box_delivery_coef_expr", "asc");

    return tariffs.map((tariff) => ({
        ...tariff,
        dt_next_box: snapshot.dt_next_box,
        dt_till_max: snapshot.dt_till_max,
    }));
}

export const spreadsheetService = {
    async updateMainTariffSheet() {
        console.log("Starting spreadsheet update...");

        const SHEET_NAME = "stocks_coefs";

        const spreadsheets = await db("spreadsheets").select("spreadsheet_id");
        const spreadsheetIds = spreadsheets.map((s) => s.spreadsheet_id);
        if (spreadsheetIds.length === 0) {
            console.log("No spreadsheets configured.");
            return;
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const today = `${year}-${month}-${day}`;

        const tariffs = await getTariffsForExport(today);
        if (tariffs.length === 0) {
            console.log("No tariff data for today.");
            return;
        }

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

                console.log(`Successfully updated sheet '${SHEET_NAME}' in spreadsheet: ${sheetId}`);
            } catch (error: any) {
                console.error(`Failed to update sheet ${sheetId}. Error:`, error.message);
            }
        }
        console.log("Single-sheet update process finished.");
    },
};
