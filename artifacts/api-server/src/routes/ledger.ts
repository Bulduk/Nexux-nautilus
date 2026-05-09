import { Router, type IRouter } from "express";
import { listEntries, listOpenPositions, type LedgerEntryType } from "../lib/ledger";

const router: IRouter = Router();

router.get("/ledger", (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query["limit"] ?? "100"), 10) || 100));
  const type = (req.query["type"] as LedgerEntryType | undefined) ?? undefined;
  res.json({ entries: listEntries(limit, type), open_positions: listOpenPositions() });
});

router.get("/ledger/positions", (_req, res) => {
  res.json({ positions: listOpenPositions() });
});

export default router;
