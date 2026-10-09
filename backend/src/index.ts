import { ensureAdminAccount } from "./adminUser";
import { createApp } from "./app";
import { config } from "./config";
import { openDatabase } from "./db";

openDatabase();
void ensureAdminAccount();
const app = createApp();
app.listen(config.port, () => {
  console.log(`Reimburse API listening on http://localhost:${config.port}`);
});
