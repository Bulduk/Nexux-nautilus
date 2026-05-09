import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { attachPlan } from "../middlewares/requirePlan";
import healthRouter from "./health";
import authRouter from "./auth";
import meRouter from "./me";
import vaultRouter from "./vault";
import billingRouter from "./billing";
import cryptoBillingRouter from "./cryptoBilling";
import marketsRouter from "./markets";
import chatRouter from "./chat";
import agentsRouter from "./agents";
import signalsRouter from "./signals";
import tradeRouter from "./trade";
import adminRouter from "./admin";
import intentRouter from "./intent";
import riskRouter from "./risk";
import ledgerRouter from "./ledger";
import strategyRouter from "./strategy";
import newsRouter from "./news";
import predictionRouter from "./prediction";
import watchlistRouter from "./watchlist";
import councilRouter from "./council";
import pushRouter from "./push";

const router: IRouter = Router();

// ─── Public routes (no auth) ──────────────────────────────────────────────
router.use(healthRouter);
router.use(authRouter);
router.use(marketsRouter);
router.use(newsRouter);

// ─── Authenticated routes (lazy user upsert + 7-day FREE trial) ──────────
router.use(meRouter);
router.use(billingRouter);
router.use(cryptoBillingRouter);
// All authed routers get `attachPlan` so per-endpoint `requirePlan(...)` checks
// can short-circuit on req.activeTier without re-querying the DB.
router.use(requireAuth, attachPlan, vaultRouter);
router.use(requireAuth, attachPlan, chatRouter);
router.use(requireAuth, attachPlan, agentsRouter);
router.use(requireAuth, attachPlan, signalsRouter);
router.use(requireAuth, attachPlan, tradeRouter);
router.use(requireAuth, attachPlan, adminRouter);
router.use(requireAuth, attachPlan, intentRouter);
router.use(requireAuth, attachPlan, riskRouter);
router.use(requireAuth, attachPlan, ledgerRouter);
router.use(requireAuth, attachPlan, strategyRouter);
router.use(requireAuth, attachPlan, predictionRouter);
router.use(requireAuth, attachPlan, watchlistRouter);
router.use(requireAuth, attachPlan, councilRouter);
router.use(requireAuth, attachPlan, pushRouter);

export default router;
