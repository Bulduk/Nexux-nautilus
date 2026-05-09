# NEXUS / DATACLAW — Detaylı Sistem Raporu

> **Versiyon:** 5.0.0 | **Tarih:** Mayıs 2026 | **Durum:** Geliştirme

---

## 1. GENEL BAKIŞ

**Nexus / Dataclaw**, yapay zeka destekli bir kripto para trading dashboard'udur. Sistem; Anthropic Claude AI, CCXT borsa kütüphanesi ve Polymarket tahmin API'sini birleştirerek gerçek zamanlı piyasa analizi, otomatik sinyal üretimi, strateji backtesting ve çok-ajanlı karar verme sağlar.

### Temel Özellikler
| Özellik | Durum | Teknoloji |
|---|---|---|
| Gerçek Zamanlı Fiyat Akışı | ✅ Aktif | CCXT + KuCoin REST |
| Claude AI Sohbet | ✅ Aktif | claude-sonnet-4-20250514 |
| Strateji Backtest | ✅ Aktif | 8 Yerleşik Strateji |
| 4 Ajan Sistemi | ✅ Aktif | Claude Sonnet 4 |
| Polymarket Tahmin | ✅ Aktif | Gamma API |
| Swarm (4 Ajan Konsensus) | ✅ Aktif | CCXT + OHLCV |
| Portföy Takibi | ✅ Aktif | Paper + Live |
| Mobil Uygulama | ✅ Aktif | Expo SDK 54 |
| Live Trading | ⚠️ Eksik API Key | KuCoin CCXT |
| Whale Takibi | ❌ Eksik | Whale Alert API |
| On-chain Metrikler | ❌ Eksik | Glassnode / Nansen |
| Haber Akışı | ⚠️ Kısıtlı | CryptoPanic API |

---

## 2. SİSTEM MİMARİSİ

```
┌─────────────────────────────────────────────────────────────────┐
│                        KULLANICI                                │
│              Tarayıcı (Web)  +  Expo (Mobil)                   │
└────────────────────┬───────────────────────────────────────────┘
                     │ HTTP / REST
┌────────────────────▼───────────────────────────────────────────┐
│                  GLOBAL PROXY (localhost:80)                    │
│   /       → Dataclaw React App (Vite + Tailwind v4)            │
│   /api    → Express API Server (Node.js + Express 5)           │
│   /mobile → Nexus Mobile (Expo SDK 54)                         │
└────────────────────┬───────────────────────────────────────────┘
                     │
       ┌─────────────┼──────────────────────────────┐
       ▼             ▼                              ▼
┌─────────────┐ ┌─────────────────────┐  ┌─────────────────────┐
│  KuCoin     │ │  Anthropic Claude   │  │  Polymarket         │
│  (CCXT)     │ │  (Replit AI Proxy)  │  │  Gamma API          │
│  REST API   │ │  claude-sonnet-4    │  │  (Kripto Tahminler) │
└─────────────┘ └─────────────────────┘  └─────────────────────┘
```

### Teknoloji Yığını
| Katman | Teknoloji |
|---|---|
| **Frontend** | React 19 + Vite 7 + Tailwind CSS v4 |
| **Backend** | Express 5 + TypeScript + pnpm Monorepo |
| **Borsa** | CCXT (KuCoin) — Public REST, opsiyonel Private |
| **AI** | Anthropic Claude (Replit AI Integrations Proxy) |
| **Mobil** | Expo SDK 54 + Expo Router v6 (7 Sekme) |
| **Veri** | JSON dosyaları (ledger, pozisyon, risk profili) |
| **Build** | pnpm Workspace + Rollup (kod bölme) |

---

## 3. FRONTEND SAYFALARI (8 SEKME)

### 3.1 🖥️ Control — AI Chat (Varsayılan)
**Dosya:** `src/components/ControlPlane.tsx` (291 satır)

