import axios from "axios";
import knex from "knex";
import knexConfig from "../config/knex/knexfile.js";
import env from "#config/env/env.js";

const db = knex(knexConfig);

interface WarehouseTariff {
    // Логистика, первый литр, ₽
    boxDeliveryBase: string;
    // Коэффициент Логистика, %. Уже учтён в тарифах
    boxDeliveryCoefExpr: string;
    // Логистика, дополнительный литр, ₽
    boxDeliveryLiter: string;
    // Логистика FBS, первый литр, ₽
    boxDeliveryMarketplaceBase: string;
    // Коэффициент FBS, %. Уже учтён в тарифах
    boxDeliveryMarketplaceCoefExpr: string;
    // Логистика FBS, дополнительный литр, ₽
    boxDeliveryMarketplaceLiter: string;
    // Хранение в день, первый литр, ₽
    boxStorageBase: string;
    // Коэффициент Хранение, %. Уже учтён в тарифах
    boxStorageCoefExpr: string;
    // Хранение в день, дополнительный литр, ₽
    boxStorageLiter: string;
    // Страна, для РФ — округ
    geoName: string;
    // Название склада
    warehouseName: string;
}

interface Tariff {
    // Дата начала следующего тарифа
    dtNextBox: string;
    // Дата окончания последнего установленного тарифа
    dtTillMax: string;
    // Тарифы для коробов, сгруппированные по складам
    warehouseList: WarehouseTariff[];
}

const WB_API_BASE_URL = "https://common-api.wildberries.ru";

export const wbService = {
    async fetchBoxTariffs(forDate: string): Promise<Tariff | null> {
        const url = `${WB_API_BASE_URL}/api/v1/tariffs/box`;

        if (!env.WB_API_TOKEN) {
            throw new Error("WB_API_TOKEN is not defined in environment variables.");
        }

        console.log(`Fetching tariffs for date: ${forDate}`);
        return {
            "dtNextBox": "2024-02-01",
            "dtTillMax": "2024-03-31",
            "warehouseList": [
                {
                    "boxDeliveryBase": "48",
                    "boxDeliveryCoefExpr": "160",
                    "boxDeliveryLiter": "11,2",
                    "boxDeliveryMarketplaceBase": "40",
                    "boxDeliveryMarketplaceCoefExpr": "125",
                    "boxDeliveryMarketplaceLiter": "11",
                    "boxStorageBase": "0,14",
                    "boxStorageCoefExpr": "115",
                    "boxStorageLiter": "0,07",
                    "geoName": "Центральный федеральный округ",
                    "warehouseName": "Коледино",
                },
            ],
        };
        try {
            const response = await axios.get<{ data: Tariff }>(url, {
                headers: {
                    "Authorization": `Bearer ${env.WB_API_TOKEN}`,
                },
                params: {
                    date: forDate,
                },
            });
            console.log(response);

            if (response.data) {
                return response.data.data;
            }

            return null;
        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                console.error(`Error fetching WB tariffs: ${error.message}`);
                console.error("Response data:", error.response?.data);
            } else {
                console.error("An unexpected error occurred:", error);
            }
            return null;
        }
    },
    async saveOrUpdateTariffs(tariffData: Tariff, forDate: string) {
        await db.transaction(async (trx) => {
            console.log(`Deleting ALL old snapshots for date: ${forDate}`);
            await trx("tariff_snapshots").where("snapshot_date", forDate).del();

            const [newSnapshot] = await trx("tariff_snapshots")
                .insert({
                    snapshot_date: forDate,
                    dt_next_box: tariffData.dtNextBox,
                    dt_till_max: tariffData.dtTillMax,
                })
                .returning(["id"]);

            const snapshotId = newSnapshot.id;

            if (!tariffData.warehouseList || tariffData.warehouseList.length === 0) {
                console.log("No warehouse tariffs to insert.");
                return;
            }

            const tariffsToInsert = tariffData.warehouseList.map((whTariff) => ({
                snapshot_id: snapshotId,
                warehouse_name: whTariff.warehouseName,
                geo_name: whTariff.geoName,
                box_delivery_base: parseFloat(whTariff.boxDeliveryBase),
                box_delivery_coef_expr: parseFloat(whTariff.boxDeliveryCoefExpr),
                box_delivery_liter: parseFloat(whTariff.boxDeliveryLiter),
                box_delivery_marketplace_base: parseFloat(whTariff.boxDeliveryMarketplaceBase),
                box_delivery_marketplace_coef_expr: parseFloat(whTariff.boxDeliveryMarketplaceCoefExpr),
                box_delivery_marketplace_liter: parseFloat(whTariff.boxDeliveryMarketplaceLiter),
                box_storage_base: parseFloat(whTariff.boxStorageBase),
                box_storage_coef_expr: parseFloat(whTariff.boxStorageCoefExpr),
                box_storage_liter: parseFloat(whTariff.boxStorageLiter),
            }));

            await trx("warehouse_tariffs").insert(tariffsToInsert);

            console.log(`Successfully inserted ${tariffsToInsert.length} warehouse tariffs for snapshot ID ${snapshotId}.`);
        });
    },
};
