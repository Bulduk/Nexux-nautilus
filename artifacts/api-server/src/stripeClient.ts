// Replit Stripe integration — credentials fetched from connector at runtime.
// Never cache the client; tokens can rotate.
import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

interface StripeCredentials {
  publishableKey: string;
  secretKey: string;
}

async function getCredentials(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe credentials unavailable: Replit connector env vars missing.",
    );
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });

  if (!response.ok) {
    throw new Error(
      `Stripe credentials fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: any = await response.json();
  const settings = data.items?.[0]?.settings;

  // Replit returns either { publishable, secret } or { publishable_key, secret_key }
  const publishableKey = settings?.publishable ?? settings?.publishable_key;
  const secretKey = settings?.secret ?? settings?.secret_key;

  if (!publishableKey || !secretKey) {
    throw new Error(
      `Stripe ${targetEnvironment} connection not found or missing keys.`,
    );
  }

  return { publishableKey, secretKey };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

let _stripeSync: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (_stripeSync) return _stripeSync;
  const { secretKey } = await getCredentials();
  _stripeSync = new StripeSync({
    poolConfig: {
      connectionString: process.env.DATABASE_URL!,
      max: 2,
    },
    stripeSecretKey: secretKey,
  });
  return _stripeSync;
}
