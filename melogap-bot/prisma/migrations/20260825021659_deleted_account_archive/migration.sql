-- CreateTable
CREATE TABLE "DeletedAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "originalUserId" INTEGER NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "gender" TEXT,
    "age" INTEGER,
    "province" TEXT,
    "city" TEXT,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reRegisteredUserId" INTEGER
);

-- CreateIndex
CREATE INDEX "DeletedAccount_telegramId_idx" ON "DeletedAccount"("telegramId");

-- CreateIndex
CREATE INDEX "DeletedAccount_originalUserId_idx" ON "DeletedAccount"("originalUserId");
