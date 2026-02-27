import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { SpacetimeDBProvider } from "@/components/providers/SpacetimeDBProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Research Rodeo",
  description:
    "AI-powered literature research workspace. Discover, explore, and synthesize academic papers.",
  metadataBase: new URL("https://research.rodeo"),
  icons: {
    icon: "/rodeo.png",
    apple: "/rodeo.png",
  },
  openGraph: {
    title: "Research Rodeo",
    description:
      "AI-powered literature research workspace. Discover, explore, and synthesize academic papers.",
    images: [
      {
        url: "/og-preview.jpg",
        width: 1200,
        height: 630,
        alt: "Research Rodeo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Research Rodeo",
    description:
      "AI-powered literature research workspace. Discover, explore, and synthesize academic papers.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrains.variable} ${sourceSerif.variable} font-sans antialiased`}
      >
        <SpacetimeDBProvider>{children}</SpacetimeDBProvider>
      </body>
    </html>
  );
}
