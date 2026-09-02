import { Composer } from "grammy";
import { adminCoreHandler } from "./core.js";
import { adminChatsHandler } from "./chats.js";
import { adminReportsHandler } from "./reports.js";
import { adminVouchersHandler } from "./vouchers.js";
import { adminOpsHandler } from "./operations.js";

/**
 * ماژول یکپارچه ادمین + مانیتورینگ
 * ops → vouchers → chats → core (panel, stats, coins, moderation queues)
 */
export const adminModule = new Composer();
adminModule.use(adminOpsHandler);
adminModule.use(adminVouchersHandler);
adminModule.use(adminChatsHandler);
adminModule.use(adminReportsHandler);
adminModule.use(adminCoreHandler);

/** @deprecated use adminModule */
export const adminHandler = adminModule;
export { adminPanelKeyboard } from "./panel.js";
