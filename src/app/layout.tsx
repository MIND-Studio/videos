import type { Metadata } from "next";
import { ThemeProvider } from "@mind-studio/ui";
import { mind } from "@mind-studio/ui/themes";
import "./globals.css";
import Header from "@/components/Header";
import { StandaloneOnly } from "@/components/StandaloneOnly";
import { BrokerThemeSync } from "@/components/BrokerThemeSync";

export const metadata: Metadata = {
  title: "Mind Video — reels from your pod",
  description:
    "Drop photos and videos, let Mind caption them, then describe the reel you want. The agent plans a ReelSpec that previews in your browser and renders to an MP4 in your pod — never our servers.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-mind-theme="mind" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        <ThemeProvider
          theme={mind}
          defaultTheme="dark"
          enableSystem={false}
          storageKey="mind-video-theme"
        >
          <BrokerThemeSync />
          <StandaloneOnly>
            <Header />
          </StandaloneOnly>
          <main className="flex flex-1 flex-col">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
