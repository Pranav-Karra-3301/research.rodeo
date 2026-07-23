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

const siteUrl = "https://research.rodeo";
const siteDescription =
  "Research Rodeo is an interactive, graph-based explorer for academic papers. Discover, map, and synthesize the literature as a connected graph of related work.";

export const metadata: Metadata = {
  title: {
    default: "Research Rodeo",
    template: "%s | Research Rodeo",
  },
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  applicationName: "Research Rodeo",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/rodeo.png",
    apple: "/rodeo.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Research Rodeo",
    title: "Research Rodeo",
    description: siteDescription,
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
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: "Research Rodeo",
      url: siteUrl,
      description: siteDescription,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires a modern web browser with JavaScript enabled.",
      image: `${siteUrl}/og-preview.jpg`,
      creator: { "@id": "https://pranavkarra.me/#person" },
    },
    {
      "@type": "Person",
      "@id": "https://pranavkarra.me/#person",
      name: "Pranav Karra",
      url: "https://pranavkarra.me/",
      sameAs: [
        "https://github.com/Pranav-Karra-3301",
        "https://www.linkedin.com/in/pranavkarra001",
        "https://x.com/pranavkarra",
      ],
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <SpacetimeDBProvider>{children}</SpacetimeDBProvider>
      </body>
    </html>
  );
}
