import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { FONT_SIZE_BOOT_SCRIPT } from "@/lib/font-size";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "HSL Hearing Dashboard",
  description: "Hogan Smith Law — Hearing Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the user's font-size preference BEFORE first paint so the
            zoom class doesn't flash in after hydration. Reads localStorage
            synchronously and sets data-font-size on <html>. */}
        <script
          dangerouslySetInnerHTML={{ __html: FONT_SIZE_BOOT_SCRIPT }}
        />
      </head>
      <body className={`${inter.variable} ${plexMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