Ana komuta merkezi. Kullanıcı ile NEXUS SUPERVISOR arasındaki chat arayüzü.

**Ne yapar:**
- Kullanıcı mesajlarını `POST /api/chat` endpoint'ine gönderir
- Her mesajla birlikte anlık piyasa snapshot'ı (BTC/ETH/SOL/BNB fiyatları) context olarak eklenir
- `mode` (paper/live) ve aktif borsa (KuCoin/Binance/AUTO) bilgisi otomatik iletilir
- **LIVE modda** kırmızı uyarı banner gösterir — gerçek emir riski
- Sağ panel: Hierarchy Supervisor durumu + Live Market fiyat takibi
- Claude modeli: `claude-sonnet-4-20250514`

**Bağlı Endpoint:** `POST /api/chat`

---

### 3.2 📈 Signals — Live Feed
**Dosya:** `src/components/SignalEngine.tsx` (389 satır)

4 ajandan gerçek zamanlı sinyal akışı.

**Ne yapar:**
- `GET /api/signals/realtime` çağrısı ile canlı sinyal listesi çeker
- Her sinyal: yön (LONG/SHORT), güven skoru, ajan kaynağı, giriş/SL/TP fiyatları
- Sinyaller A/B/C/D kalite notu ile işaretlenir (A = en güçlü, 4+ faktör konfluansı)
- Teknik faktörler görüntülenir: RSI14, MACD histogram, EMA20/50, ATR, orderbook dengesizliği
- "Pozisyon Al" butonu ile `POST /api/trade/intent` tetikleyebilir

**Bağlı Endpoint:** `GET /api/signals/realtime`

---

### 3.3 📊 Strategy — Bot & Backtest
**Dosya:** `src/components/StrategyPanel.tsx` (663 satır)

5 alt sekme ile kapsamlı strateji yönetimi.

#### Alt Sekmeler:
| Sekme | Açıklama |
|---|---|
| **Library** | 8 yerleşik strateji kartları — her birinde Backtest butonu |
| **Backtest** | Strateji + sembol + timeframe + mum sayısı seçip geçmiş test et |
| **Sentiment** | Claude ile piyasa duygu analizi — BULLISH/BEARISH/NEUTRAL |
| **Vibe Agent** | Doğal dil → strateji dönüşümü (Türkçe/İngilizce) |
| **Swarm** | 4 ajan aynı anda 4 farklı strateji ile analiz → konsensus |

**8 Yerleşik Strateji:**
1. **EMA Cross 12/26** — Klasik trend takibi, Freqtrade uyumlu
2. **RSI Mean Reversion** — Aşırı alım/satım geri dönüşü
3. **BB Squeeze Breakout** — TTM Squeeze: volatilite sıkışma → patlama
4. **Donchian Breakout (Turtle)** — Efsanevi Turtle Traders stratejisi
5. **VWAP Bounce** — Günlük VWAP destek/direnç sekmesi
6. **Stochastic Cross** — K/D kesişim dönüşüm sinyali
7. **MACD Zero Cross** — Histogram sıfır geçişi momentum
8. **Nexus Multi-Factor** — EMA + RSI + MACD + BB + Orderbook ensemble

**Bağlı Endpointler:**
- `GET /api/strategy` — strateji listesi
- `POST /api/strategy/backtest` — gerçek OHLCV verisi ile backtest
- `POST /api/strategy/vibe` — Claude ile NLP → strateji
- `GET /api/strategy/swarm` — 4 ajan paralel analiz
- `GET /api/news/sentiment` — Claude duygu analizi

---

### 3.4 💼 Portfolio — Risk & Exec
**Dosya:** `src/components/PortfolioPanel.tsx` (844 satır)

3 alt sekme ile portföy, risk yönetimi ve işlem geçmişi.

#### Alt Sekmeler:
| Sekme | Açıklama |
|---|---|
| **Live** | Açık pozisyonlar, anlık PnL, hedge durumu |
| **Paper** | Paper trading simülasyon motoru — sanal $100K bakiye |
| **Ledger** | Tüm işlem geçmişi, emir kayıtları, PnL analizi |

