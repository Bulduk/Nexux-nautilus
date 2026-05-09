import { useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { useAuth } from "@/lib/auth";
import { apiPost, type PushRegisterResult } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let _cachedToken: string | null = null;

export async function getExpoPushTokenSafe(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#00FFB2",
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    _cachedToken = tokenData.data;
    return _cachedToken;
  } catch {
    return null;
  }
}

export interface PushRegisterReply {
  ok: boolean;
  prefs: PushPrefs | null;
}

export async function registerDeviceForPush(): Promise<{
  token: string | null;
  registered: boolean;
  prefs: PushPrefs | null;
}> {
  const token = await getExpoPushTokenSafe();
  if (!token) return { token: null, registered: false, prefs: null };
  try {
    const reply = await apiPost<PushRegisterReply & PushRegisterResult>("/push/register", {
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? undefined,
      appVersion: Constants?.expoConfig?.version ?? undefined,
    });
    return { token, registered: true, prefs: reply.prefs ?? null };
  } catch {
    return { token, registered: false, prefs: null };
  }
}

export async function unregisterDeviceForPush(): Promise<void> {
  const token = _cachedToken;
  if (!token) return;
  try {
    await apiPost("/push/unregister", { token });
  } catch {
    // ignore
  }
}

export interface PushPrefs {
  enabled: boolean;
  signalLevel: "all" | "high_grade_only";
  notifySignals: boolean;
  notifyFills: boolean;
  notifyCouncil: boolean;
}

const DEFAULT_PREFS: PushPrefs = {
  enabled: true,
  signalLevel: "high_grade_only",
  notifySignals: true,
  notifyFills: true,
  notifyCouncil: false,
};

export function usePushSettings() {
  const { isAuthenticated } = useAuth();
  const [token, setToken] = useState<string | null>(_cachedToken);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") {
      setPermission("denied");
      return;
    }
    Notifications.getPermissionsAsync()
      .then((r) => setPermission(r.status === "granted" ? "granted" : "denied"))
      .catch(() => setPermission("denied"));
    if (_cachedToken) setToken(_cachedToken);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web") return;
    (async () => {
      const r = await registerDeviceForPush();
      if (r.token) setToken(r.token);
      if (r.prefs) setPrefs((p) => ({ ...p, ...r.prefs }));
    })();
  }, [isAuthenticated]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const r = await registerDeviceForPush();
      if (r.token) {
        setToken(r.token);
        setPermission("granted");
        setPrefs((p) => ({ ...p, ...(r.prefs ?? {}), enabled: true }));
      } else {
        setPermission("denied");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const updatePref = useCallback(
    async <K extends keyof PushPrefs>(key: K, value: PushPrefs[K]) => {
      const t = _cachedToken;
      if (!t) return;
      setPrefs((p) => ({ ...p, [key]: value }));
      try {
        await apiPost("/push/prefs", { token: t, [key]: value });
      } catch {
        setPrefs((p) => ({ ...p, [key]: !value as PushPrefs[K] }));
      }
    },
    [],
  );

  const test = useCallback(async () => {
    setBusy(true);
    try {
      await apiPost("/push/test", {});
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    token,
    permission,
    prefs,
    busy,
    isWeb: Platform.OS === "web",
    enable,
    updatePref,
    test,
  };
}
