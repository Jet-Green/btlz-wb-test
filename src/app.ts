import knex, { migrate, seed } from "#postgres/knex.js";
import cron from "node-cron";
import { wbService } from "./service/wbService.js";
const today = new Date().toISOString().split("T")[0];

const tariff = await wbService.fetchBoxTariffs(today);

if (tariff) {
    console.log(`Successfully fetched tariff.`);
    try {
        await wbService.saveOrUpdateTariffs(tariff, today);
    } catch (error) {
        console.log(error);
    }
} else {
    console.log("No tariffs were fetched.");
}
// cron.schedule("0 * * * *", async () => {
//     console.log("Running hourly tariff update job...");

//     const today = new Date().toISOString().split("T")[0];

//     const tariffs = await wbService.fetchBoxTariffs(today);

//     if (tariffs.length > 0) {
//         console.log(`Successfully fetched ${tariffs.length} tariffs.`);
//         // await saveTariffsToDatabase(tariffs, today);
//     } else {
//         console.log("No tariffs were fetched.");
//     }
// });

// await migrate.latest();
// await seed.run();

// console.log("All migrations and seeds have been run");