**Risk Yönetimi Özellikleri:**
- Günlük kayıp limiti (Daily Loss Limit)
- Maksimum pozisyon büyüklüğü
- Kaldıraç sınırı
- Drawdown koruması
- Kill Switch (acil durdurma)

**Bağlı Endpointler:**
- `GET /api/risk/status` — risk profili ve güncel PnL
- `POST /api/risk/profile` — risk profili güncelleme
- `GET /api/ledger` — işlem geçmişi

---

### 3.5 🤖 Agents — AI Team
**Dosya:** `src/components/AgentsPanel.tsx` (~540 satır)

4 yapay zeka ajanının yönetim merkezi.

**Ne yapar:**
- 2×2 ajan kartı grid'i — her kart tıklanabilir
- Her karta tıklanınca slide-up modal açılır
- Modal içinde 4 sekme: Yapılandırma / Görevler / Performans / Loglar
- Her ajan için Claude model seçimi (Haiku/Sonnet/Opus)
- Görev toggle'ları (sentiment, haber, OHLCV, orderbook vb.)
- Simüle edilmiş gerçek zamanlı aktivite logları (1.8 sn aralıklı)
- "Değişiklikleri Uygula" → `POST /api/agents/config`

**Bağlı Endpointler:**
- `GET /api/agents/config`
- `POST /api/agents/config`

---

### 3.6 🔮 Prediction — Polymarket
**Dosya:** `src/components/PredictionPanel.tsx`

Polymarket tahmin piyasası analizi.

**Ne yapar:**
- `GET /api/prediction/markets` ile kripto tahmin piyasaları çeker
- Piyasa başına EVET/HAYIR olasılık barları gösterir (örn. "BTC $100K'ya ulaşır → %73")
- Hacim ve bitiş tarihi bilgisi
- BOĞA/AYI/NÖTR badge'leri
- "Claude ile Yorumla" → `POST /api/prediction/interpret` (Türkçe AI yorumu)
- 2 dakikada bir otomatik yenileme, 1 dakika sunucu önbelleği

**Bağlı Endpointler:**
- `GET /api/prediction/markets`
- `POST /api/prediction/interpret`

---

### 3.7 ⚙️ Config — Exchanges
**Dosya:** `src/components/AdminPanel.tsx` (1900 satır) — `forceSection="trading"`

Borsa bağlantı yönetimi ve API key konfigürasyonu.

**Ne yapar:**
- KuCoin, Binance, OKX, Bybit API key/secret/passphrase girişi
- Paper / Live mod geçişi
- Risk profili ayarları
- Ajan repo yükleme (Admin sayfasından)

---

### 3.8 🔑 Admin — Vault & Keys
**Dosya:** `src/components/AdminPanel.tsx` — `forceSection="nasa"`

Gelişmiş sistem yönetimi.

**Ne yapar:**
- Vault (şifreli key yönetimi)
- PolicyGuard kuralları
- Sistem durumu ve sağlık kontrolleri
- Ajan ekleme (repo URL ile)

---

## 4. BACKEND API ROTALARI (14 Router, ~1800 satır)

### Tam Endpoint Listesi

