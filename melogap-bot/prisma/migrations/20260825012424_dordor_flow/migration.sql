-- CreateTable
CREATE TABLE "User" (
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
    "city" TEXT,
    "photoFileId" TEXT,
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT 'gender',
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

-- CreateTable
CREATE TABLE "ExploreSeen" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "viewerId" INTEGER NOT NULL,
    "shownId" INTEGER NOT NULL,
    CONSTRAINT "ExploreSeen_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExploreSeen_shownId_fkey" FOREIGN KEY ("shownId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiamondOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "packageId" TEXT NOT NULL,
    "diamonds" INTEGER NOT NULL,
    "amountToman" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiamondOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnonMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "toUserId" INTEGER NOT NULL,
    "fromUserId" INTEGER,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnonMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnonMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_anonCode_key" ON "User"("anonCode");

-- CreateIndex
CREATE UNIQUE INDEX "ExploreSeen_viewerId_shownId_key" ON "ExploreSeen"("viewerId", "shownId");

-- CreateIndex
CREATE UNIQUE INDEX "DiamondOrder_paymentCode_key" ON "DiamondOrder"("paymentCode");
