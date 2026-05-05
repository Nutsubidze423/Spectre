-- Add SOLO enum value
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'SOLO';

-- Drop old per-day UsageTracking table
DROP TABLE IF EXISTS "UsageTracking";

-- Alter Subscription: drop Paddle columns, add Stripe columns
ALTER TABLE "Subscription"
  DROP COLUMN IF EXISTS "paddleCustomerId",
  DROP COLUMN IF EXISTS "paddleSubscriptionId";

ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"     TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "seatCount"            INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "teamId"               TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Unique indexes for Stripe IDs
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripeCustomerId_key"
  ON "Subscription"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripeSubscriptionId_key"
  ON "Subscription"("stripeSubscriptionId");

-- New per-user UsageTracking
CREATE TABLE "UsageTracking" (
  "id"                           TEXT         NOT NULL,
  "userId"                       TEXT         NOT NULL,
  "boardsCreated"                INTEGER      NOT NULL DEFAULT 0,
  "thinkingPartnerUsesThisMonth" INTEGER      NOT NULL DEFAULT 0,
  "thinkingPartnerMonthReset"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "challengeThinkingUsesToday"   INTEGER      NOT NULL DEFAULT 0,
  "challengeDayReset"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionsCompleted"            INTEGER      NOT NULL DEFAULT 0,
  "memorySessionsStored"         INTEGER      NOT NULL DEFAULT 0,
  "updatedAt"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageTracking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageTracking_userId_key" ON "UsageTracking"("userId");

ALTER TABLE "UsageTracking" ADD CONSTRAINT "UsageTracking_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TeamMembership
CREATE TABLE IF NOT EXISTS "TeamMembership" (
  "id"        TEXT         NOT NULL,
  "teamId"    TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "role"      TEXT         NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamMembership_teamId_userId_key"
  ON "TeamMembership"("teamId", "userId");
CREATE INDEX IF NOT EXISTS "TeamMembership_teamId_idx"
  ON "TeamMembership"("teamId");

ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
