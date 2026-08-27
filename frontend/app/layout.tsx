import type { Metadata } from 'next';
import { Alex_Brush, Geist, Geist_Mono, Lilita_One } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const lilitaOne = Lilita_One({
  variable: '--font-brand',
  weight: '400',
  subsets: ['latin'],
});

const alexBrush = Alex_Brush({
  variable: '--font-wordmark',
  weight: '400',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Vulpecula — AI Game Art Studio',
  description: 'A focused workspace for creating consistent, production-ready game art.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Vulpecula — AI Game Art Studio',
    description: 'Create every asset in one cohesive visual language.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Vulpecula AI Game Art Studio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vulpecula — AI Game Art Studio',
    description: 'Create every asset in one cohesive visual language.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${lilitaOne.variable} ${alexBrush.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
