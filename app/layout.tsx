import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Spectral, Hanken_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getPublicBaseUrl } from "@/lib/public-url";
import { THEME_LIGHT } from "@/lib/theme-colors";
import "./globals.css";

// force-dynamic stays at the ROOT so every route (including the (legal) group)
// is dynamically rendered — required by the per-request nonce CSP (see
// proxy.ts). The root no longer reads Postgres: the per-user data load
// moved to app/(app)/layout.tsx, so legal pages render even when the DB is down.
export const dynamic = "force-dynamic";

// Display serif — characterful, used for headings, bean names, stats.
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-spectral",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

// Body grotesque — refined, used for everything else (variable weight).
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
  fallback: ["-apple-system", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicBaseUrl()),
  title: "Cortado — Coffee Journal",
  description:
    "A warm, cozy coffee journal. Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins and the roasters behind them.",
  openGraph: {
    type: "website",
    siteName: "Cortado",
    title: "Cortado — Coffee Journal",
    description: "Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins and the roasters behind them.",
  },
  twitter: { card: "summary_large_image", title: "Cortado — Coffee Journal" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Pre-paint browser-chrome tint. A single static light value (not a
  // prefers-color-scheme array) is correct here: next-themes runs
  // enableSystem={false} defaultTheme="light", so the app is light by default
  // regardless of OS. The app-provider effect takes over post-hydration to
  // follow the in-app toggle.
  themeColor: THEME_LIGHT,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Per-request nonce set by proxy.ts — forwarded to next-themes so its pre-paint
  // inline script is allowed under the strict-dynamic CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${spectral.variable} ${hanken.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
          {children}
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
