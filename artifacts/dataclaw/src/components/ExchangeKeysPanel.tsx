import { useState, useEffect, useCallback } from "react";

const C = {
  bg: "#0b1326",
  card: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)",
  green: "#00FFB2",
  red: "#FF4D6D",
  muted: "#7a8aa6",
  text: "#e8eef9",
};

const EXCHANGES = [
  { id: "binance", label: "Binance" },
  { id: "bybit", label: "Bybit" },
  { id: "okx", label: "OKX (passphrase gerekli)" },
  { id: "kucoin", label: "KuCoin (passphrase gerekli)" },
];

interface VaultKey {
  id: string;
  exchange: string;
  label: string;
  isTestnet: boolean;
  isActive: boolean;
  apiKeyMasked: string;
  lastVerifiedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export default function ExchangeKeysPanel() {
  const [keys, setKeys] = useState<VaultKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [form, setForm] = useState({
    exchange: "binance",
    label: "default",
    apiKey: "",
    apiSecret: "",
    apiPassphrase: "",
    isTestnet: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/vault/keys", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setKeys(d.keys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const payload: any = {
        exchange: form.exchange,
        label: form.label || "default",
        apiKey: form.apiKey.trim(),
        apiSecret: form.apiSecret.trim(),
        isTestnet: form.isTestnet,
      };
      if (form.apiPassphrase.trim()) payload.apiPassphrase = form.apiPassphrase.trim();
      const r = await fetch("/api/vault/keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (r.ok) {
        setMsg({ kind: "ok", text: `✅ Anahtar ${d.action === "created" ? "kaydedildi" : "güncellendi"}` });
        setForm({ ...form, apiKey: "", apiSecret: "", apiPassphrase: "" });
        load();
      } else {
        setMsg({ kind: "err", text: `❌ ${d.error ?? "Hata"}` });
      }
    } catch (err: any) {
      setMsg({ kind: "err", text: `❌ ${err?.message ?? "Ağ hatası"}` });
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (id: string) => {
    setVerifying(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/vault/keys/${id}/verify`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        setMsg({
          kind: "ok",
          text: `✅ Doğrulandı — ${d.balanceCoins} coin bakiyesi tespit edildi`,
        });
      } else {
        setMsg({ kind: "err", text: `❌ ${d.error ?? "Doğrulama başarısız"}` });
      }
      load();
    } finally {
      setVerifying(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Bu API anahtarını silmek istediğinden emin misin?")) return;
    await fetch(`/api/vault/keys/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.4)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    color: C.text,
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    outline: "none",
    width: "100%",
  };

  return (
    <div style={{ color: C.text, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px 0", color: C.green }}>
          🔐 Borsa API Anahtarları (Vault)
        </h3>
        <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
          Anahtarların AES-256-GCM ile sunucu tarafında şifrelenir. Sadece sen okuyabilirsin.
          <br />
          <strong style={{ color: C.red }}>İPUCU:</strong> Mutlaka <em>sadece okuma + spot/futures trading</em> izinli, <em>çekim KAPALI</em> ve mümkünse IP-whitelist'li anahtar oluştur.
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={submit}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 14,
          marginBottom: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>
            Borsa
            <select
              value={form.exchange}
              onChange={(e) => setForm({ ...form, exchange: e.target.value })}
              style={{ ...inputStyle, marginTop: 4 }}
            >
              {EXCHANGES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>
            Etiket
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="default / live / scalp"
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
        </div>

        <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>
          API Key
          <input
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="API anahtarın"
            required
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>
          API Secret
          <input
            type="password"
            value={form.apiSecret}
            onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
            placeholder="API secret"
            required
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>

        {(form.exchange === "okx" || form.exchange === "kucoin") && (
          <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>
            Passphrase
            <input
              type="password"
              value={form.apiPassphrase}
              onChange={(e) => setForm({ ...form, apiPassphrase: e.target.value })}
              placeholder="Borsada belirlediğin passphrase"
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
        )}

        <label
          style={{
            fontSize: 11,
            color: C.muted,
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={form.isTestnet}
            onChange={(e) => setForm({ ...form, isTestnet: e.target.checked })}
          />
          Testnet (sandbox) modu
        </label>

        <button
          type="submit"
          disabled={submitting}
          style={{
            background: C.green,
            color: "#000",
            border: "none",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: submitting ? "wait" : "pointer",
            fontFamily: "'DM Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {submitting ? "Kaydediliyor…" : "🔒 Şifrele ve Kaydet"}
        </button>

        {msg && (
          <div
            style={{
              fontSize: 11,
              padding: "8px 10px",
              borderRadius: 6,
              background: msg.kind === "ok" ? "rgba(0,255,178,0.08)" : "rgba(255,77,109,0.08)",
              border: `1px solid ${msg.kind === "ok" ? C.green : C.red}44`,
              color: msg.kind === "ok" ? C.green : C.red,
            }}
          >
            {msg.text}
          </div>
        )}
      </form>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Kayıtlı Anahtarlar ({keys.length})
        </div>
        {loading && <div style={{ fontSize: 11, color: C.muted }}>Yükleniyor…</div>}
        {!loading && keys.length === 0 && (
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              padding: 24,
              textAlign: "center",
              border: `1px dashed ${C.border}`,
              borderRadius: 8,
            }}
          >
            Henüz API anahtarı eklenmemiş. Yukarıdan ilk borsanı bağla.
          </div>
        )}
        {keys.map((k) => (
          <div
            key={k.id}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 12,
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "flex", gap: 8, alignItems: "center" }}>
                {k.exchange.toUpperCase()}
                <span style={{ fontSize: 10, color: C.muted }}>· {k.label}</span>
                {k.isTestnet && (
                  <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(255,193,7,0.15)", color: "#ffc107", borderRadius: 4 }}>
                    TESTNET
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                {k.apiKeyMasked}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                {k.lastVerifiedAt ? (
                  <span style={{ color: C.green }}>
                    ✅ Doğrulandı: {new Date(k.lastVerifiedAt).toLocaleString("tr-TR")}
                  </span>
                ) : k.lastError ? (
                  <span style={{ color: C.red }} title={k.lastError}>
                    ❌ Hata: {k.lastError.slice(0, 60)}
                  </span>
                ) : (
                  <span>Henüz doğrulanmadı</span>
                )}
              </div>
            </div>
            <button
              onClick={() => verify(k.id)}
              disabled={verifying === k.id}
              style={{
                background: "transparent",
                color: C.green,
                border: `1px solid ${C.green}88`,
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {verifying === k.id ? "Test ediliyor…" : "🔍 Test Et"}
            </button>
            <button
              onClick={() => remove(k.id)}
              style={{
                background: "transparent",
                color: C.red,
                border: `1px solid ${C.red}88`,
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              🗑 Sil
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