| Endpoint | Metod | Açıklama |
|---|---|---|
| `/api/health` | GET | Sistem sağlık kontrolü |
| `/api/markets/ticker` | GET | KuCoin spot fiyatları (10s önbellekli) |
| `/api/markets/ohlcv` | GET | Mum verisi (1dk önbellekli) |
| `/api/markets/orderbook` | GET | Orderbook derinliği |
| `/api/chat` | POST | Claude AI sohbet |
| `/api/signals/realtime` | GET | 4 ajandan canlı sinyal üretimi |
| `/api/agents` | GET | Ajan listesi |
| `/api/agents/config` | GET/POST | Ajan model/görev yapılandırması |
| `/api/agents/add/repo` | POST | Repo URL ile ajan ekleme |
| `/api/strategy` | GET/POST | Strateji listesi + özel strateji kaydetme |
| `/api/strategy/backtest` | POST | Gerçek OHLCV ile backtest çalıştırma |
| `/api/strategy/vibe` | POST | NLP → strateji dönüşümü (Claude) |
| `/api/strategy/swarm` | GET | 4 ajan paralel konsensus analizi |
| `/api/strategy/evaluate` | GET | Tek strateji hızlı değerlendirme |
| `/api/news/sentiment` | GET | Claude piyasa duygu analizi |
| `/api/prediction/markets` | GET | Polymarket kripto tahminleri |
| `/api/prediction/interpret` | POST | Tahminlerin Claude yorumu |
| `/api/trade/intent` | POST | Emir niyeti oluşturma |
| `/api/trade/positions` | GET | Açık pozisyonlar |
| `/api/risk/status` | GET | Risk profili ve günlük PnL |
| `/api/risk/profile` | POST | Risk profili güncelleme |
| `/api/ledger` | GET | İşlem geçmişi |
| `/api/intent/:id` | GET | Belirli emir detayı |
| `/api/admin/status` | GET | Admin sistem durumu |

---

## 5. AJAN SİSTEMİ — 4 UZMAN AJAN

Sistem, birbirini tamamlayan 4 Claude yapay zeka ajanından oluşur. Her ajan bağımsız çalışır ve belirli bir uzmanlık alanına sahiptir.

---

### 🦅 OpenClaw — İstihbarat Ajanı
**Renk:** Teal `#00C9A7` | **Model:** claude-sonnet-4-20250514

**Görevi:** Piyasa verisi toplama ve birincil analiz.

**Aktif Görevleri:**
| Görev | Açıklama | Durum |
|---|---|---|
| Sentiment Analizi | Fear&Greed, Twitter/X, Reddit skorları | ✅ Aktif |
| Haber Monitörlüğü | CryptoPanic, RSS, breaking news | ✅ Aktif |
| OHLCV Toplama | CCXT ile tüm coinler, 1m/5m/1h | ✅ Aktif |
| Order Book Analizi | Büyük duvarlar, bid/ask dengesizliği | ✅ Aktif |
| Arbitraj Tespiti | Çapraz borsa fiyat farkı taraması | ✅ Aktif |
| Funding Rate | Perp funding oranları, long/short bias | ✅ Aktif |
| Balina Takibi | Büyük cüzdan hareketleri | ❌ Devre Dışı |
| Trending Tespiti | Sosyal medya hacim artışı | ❌ Devre Dışı |

**Swarm Rolü:** Momentum Hunter — Donchian Breakout (20 periyot)

---

### 🔮 Onyx — Araştırma Ajanı
**Renk:** Mor `#A78BFA` | **Model:** claude-sonnet-4-20250514

**Görevi:** Derin araştırma, makro analiz ve korelasyon çalışmaları.

**Aktif Görevleri:**
| Görev | Açıklama | Durum |
|---|---|---|
| Piyasa Araştırması | Derinlikli analiz ve trend incelemesi | ✅ Aktif |
| Korelasyon Analizi | BTC dominance, alt-beta katsayıları | ✅ Aktif |
| Makro Takip | Fed, CPI, DXY ve jeopolitik haberler | ✅ Aktif |
| On-chain Metrikler | MVRV, Realized P&L, exchange flows | ❌ Devre Dışı |

**Swarm Rolü:** Trend Follower — EMA Cross 12/26

---

### 🐟 Mirofish — Simülasyon Ajanı
**Renk:** Mavi `#38BDF8` | **Model:** claude-sonnet-4-20250514

**Görevi:** Backtest, Monte Carlo simülasyon ve risk modelleme.

