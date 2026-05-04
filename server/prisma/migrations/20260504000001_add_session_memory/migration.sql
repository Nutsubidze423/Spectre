-- CreateTable
CREATE TABLE "SessionMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summaryText" TEXT NOT NULL,
    "keyTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "SessionMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionMemory_userId_createdAt_idx" ON "SessionMemory"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "SessionMemory" ADD CONSTRAINT "SessionMemory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMemory" ADD CONSTRAINT "SessionMemory_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE SET NULL ON UPDATE CASCADE;
