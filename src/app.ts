import express from "express";
import cron from "node-cron";
import { wbService } from "./service/wbService.js";
import { spreadsheetService } from "#service/spreadsheetService.js";
import env from "#config/env/env.js";

async function mainJob() {
    console.log("--- Hourly Job Started ---");
    let wasDbUpdated = false;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const today = `${year}-${month}-${day}`;

    try {
        console.log("Fetching and saving WB data...");
        const tariffData = await wbService.fetchBoxTariffs(today);

        if (tariffData && tariffData.warehouseList && tariffData.warehouseList.length > 0) {
            wasDbUpdated = await wbService.saveOrUpdateTariffs(tariffData, today);

            if (wasDbUpdated) {
                console.log("Database was updated with new data.");
            } else {
                console.log("ℹDatabase operation completed, but no new data was inserted.");
            }
        } else {
            console.log("No tariffs were fetched from WB API.");
        }
    } catch (error: any) {
        console.error("ERROR during database update:", error.message);
        return;
    }
    if (wasDbUpdated) {
        try {
            console.log("Database changed, running full synchronization with Google Sheets...");
            await spreadsheetService.syncAllGoogleSheets();
        } catch (error: any) {
            console.error("ERROR during Google Sheets sync:", error.message);
        }
    }
}

const app = express();
const PORT = env.APP_PORT || 3000;

app.use(express.json());

app.post("/api/spreadsheets", async (req, res) => {
    const { spreadsheetId } = req.body;
    if (!spreadsheetId || typeof spreadsheetId !== "string" || spreadsheetId.trim() === "") {
        return res.status(400).json({ error: "Field 'spreadsheetId' is required." });
    }
    try {
        await spreadsheetService.insertOne(spreadsheetId.trim());

        res.status(200).json({ message: "Spreadsheet added successfully." });
    } catch (error: any) {
        return res.status(409).json({ error: error.message });
    }
});
mainJob();
cron.schedule("0 * * * *", mainJob);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log("Cron job is scheduled to run every hour.");
});
