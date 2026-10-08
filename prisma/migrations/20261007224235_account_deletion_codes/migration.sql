-- CreateTable
CREATE TABLE "DeletionCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletionCode_userId_createdAt_idx" ON "DeletionCode"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeletionCode" ADD CONSTRAINT "DeletionCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
