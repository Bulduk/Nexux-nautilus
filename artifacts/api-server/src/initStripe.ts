import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { logger } from "./lib/logger";

export async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("Stripe init skipped — DATABASE_URL not set");
    return;
  }
  try {
    logger.info("Stripe: running migrations");
    await runMigrations({ databaseUrl });

    const sync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      logger.info({ webhookUrl }, "Stripe: ensuring managed webhook");
      const result: any = await sync.findOrCreateManagedWebhook(webhookUrl);
      logger.info(
        { url: result?.webhook?.url ?? result?.url ?? webhookUrl },
        "Stripe webhook ready",
      );
    }

    sync
      .syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err) => logger.error({ err }, "Stripe backfill failed"));
  } catch (err) {
    logger.error({ err }, "Stripe init failed (continuing without Stripe)");
  }
}
