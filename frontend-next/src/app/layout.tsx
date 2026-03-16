import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ModeProvider } from '@/context/ModeContext';
import { Web3Provider } from '@/context/Web3Context';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AI Financial Operating System',
  description: 'Programmable AI agent payment vaults on LUKSO',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Web3Provider>
          <ModeProvider>{children}</ModeProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
