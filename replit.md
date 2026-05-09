# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Mobile Nav (5 tabs — nexus-mobile)

- **Nexus** (index.tsx) — NEXUS PRIME AI chat terminal (ControlPlane). Boot mesajı, 4-ajan chip bar, quick commands ([SCAN] [ROUTE] [REPORT] [COUNCIL] [RISK]), POST /api/chat.
- **Sinyaller** (signals.tsx) — Sinyal tarama, mevcut
- **Kurul** (council.tsx) — 4-ajan Council oylama, POST /api/council/vote, agent vote cards, history
- **Portföy** (portfolio.tsx) — Pozisyonlar, ARM/KILL switch
- **Daha Fazla** (more.tsx) — Dashboard stats + nav grid (Strateji, Prediction, Ledger, Ayarlar)

Hidden tabs (tabBarButton: null, accessible via router.push): strategy, prediction, ledger, settings

**AgentChatSheet** (`components/AgentChatSheet.tsx`) — Her sayfada floating ⚡ FAB + bottom sheet AI chat. POST /api/chat with pageContext injection. Kritik anahtar kelime detection (yellow warning banner).

## Artifacts

- **api-server** (`artifacts/api-server`) — Express 5 backend at `/api`.
  - `/api/markets/{ticker,ohlcv,orderbook}` — public market data via CCXT (KuCoin)
  - `/api/chat` — Claude `claude-sonnet-4-6` via Replit AI integration
  - `/api/signals/stream` (SSE) + `/api/signals/snapshot` — multi-factor signal engine (RSI/EMA/MACD/ATR/orderflow → grade A–D, confluence 0–5); SEMI mod aktifken sinyaller pending_signals tablosuna da yazılır
  - `/api/signals/pending` GET + PATCH `:signalId` — SEMI mod onay kuyruğu (approve/reject, 10dk expire)
  - `/api/watchlist/prices` GET — tüm aktif watchlist sembollerinin canlı fiyatları (KuCoin, 1 çağrıda batch)
  - `/api/account/balance` GET — Binance/Bybit/OKX canlı bakiye (API key gerekli)
  - `/api/risk/{profile,status,arm,kill,equity-snapshot}` — RiskProfile with kill-switch, arm toggles (`data/risk-profile.json`)
  - `/api/intent/{evaluate,submit,close,flatten-all}` — Intent → PolicyGuard (11 checks) → ccxt order → JSONL ledger
  - `/api/ledger` + `/api/ledger/positions` — audit trail (`data/ledger.jsonl`) + open positions (`data/positions.json`)
  - `/api/strategy` — CRUD for strategies (`data/strategies.json`); 8 builtin strategies
  - `/api/strategy/backtest` POST — replay historical OHLCV against any strategy; returns equity curve, Sharpe, Sortino, win rate, max DD, profit factor
  - `/api/strategy/vibe` POST — NLP natural language → Claude → structured strategy params (JSON extraction)
  - `/api/strategy/swarm` GET — run all 4 agents (Mirofish/Betafish/Onyx/OpenClaw) in parallel, returns individual signals + consensus
  - `/api/strategy/evaluate` GET — quick single-strategy signal evaluation
  - `/api/news/sentiment` GET — Claude-powered market sentiment for BTC/ETH/SOL/BNB from price action

