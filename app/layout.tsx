import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Spectral, Hanken_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AppProvider } from "@/components/app-provider";
import { Toaster } from "@/components/ui/sonner";
import { getAppData } from "@/lib/queries";
import "./globals.css";

// Read fresh from Postgres on each full load; the AppProvider's client state
// then persists across client-side route navigation.
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
  title: "Cortado — Coffee Journal",
  description:
    "A warm, cozy coffee journal. Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins and the roasters behind them.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // theme-color is set client-side in AppProvider to follow the in-app theme toggle
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialData = await getAppData();
  // Per-request nonce set by middleware — forwarded to next-themes so its pre-paint
  // inline script is allowed under the strict-dynamic CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${spectral.variable} ${hanken.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
          <AppProvider initialData={initialData}>{children}</AppProvider>
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