**Aktif Görevleri:**
| Görev | Açıklama | Durum |
|---|---|---|
| Simülasyon Motoru | Monte Carlo ve stress test | ✅ Aktif |
| Backtest Motoru | Strateji geçmiş performans analizi | ✅ Aktif |
| Risk Modeli | VaR, CVaR, beklenen kayıp hesaplama | ✅ Aktif |
| Portföy Optimizasyonu | Kelly kriteri, korelasyon matrisi | ❌ Devre Dışı |

**Swarm Rolü:** Breakout Specialist — BB Squeeze Breakout

---

### ⚡ Betafish — Operasyon Ajanı
**Renk:** Sarı `#F59E0B` | **Model:** claude-sonnet-4-20250514

**Görevi:** Emir yönlendirme, pozisyon yönetimi ve arbitraj execution.

**Aktif Görevleri:**
| Görev | Açıklama | Durum |
|---|---|---|
| Emir Yönlendirme | CCXT aracılığı ile borsa emirleri | ✅ Aktif |
| Pozisyon Yönetimi | TP/SL takibi, kısmi kapatma | ✅ Aktif |
| Arbitraj Execution | Hız gerektiren çapraz borsa işlemleri | ✅ Aktif |
| Yeniden Dengeleme | Portföy ağırlık dengeleme | ❌ Devre Dışı |

**Swarm Rolü:** Mean Reversion Specialist — RSI Mean Reversion

---

### Ajan Sinyal Akışı
```
Piyasa Verisi
     │
     ├── OpenClaw (İstihbarat) → Haber + Sentiment + Orderbook
     ├── Onyx (Araştırma) → Makro + Korelasyon + Trend
     ├── Mirofish (Simülasyon) → Backtest + Risk + Volatilite
     └── Betafish (Operasyon) → Arbitraj + Momentum
           │
           ▼
    NEXUS SUPERVISOR (Claude)
           │
           ▼
    Konsensus Sinyal
    [LONG/SHORT, Güven %, Giriş/SL/TP]
           │
           ▼
    Trade Intent → CCXT → KuCoin
```

---

## 6. VERİ AKIŞI

### Ticker Verisi (Fiyat)
```
KuCoin REST API
    → CCXT fetchTicker()
    → Sunucu Önbelleği (10 saniye TTL)
    → /api/markets/ticker
    → İstemci Önbelleği (12 saniye TTL)
    → useTickers() hook (15 saniyede bir)
    → Header ticker şeridi + Control Plane Live Market
```

### Sinyal Üretimi
```
GET /api/signals/realtime
    → fetchOhlcv() [KuCoin, 15m, 100 mum]
    → fetchOrderbook() [KuCoin, depth:25]
    → factorize() [RSI/MACD/EMA/ATR/BB hesapla]
    → 4 ajan × watchlist = sinyaller
    → Grade A-D (konfluans skoru)
    → Frontend SignalEngine
```

### Backtest Akışı
```
POST /api/strategy/backtest
    → getStrategy(id) [8 builtin + custom]
    → fetchOhlcv() [gerçek KuCoin OHLCV]
    → runBacktest() [mum mum simülasyon]
    → Equity curve + tüm işlemler
    → Sharpe/Sortino/PF hesapla
    → Frontend BacktestTab (grafik + tablo)
```

### AI Sohbet Akışı
```
Kullanıcı mesajı + piyasa snapshot
    → POST /api/chat
    → Anthropic SDK (Replit AI Proxy)
    → claude-sonnet-4-20250514
    → Streaming yanıt
    → Frontend chat bubble
```

---

## 7. EKSİK PARÇALAR — SİSTEMİN TAM ÇALIŞMASI İÇİN

### 🔴 KRİTİK (Olmadan live trading çalışmaz)