- **dataclaw** (`artifacts/dataclaw`) — React + Vite + Tailwind v4 trading dashboard ("Nexus O.S.").
  - **Navigation** (10 items): Control/AI Chat → Signals/Live Feed → **Watchlist/Coin Takip** → **Council/Ortak Akıl** → Strategy/Bot & Backtest → Portfolio/Risk&Exec → Agents/AI Team → Prediction/Polymarket → Config/Exchanges → Admin/Vault&Keys
  - **StrategyPanel** (new): 5 inner tabs:
    - Library — 8 builtin + custom strategies with expandable details
    - Backtest — form (symbol/timeframe/limit) + equity curve chart + 9 metrics
    - Sentiment — Claude AI market analysis per coin (sentiment score + headline + analysis)
    - Vibe Agent — NLP chat (Turkish/English) → Claude → strategy definition + "Save Strategy" button
    - Swarm — run Mirofish/Betafish/Onyx/OpenClaw simultaneously + consensus vote display
  - **WatchlistPanel** (new): Dynamic coin tracking — add/delete/toggle symbols, canlı KuCoin fiyatları (30s polling, `/api/watchlist/prices`), 24s % değişim, yükselen/düşen özet istatistik
  - **CouncilPanel** (new): 4-agent parallel voting (OpenClaw/Mirofish/Betafish/Onyx), DB watchlist dropdown, real market data auto-enrichment (OHLCV+indicators), shows verdict (STRONG/MAJORITY/SPLIT/REJECTED), per-agent reasoning expandable, history tab
  - **Control Plane**: Exec Mode dropdown (PAPER/SEMI/AUTO CONF/FULL AUTO) — DB-backed, persisted to risk_profile table
  - **AgentsPanel**: Models synced from DB on mount (per-agent claude model assignment)
  - **PendingSignalsWidget**: SEMI mod onay kuyruğu — 10 dakika geçerlilik, ONAYLA/REDDET düğmeleri, countdown timer, otomatik expire
  - **BinanceBalanceWidget**: PortfolioPanel → Live tab → borsa bakiyesi (Binance API anahtarı varsa gerçek, yoksa uyarı)
  - Design: Atmospheric Glass tokens (bg #0b1326, glass cards, accent #00FFB2, text #dae2fd)

- **nexus-mobile** (`artifacts/nexus-mobile`) — Expo React Native mobile app (preview `/mobile/`). 5 tabs: Dashboard, Signals, Portfolio, Ledger, Settings.

## Indicators Library (`lib/indicators.ts`)

- EMA (series + point), SMA, RSI(14), MACD(12/26/9), ATR(14)
- **Bollinger Bands** (period/mult, returns upper/middle/lower/width/pct)
- **Stochastic** (K/D, configurable periods)
- **VWAP** (volume-weighted average price)
- **Williams %R** (14-period)
- **ADX** (14-period, average directional index)
- **BB Squeeze** (Bollinger inside Keltner Channel — TTM Squeeze style)
- **Donchian Channel** (N-period high/low)
- `factorize()` — returns all enhanced indicators in one struct for signal engine

## Strategy System (`lib/strategies.ts`)

8 builtin strategies, all evaluatable live or via backtest:
1. **EMA Cross 12/26** — trend following (Freqtrade-compatible)
2. **RSI Mean Reversion** — RSI < 30 buy / > 70 sell (Hummingbot-inspired)
3. **BB Squeeze Breakout** — TTM Squeeze (John Carter style)
4. **Donchian Breakout** — Turtle Traders 20-period
5. **VWAP Bounce** — intraday mean reversion
6. **Stochastic Cross** — K/D crossover in extremes
7. **MACD Zero Cross** — histogram zero line cross
8. **Nexus Multi-Factor** — EMA + RSI + MACD ensemble (QuantConnect-inspired)

Custom strategies stored in `data/strategies.json`. Created via Vibe Agent (NLP).

## Backtester (`lib/backtester.ts`)

- Realistic simulation: 0.1% slippage + 0.1% fee per side
- 60-candle warmup, up to 72-bar max hold
- SL/TP checked on candle high/low (not just close)
- Metrics: win rate, total PnL%, max drawdown, Sharpe (annualized √252), Sortino, profit factor, avg win/loss, max consecutive losses, expectancy
- Returns equity curve array for chart rendering

## Swarm Agent System

4 agents run in parallel on any symbol:
- **Mirofish** → BB Squeeze Breakout specialist
- **Betafish** → RSI Mean Reversion specialist
- **Onyx** → EMA Cross trend follower
- **OpenClaw** → Donchian breakout / momentum

Consensus: majority vote direction + averaged confidence.

## Trading + AI Notes

- **Public data**: CCXT KuCoin by default (Binance geo-blocked from Replit). Override: `PUBLIC_EXCHANGE` env var.
- **Live trading**: disabled unless exchange API keys present + `liveTradingArmed=true` in risk profile.
- **PolicyGuard**: 11 server-enforced checks on every `/intent/submit`.
- **AI**: Anthropic integration (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL/KEY`). Model: `claude-sonnet-4-6`.
- **Persistence**: `artifacts/api-server/data/` — `risk-profile.json`, `ledger.jsonl`, `positions.json`, `strategies.json`.

## Deployment (Docker / Hostinger K2)

- `Dockerfile` — multi-stage build (node:24-slim, API server)
- `docker-compose.yml` — services: api (8080), web (nginx 3000), proxy (80/443)
- `docs/vps-requirements.md` — full Hostinger K2 setup guide with nginx SSL, .env template, freqtrade/hummingbot comparison table
- Minimum VPS: 2 vCPU, 4GB RAM, 40GB NVMe
- **Önerilen** (Binance erişimi için): Hetzner CX22 Frankfurt €4.5/ay veya Contabo VPS S Almanya €4.5/ay

## SaaS Dönüşüm Master Plan (8 Faz)

**Vizyon:** Multi-tenant ücretli abonelik sistemi. Kullanıcılar üye olur, kendi Binance key'leriyle trade eder, OWNER (siz) full kontrol panel.

**Roller:** OWNER (siz, full sistem) · ADMIN (tenant admin) · PRO_USER (canlı trade) · BASIC_USER (paper-only)

**Ücretlendirme** (3 currency × 2 interval):
| Tier | USD/ay | EUR/ay | TRY/ay | Trial |
|---|---|---|---|---|
| FREE | $0 | €0 | ₺0 | 7 gün, paper-only |
| PRO | $49 | €45 | ₺1.499 | — |
| ELITE | $149 | €139 | ₺4.499 | — |
| ENTERPRISE | $999 | €899 | ₺29.999 | white-label |

Tablolar (subscription_plans): seed edildi, Stripe price ID'leri F5'te eklenecek.

### Faz Durumu

- **F1: DB Migration** ✅ TAMAMLANDI
  - 4 yeni schema dosyası: `auth.ts` (users, user_sessions, user_invites), `billing.ts` (subscription_plans, subscriptions, usage_meter, billing_events), `vault.ts` (exchange_keys — AES-256-GCM encrypted), `audit.ts` (audit_log)
  - Mevcut `trading.ts` tablolarına nullable `user_id` + index eklendi (geriye uyumlu)
  - 18 tablo total, drizzle-kit push-force başarılı
  - 4 plan seed edildi (FREE/PRO/ELITE/ENTERPRISE) USD/EUR/TRY fiyatlarıyla
  - Schema barrel: `import { usersTable, subscriptionsTable, exchangeKeysTable, auditLogTable } from "@workspace/db"`

- **F2: Clerk Auth** ✅
  - Web: ClerkProvider + Wouter + branded Nexus dark theme + Türkçe lokalizasyon
  - API middleware: `clerkProxyMiddleware` + `clerkMiddleware` mounted before body parsers
  - Lazy user upsert (ilk authenticated request'te DB'ye eklenir, 30s cache)
  - Trial: 7 gün otomatik FREE plan; `OWNER_EMAILS` env → otomatik OWNER + ENTERPRISE
  - Mobile Clerk wiring → F6'ya ertelendi

- **F3: API Authorization** ✅
  - `requireAuth` middleware: chat/agents/signals/trade/vault → 401 if no auth
  - Public: `/api/healthz`, `/api/markets/*`, `/api/news`
  - `GET /api/me` → user + subscription + plan
  - UserBadge bileşeni (avatar + plan rozeti + dropdown) header'a entegre

- **F4: User Vault** ✅
  - AES-256-GCM şifreleme (`VAULT_ENCRYPTION_KEY` shared env'de, 32-byte base64)
  - `routes/vault.ts`: GET/POST/DELETE `/api/vault/keys` + POST `/api/vault/keys/:id/verify`
  - Verify: CCXT ile fetchBalance → bakiye coin sayısı + last_verified_at güncellenir
  - UI: AdminPanel'e "Borsa Vault" tab + form (Binance/Bybit/OKX/KuCoin, testnet toggle, passphrase)
  - `getDecryptedUserKey(userId, exchange)` helper exported → trade.ts entegrasyonu için hazır
  - Güvenlik sertleştirmesi (architect bulguları sonrası): verify endpoint'inde per-key 15s cooldown + per-user 6/min limit (429), OWNER promotion artık `email_verified=true` zorunlu, auth cache TTL 30s→15s

### UI Strateji Güncellemesi (2026-05-03)
**İki paralel UI:**
- **Web (dataclaw)** = OWNER + ADMIN + PRO_USER paneli — gelişmiş kontrol (vault, agent config, owner dashboard, billing portal yönetimi). Trading masası seviyesinde detay.
- **Mobile (nexus-mobile)** = Son kullanıcı (BASIC/PRO) sade deneyim — portföy, açık pozisyonlar, sinyal feed'i, push bildirim, "tek tap kapat", abonelik yönetimi.

Aynı `/api` backend'ini paylaşıyorlar; ayrım sadece UI'da.

- **F5: Ödeme Sistemi (Stripe + Kripto)** ✅ STRIPE TAMAM, KRİPTO BEKLEMEDE
  - **Stripe (Replit connector)** ✅: `stripe@20.0.0` + `stripe-replit-sync@1.0.0` workspace root'ta kurulu. `stripeClient.ts` Replit connector API'sinden credentials çeker. `initStripe()` startup'ta `runMigrations` + `findOrCreateManagedWebhook` + `syncBackfill` çağırır. Webhook `/api/stripe/webhook` JSON parser'dan ÖNCE register edildi (raw Buffer alır).
  - **3 ürün × 6 fiyat = 18 price** Stripe'ta seed edildi (PRO $49/€45/₺1699, ELITE $149/€139/₺5199, ENTERPRISE $999/€929/₺34999) — `pnpm --filter @workspace/scripts run seed:stripe` (idempotent, metadata.tier ile eşleştirir).
  - **Routes** (`routes/billing.ts`): `GET /api/billing/config` (publishableKey + cryptoEnabled flag), `GET /api/billing/plans` (DB), `GET /api/billing/products` (stripe.products+prices JOIN), `POST /api/billing/checkout` (customer otomatik oluştur, subscription metadata'ya userId), `POST /api/billing/portal`, `GET /api/billing/subscription`.
  - **Web UI** (`BillingPanel.tsx`): Sidebar'a "Billing" tabı eklendi. USD/EUR/TRY × monthly/yearly seçici, locale'e göre default currency (TR→TRY, AB→EUR), 3 plan kartı + ELITE highlighted, "Stripe ile Öde" → checkout redirect, "Aboneliği Yönet" → portal, kripto butonu (cryptoEnabled flag ile koşullu, "yakında" disabled).
  - esbuild externals: `stripe` + `stripe-replit-sync` external yapıldı (migrations klasörü dist'e bundle olmuyor).
  - **Kripto ödeme (NOWPayments)** ✅ implementasyon hazır: `lib/nowpayments.ts` client (status/createInvoice/verifyIpn HMAC-SHA512 sorted-keys). `routes/cryptoBilling.ts`: `POST /api/billing/crypto/invoice` (auth + sameOrigin + tier-to-price lookup, `order_id = "np_<userId>_<planId>_<interval>_<ts>"`) + `POST /api/billing/crypto/ipn` (raw body via app.ts, webhook → `finished`/`confirmed` → subscription `status=active` + `currentPeriodEnd = now + 30d/365d` + `invalidatePlanCache(userId)`). Env yoksa **HTTP 503 graceful**. BillingPanel'de "Kripto ile Öde (BTC / USDT)" butonu `cryptoEnabled` flag'iyle aktifleşir. Kripto ödeme **non-recurring** (sabit süre satın alır), bitince renewal için tekrar ödeme gerekir. Webhook URL: `${origin}/api/billing/crypto/ipn` — NOWPayments dashboard'a girilmesi gerekir.
  - **Plan gating middleware** ✅: `requirePlan("PRO" | "ELITE" | "ENTERPRISE")` — server'da `attachPlan` her authed router'a bağlandı, `req.activeTier` set eder (15s cache, OWNER → ENTERPRISE bypass). Trial expired veya tier yetersiz → **HTTP 402** `{ requiresUpgrade, currentTier, requiredTier, trialExpired, message }`. **Entitlement check** `currentPeriodEnd > now`'u zorunlu kılar (kripto sabit-süre satın alımları sürenin sonunda otomatik FREE'ye düşer). Web (`apiGet/apiPost` 402 yakalayıcı + `nexus:paywall` window event + `<PaywallModal>` AppShell'de) ve mobile (`onPaywall` listener + `<PaywallSheet>` web billing sayfasına `Linking.openURL` ile açılır) global paywall handler'lar bağlı. **Raw fetch sayfaları** (StrategyPanel backtest/vibe/save, PredictionPanel interpret) inline 402 handler ile aynı eventi dispatch eder. Gated endpoints: `POST /strategy*` (PRO), `POST /trade/order` (PRO), `POST /prediction/interpret` (PRO), `POST /council/vote` (ELITE).
  - **IPN idempotency** ✅: `crypto_payment_events` tablosu `(provider, payment_id)` unique index ile webhook replay'lerini engeller. IPN handler tüm subscription mutation'ı `db.transaction()` içinde yapar; aynı `payment_id` ikinci kez gelirse `23505` yakalanır → 200 + `duplicate:true` döner. Aynı plan üst üste satın alınırsa süre **stack'lenir** (ikinci ödeme `currentPeriodEnd + interval` olur, üzerine yazmaz).
  - UI: Web → BillingPanel (mevcut/değiştir/iptal), Mobile → PaywallSheet.

- **F6: Mobile UX Polish** ⏳ DEVAM EDİYOR
  - **Mobile Clerk wiring** ✅: `@clerk/expo` `_layout.tsx`'te ClerkProvider + ClerkLoaded + tokenCache. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` dev script'inde forward ediliyor.
  - **Branded auth screens** ✅: `app/(auth)/sign-in.tsx` + `sign-up.tsx` (email/password + Türkçe lokalize, e-posta doğrulama 6-haneli kod, koyu Nexus teması, brand yeşili #00C9A7 logo). `(auth)/_layout.tsx` signed-in ise `(tabs)`'e yönlendirir.
  - **Auth gate** ✅: `(tabs)/_layout.tsx` — `useAuth()` ile `isSignedIn` kontrolü, signed-out ise `(auth)/sign-in`'e redirect. `setAuthTokenGetter(() => getToken())` ile her API çağrısı Clerk JWT Bearer token gönderir; server-side `requireAuth` (zaten Clerk middleware) her iki yolu da destekler.
  - **Settings → Hesap kartı** ✅: avatar + e-posta + "Çıkış" butonu (confirm dialog + `signOut()`).
  - **Layout foundation** ✅: `useScreenInsets()` (NativeTabs/ClassicTabs/web aware top+bottom+chatSheetClearance) + `<Screen>` wrapper. Magic number'lar (+180/+80) kaldırıldı, settings/index/portfolio/council/more/ledger/prediction/signals migrated. Strategy.tsx bekliyor (TODO comment).
  - **CandlestickChart** ✅: `components/CandlestickChart.tsx` SVG-based candles + volume bars + 6 timeframe (1m/5m/15m/1h/4h/1d). Signals'a `selectedSymbol` toggle ile entegre.
  - **OrderBook** ✅: `components/OrderBook.tsx` bid/ask depth bars + cumulative + spread/mid. CCXT `/markets/orderbook?symbol=...&depth=N` (max 100, default 25). 4s refresh. TradeSheet'e price toggle ile embed (depth=8).
  - **TradeSheet improvements** ✅: market/limit toggle + limit fiyat input + "MID FİYATI KULLAN" + 25/50/75/100% equity butonu (capacity_remaining + gross_exposure'dan equity proxy) + embedded OrderBook (price'a tıklayınca açılır). `order_type` + `limit_price` /intent/submit'e gönderiliyor.
  - **Push notifications** ✅:
    - Schema: `lib/db/src/schema/push.ts` `push_tokens` (token unique, user_id, platform, enabled, signalLevel `high_grade_only|all`, notifySignals/Fills/Council bool flags, lastSeenAt). `pnpm --filter @workspace/db push` ile DB'ye gitti.
    - Routes: `routes/push.ts` POST `/push/register` (idempotent upsert), PATCH `/push/prefs`, POST `/push/unregister`, POST `/push/test`. `sendExpoPush(tokens, payload)` ve `notifyUser(userId, channel, payload)` helper'ları export.
    - Signal fan-out: `routes/signals.ts` içinde signal insert sonrası async push gönderir — A-grade her zaman, lower grade sadece `signalLevel="all"` cihazlara, `notifySignals=true` filtre.
    - Mobile: `expo-notifications` + `expo-device` install. `lib/push.ts` → `usePushSettings()` hook (auto-register on sign-in, permission state, prefs toggle, test push). Settings ekranında **Push Bildirimleri** kartı: enable button (izin reddedilirse "Tekrar Dene"), 3 channel toggle (sinyaller/fill'ler/council), signalLevel chip (A/A+ ONLY ↔ ALL), Test Push butonu. Web'de "sadece mobil" mesajı gösterir.
  - Kalan: PaywallSheet, strategy.tsx layout migration.

- **F7: Owner Dashboard** — `/api/owner/*` (tüm kullanıcılar, MRR, kill-all, audit log viewer, usage analytics). Web only (mobile'da gizli). Sadece OWNER role.

- **F8: Production Hardening + Self-Host Paketi**
  - **Hosted (Hetzner Frankfurt)**: OCO orders, reconciliation worker, Sentry, deploy guide.
  - **Self-Host (white-label)**: `docker-compose.yml` (api-server + postgres + caddy reverse-proxy), `.env.example`, `INSTALL.md` (Türkçe), opsiyonel `nexus-cli` setup wizard, lisans toggle (`SELF_HOSTED=true` → Stripe devre dışı, owner her zaman ENTERPRISE). Müşteri kendi Clerk + Binance + (varsa) Stripe key'ini girer. Pricing modeli: tek seferlik lisans + opsiyonel destek aboneliği.
