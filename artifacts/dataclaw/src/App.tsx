import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useAuth } from "@workspace/replit-auth-web";
import AppShell from "./AppShell";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingScreen() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b1326]">
      <div className="text-[#00FFB2] font-mono text-sm animate-pulse">Yükleniyor…</div>
    </div>
  );
}

function HomeRedirect() {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) return <LoadingScreen />;

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b1326] px-4 py-8">
        <div className="bg-[#0f1a30] border border-[rgba(218,226,253,0.12)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.55)] p-8 flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <img
              src={`${window.location.origin}${basePath}/logo.svg`}
              alt="Nexus"
              className="h-10 w-auto"
            />
            <h1 className="text-[#dae2fd] text-2xl font-semibold tracking-tight font-mono">
              Nexus OS — Trader Konsolu
            </h1>
            <p className="text-[rgba(218,226,253,0.65)] text-sm tracking-wide uppercase font-mono">
              Hesabınıza giriş yapın
            </p>
          </div>
          <button
            type="button"
            onClick={login}
            className="w-full py-3 rounded-xl font-bold uppercase tracking-wider text-sm transition-colors"
            style={{ background: "#00FFB2", color: "#0b1326" }}
          >
            Giriş Yap
          </button>
        </div>
      </div>
    );
  }

  return <AppShell />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/:rest*" component={HomeRedirect} />
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </WouterRouter>
  );
}
