// Settings persistence is handled locally by zustand `persist` middleware
// (see state/persistentStore.ts). These functions are kept as no-ops so the
// existing call sites in App.tsx continue to work.

export async function syncSettingsToCloud(): Promise<void> {
  // Intentional no-op. Local persistence is handled by zustand's `persist` middleware.
}

export async function loadSettingsFromCloud(): Promise<void> {
  // Intentional no-op.
}
