import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ModeProvider } from '@/context/ModeContext';
import { Web3Provider } from '@/context/Web3Context';
import { OnboardingProvider } from '@/context/OnboardingContext';
import { I18nProvider } from '@/context/I18nContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Web3Providers } from './providers';
import '@rainbow-me/rainbowkit/styles.css';
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
  title: 'Vaultia — Smart Money Spaces',
  description: 'Automate payments with clear rules and full control.',
  icons: [
    { rel: 'icon', url: '/favicon-light.svg', media: '(prefers-color-scheme: light)', type: 'image/svg+xml' },
    { rel: 'icon', url: '/favicon-dark.svg',  media: '(prefers-color-scheme: dark)',  type: 'image/svg+xml' },
    { rel: 'icon', url: '/favicon.ico' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <Web3Providers>
            <Web3Provider>
              <I18nProvider>
                <ModeProvider>
                  <OnboardingProvider>
                    {children}
                  </OnboardingProvider>
                </ModeProvider>
              </I18nProvider>
            </Web3Provider>
          </Web3Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
