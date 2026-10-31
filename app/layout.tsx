import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#08080f' };

export const metadata: Metadata = {
  title: 'LeadHunter — Local Business Lead Generator',
  description:
    'Search for local businesses, extract contact info, and discover leads with the Google Places API and intelligent web scraping.',
  keywords: ['lead generation', 'local business', 'web scraping', 'Google Places', 'email finder'],
  openGraph: {
    title: 'LeadHunter — Local Business Lead Generator',
    description: 'Find local business leads instantly with smart scraping.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
