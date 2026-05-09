import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-7xl font-bold gold-text">404</h1>
        <p className="mt-2 text-muted-foreground">This page does not exist.</p>
        <a href="/" className="mt-6 inline-flex rounded-xl gold-bg px-5 py-2.5 font-medium">Go home</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-xl gold-bg px-5 py-2.5 font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0d0d12" },
      { title: "AZEC Finance — Building Financial Discipline Through AI" },
      { name: "description", content: "AI-powered fintech for Malaysian university students. Reduce debt, build streaks, lock savings in your Smart Vault." },
      { property: "og:title", content: "AZEC Finance — Building Financial Discipline Through AI" },
      { property: "og:description", content: "AI-powered fintech for Malaysian university students. Reduce debt, build streaks, lock savings in your Smart Vault." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "AZEC Finance — Building Financial Discipline Through AI" },
      { name: "twitter:description", content: "AI-powered fintech for Malaysian university students. Reduce debt, build streaks, lock savings in your Smart Vault." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9eadc43e-d471-4e39-80d8-e276db222f99/id-preview-6ef5dbc9--18e3f03a-1df7-4567-a58a-d56bb7068beb.lovable.app-1778338931906.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9eadc43e-d471-4e39-80d8-e276db222f99/id-preview-6ef5dbc9--18e3f03a-1df7-4567-a58a-d56bb7068beb.lovable.app-1778338931906.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }, { rel: "preconnect", href: "https://fonts.googleapis.com" }, { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster theme="dark" position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
