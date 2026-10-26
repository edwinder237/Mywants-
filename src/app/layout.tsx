import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegister } from "@/components/sw-register";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { Toaster } from "@/components/ui/sonner";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "my wants.",
  description: "Want it. Earn it. Enjoy it. A private wishlist where each want unlocks after three things you choose.",
  applicationName: "my wants.",
  appleWebApp: { capable: true, title: "my wants.", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1815" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data-theme before hydration, so React must not flag it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster />
        <ServiceWorkerRegister />
        <ThemeColorSync />
      </body>
    </html>
  );
}
