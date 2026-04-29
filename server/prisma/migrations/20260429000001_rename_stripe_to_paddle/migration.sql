-- Rename Stripe fields to Paddle equivalents
-- Using RENAME COLUMN to preserve existing data

ALTER TABLE "Subscription" RENAME COLUMN "stripeCustomerId" TO "paddleCustomerId";
ALTER TABLE "Subscription" RENAME COLUMN "stripeSubscriptionId" TO "paddleSubscriptionId";

-- Make paddleCustomerId nullable (Paddle customer created on first checkout, not on account creation)
ALTER TABLE "Subscription" ALTER COLUMN "paddleCustomerId" DROP NOT NULL;
