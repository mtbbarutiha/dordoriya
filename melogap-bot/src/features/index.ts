import { Composer } from "grammy";
import { matchHandler } from "./match.js";
import { exploreHandler } from "./explore.js";
import { dmHandler } from "./dm.js";
import { socialHandler } from "./social.js";
import { nearbyHandler } from "./nearby.js";
import { profileEditHandler } from "./profile.js";
import { reportHandler } from "./report.js";

/** ماژول فیچرهای کاربر — explore, match, dm, nearby, social */
export const featuresModule = new Composer();
featuresModule.use(reportHandler);
featuresModule.use(matchHandler);
featuresModule.use(exploreHandler);
featuresModule.use(dmHandler);
featuresModule.use(socialHandler);
featuresModule.use(nearbyHandler);
featuresModule.use(profileEditHandler);

/** @deprecated use featuresModule */
export const featuresHandler = featuresModule;