| Eksik | Neden Gerekli | Nasıl Eklenir |
|---|---|---|
| **KuCoin API Key + Secret + Passphrase** | Live mod emirleri için zorunlu. Paper modda çalışmıyor ama emir gönderilemez | Config sayfasından gir → AdminPanel |
| **ANTHROPIC_API_KEY** | Şu an Replit AI Proxy üzerinden çalışıyor. Deploy edilince kendi key gerekir | Replit Secrets → `ANTHROPIC_API_KEY` |

### 🟡 ÖNEMLİ (Bazı özellikler çalışmıyor)

| Eksik | Etki | Çözüm |
|---|---|---|
| **Veritabanı (Supabase/PostgreSQL)** | Portföy geçmişi, strateji sonuçları kalıcı saklanamıyor. Şu an JSON dosyaları kullanılıyor (restart'ta kaybolabilir) | Replit PostgreSQL entegrasyonu ekle |
| **CryptoPanic API Key** | Haber sentiment analizi sınırlı — Claude kendi bilgisiyle üretiyor, gerçek haber akışı yok | `CRYPTOPANIC_API_KEY` ekle |
| **WebSocket Fiyat Akışı** | Şu an 15 saniyede bir REST polling yapılıyor. Gerçek borsa hızı için WebSocket gerekli | CCXT Pro (WebSocket) veya KuCoin WS |

### 🟢 EKSTRA ÖZELLİKLER (Sistemin güçlenmesi için)

| Özellik | Nasıl Eklenir |
|---|---|
| **Whale Alert** | `WHALE_ALERT_API_KEY` → OpenClaw'a ekle |
| **Glassnode On-chain** | `GLASSNODE_API_KEY` → Onyx'e ekle |
| **Telegram Bildirimleri** | Bot token + chat ID → sinyal alertleri |
| **Telegram/Discord Bot** | Sinyal ve emir bildirimleri |
| **Email Alertler** | Kritik pozisyon/risk uyarıları |

---

## 8. STRATEJİ SAYFASI EKSİKLİĞİ

Strateji sayfası `Library` sekmesi `/api/strategy` endpoint'inden çekiyor. **8 yerleşik strateji** mevcut ama görünmüyorsa şu nedenden olabilir:

1. API sunucusu ilk başlangıçta strateji endpoint'ini düzgün sunmuyor olabilir
2. Sayfayı yenile veya API sunucusunu restart et

**Mevcut 8 Yerleşik Strateji:**
- EMA Cross 12/26
- RSI Mean Reversion  
- BB Squeeze Breakout (TTM)
- Donchian Breakout (Turtle Traders)
- VWAP Bounce
- Stochastic Cross
- MACD Zero Cross
- Nexus Multi-Factor (Proprietary)

**Yeni Strateji Eklemek:**
- **Vibe Agent** sekmesinde doğal dil ile "200 EMA üstündeyken RSI 30 altına düşünce al" yaz → Claude parametre üretir → Kaydet
- Ya da `POST /api/strategy` ile direkt JSON gönder

---

## 9. ÖNERİLEN REPOLAR — SİSTEME EKLENEBİLECEK

### 🤖 Bot Framework'leri (Strateji + Execution)

| Repo | URL | Ne Sağlar |
|---|---|---|
| **Freqtrade** | `github.com/freqtrade/freqtrade` | Python tabanlı en olgun crypto bot. Yüzlerce hazır strateji, HyperOpt, backtesting. Nexus ile entegre edilebilir |
| **Hummingbot** | `github.com/hummingbot/hummingbot` | Market making + arbitraj. Betafish ajanına bağlanabilir |
| **Jesse** | `github.com/jesse-ai/jesse` | Basit ve güçlü backtesting framework. Strateji kütüphanesi genişletmek için |
| **OctoBot** | `github.com/Drakkar-Software/OctoBot` | Modüler bot sistemi. Sinyal provider eklenebilir |

### 📊 Teknik Analiz Kütüphaneleri

| Repo | URL | Ne Sağlar |
|---|---|---|
| **pandas-ta** | `github.com/twopirllc/pandas-ta` | 130+ teknik gösterge Python |
| **ta-lib** | `github.com/mrjbq7/ta-lib` | Endüstri standardı TA kütüphanesi |
| **lightweight-charts** | `github.com/tradingview/lightweight-charts` | TradingView kalitesinde mum grafiği |
| **ccxt** | `github.com/ccxt/ccxt` | 100+ borsa desteği (zaten kullanılıyor) |

### 🧠 AI / Agent Framework'leri

| Repo | URL | Ne Sağlar |
|---|---|---|
| **LangChain** | `github.com/langchain-ai/langchain` | Ajan zinciri kurma, tool calling |
| **CrewAI** | `github.com/crewAIInc/crewAI` | Çok-ajan orkestrasyon (emülasyon yerine gerçek) |
| **AutoGen** | `github.com/microsoft/autogen` | Microsoft'un çok-ajan sistemi |

### 📡 Veri Kaynakları

| Repo / API | URL | Ne Sağlar |
|---|---|---|
| **Whale Alert** | `docs.whale-alert.io` | Büyük cüzdan hareketleri — OpenClaw için |
| **Glassnode** | `glassnode.com/api` | On-chain metrikler — Onyx için |
| **CryptoPanic** | `cryptopanic.com/api` | Kripto haber akışı |
| **Alternative.me** | `alternative.me/crypto/fear-and-greed-index/api` | Fear & Greed Index (ücretsiz) |
| **Polymarket** | `gamma-api.polymarket.com` | Tahmin piyasaları (zaten entegre) |

---

## 10. MOBİL UYGULAMA (Nexus Mobile)

**Teknoloji:** Expo SDK 54 + Expo Router v6

### 7 Sekme:
| Sekme | Açıklama |
|---|---|
| 📊 Markets | Canlı fiyat kartları, sparkline grafikler |
| 📡 Signals | Sinyal akışı — web ile aynı veriler |
| 🤖 Agents | 4 ajan durumu |
| 💼 Portfolio | Portföy özeti |
| 📈 Strategy | Library, Swarm, Backtest formları |
| 🔮 Prediction | Polymarket piyasaları, Claude yorumu |
| ⚙️ Settings | Tema, borsa, risk ayarları |

---

## 11. HIZLI BAŞLANGIÇ REHBERİ

### Sistemi Gerçek Parayla Çalıştırmak İçin

**Adım 1:** Config sayfasına git (sol menü → Config / Exchanges)

**Adım 2:** KuCoin API anahtarlarını gir:
```
API Key:        [KuCoin hesabından al]
Secret Key:     [KuCoin hesabından al]
Passphrase:     [KuCoin hesabından al]
```

**Adım 3:** Mode'u LIVE'a geçir (sarı uyarı banner çıkacak)

**Adım 4:** Control sayfasına git → Claude ile konuş:
```
"BTC/USDT için backtest yap, en iyi stratejiyi öner"
"Şu an risk durumum nedir?"
"Portföyümü dengele"
```

**Adım 5:** Signals sayfasında A/B grade sinyalleri izle

> ⚠️ **UYARI:** LIVE modda gerçek para risklidir. Önce Paper modda test edin.

---

## 12. MEVCUT SORUNLAR VE ÇÖZÜMLER

| Sorun | Neden | Çözüm |
|---|---|---|
| Fiyatlar $0.00 gösteriyor | KuCoin API kısıtlı / yavaş | Sayfayı yenile, 15s polling bekle |
| Strateji kütüphanesi boş | API'ye istek atılamıyor | API sunucusunu restart et |
| Claude yanıt vermiyor | Replit AI Proxy sorunu | Replit AI Integrations kontrol et |
| Live trading çalışmıyor | API Key eksik | Config sayfasından gir |
| Mobil uygulama açılmıyor | Expo sunucusu başlatılmadı | Workflow'u başlat |

---

*Rapor sonu. Nexus/Dataclaw v5.0.0 — Mayıs 2026*
