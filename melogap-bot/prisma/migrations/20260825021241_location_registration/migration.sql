-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "displayName" TEXT,
    "bio" TEXT,
    "diamonds" INTEGER NOT NULL DEFAULT 0,
    "referralCode" TEXT NOT NULL,
    "anonCode" TEXT NOT NULL,
    "referredById" INTEGER,
    "latitude" REAL,
    "longitude" REAL,
    "locationAt" DATETIME,
    "gender" TEXT,
    "lookingFor" TEXT,
    "age" INTEGER,
    "language" TEXT,
    "country" TEXT,
    "province" TEXT,
    "city" TEXT,
    "photoFileId" TEXT,
    "photoPendingFileId" TEXT,
    "photoStatus" TEXT NOT NULL DEFAULT 'none',
    "faceVerified" BOOLEAN NOT NULL DEFAULT false,
    "facePendingFileId" TEXT,
    "faceStatus" TEXT NOT NULL DEFAULT 'none',
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "state" TEXT NOT NULL DEFAULT 'language',
    "pendingAnonTo" TEXT,
    "chatPartnerId" INTEGER,
    "boostUntil" DATETIME,
    "isPro" BOOLEAN NOT NULL DEFAULT false,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "chatsCount" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("age", "anonCode", "bio", "boostUntil", "chatPartnerId", "chatsCount", "city", "createdAt", "deletedAt", "diamonds", "displayName", "facePendingFileId", "faceStatus", "faceVerified", "firstName", "gender", "id", "isActive", "isPro", "lastActiveAt", "latitude", "likesCount", "locationAt", "longitude", "lookingFor", "pendingAnonTo", "photoFileId", "photoPendingFileId", "photoStatus", "referralCode", "referredById", "registered", "state", "telegramId", "updatedAt", "username", "viewsCount") SELECT "age", "anonCode", "bio", "boostUntil", "chatPartnerId", "chatsCount", "city", "createdAt", "deletedAt", "diamonds", "displayName", "facePendingFileId", "faceStatus", "faceVerified", "firstName", "gender", "id", "isActive", "isPro", "lastActiveAt", "latitude", "likesCount", "locationAt", "longitude", "lookingFor", "pendingAnonTo", "photoFileId", "photoPendingFileId", "photoStatus", "referralCode", "referredById", "registered", "state", "telegramId", "updatedAt", "username", "viewsCount" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX "User_anonCode_key" ON "User"("anonCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
