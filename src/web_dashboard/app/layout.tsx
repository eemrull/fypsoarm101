import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });
const enableVercelAnalytics =
  process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "1";

export const metadata: Metadata = {
  title: "SO-ARM101 Dashboard",
  description: "Web interface for controlling the SO-ARM101 modular robotic platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.className} bg-black text-white w-screen h-screen`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Header />
          {children}
          {enableVercelAnalytics ? <Analytics /> : null}
        </ThemeProvider>
      </body>
    </html>
  );
}
