-- Restore Paddle fields: rename Stripe columns back to Paddle names
-- Drop Stripe-specific columns that don't exist in Paddle flow

ALTER TABLE "Subscription"
  RENAME COLUMN "stripeCustomerId" TO "paddleCustomerId";

ALTER TABLE "Subscription"
  RENAME COLUMN "stripeSubscriptionId" TO "paddleSubscriptionId";

ALTER TABLE "Subscription"
  DROP COLUMN IF EXISTS "cancelAtPeriodEnd";

ALTER TABLE "Subscription"
  DROP COLUMN IF EXISTS "seatCount";

ALTER TABLE "Subscription"
  DROP COLUMN IF EXISTS "teamId";
