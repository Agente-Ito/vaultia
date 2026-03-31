import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
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
  title: 'Vaultia — Automated budgets and payments',
  description: 'Composable on-chain accounting protocol for AI agents.',
  icons: [
    { rel: 'icon', url: '/favicon-light.svg', media: '(prefers-color-scheme: light)', type: 'image/svg+xml' },
    { rel: 'icon', url: '/favicon-dark.svg',  media: '(prefers-color-scheme: dark)',  type: 'image/svg+xml' },
    { rel: 'icon', url: '/favicon.png', type: 'image/png' },
    { rel: 'apple-touch-icon', url: '/favicon.png' },
  ],
};

const splashStyles = `
  #vaultia-splash {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: #F9F9F9;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    transition: opacity 0.6s ease;
  }
  #vaultia-splash.loaded {
    opacity: 0;
    pointer-events: none;
  }
  @keyframes v-appear {
    from { opacity: 0; transform: scale(0.6); }
    to   { opacity: 1; transform: scale(1); }
  }
  .v-node {
    animation: v-appear 0.4s ease forwards;
  }
  .v-node:nth-child(1) { animation-delay: 0.07s; }
  .v-node:nth-child(2) { animation-delay: 0.14s; }
  .v-node:nth-child(3) { animation-delay: 0.21s; }
  .v-node:nth-child(4) { animation-delay: 0.28s; }
  .v-node:nth-child(5) { animation-delay: 0.35s; }
  .v-node:nth-child(6) { animation-delay: 0.42s; }
  .v-node:nth-child(7) { animation-delay: 0.49s; }
`;

const splashScript = `
  (function () {
    var splash = document.getElementById('vaultia-splash');
    if (!splash) return;
    // Fade out on window load — do NOT removeChild; React owns this node
    function dismiss() {
      splash.classList.add('loaded');
    }
    if (document.readyState === 'complete') {
      setTimeout(dismiss, 900);
    } else {
      window.addEventListener('load', function () { setTimeout(dismiss, 300); });
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light">
      <head>
        <style dangerouslySetInnerHTML={{ __html: splashStyles }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        {/* Vaultia Celestial Splash — rendered before React hydration */}
        <div id="vaultia-splash">
          <svg width="350" height="50" viewBox="0 0 350 50" aria-hidden="true">
            <circle className="v-node" cx="25"  cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="75"  cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="125" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="175" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="225" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="275" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="325" cy="25" r="10" fill="#1D1D1F" opacity="0" />
          </svg>
        </div>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
        <ThemeProvider>
          <Web3Providers>
            <Web3Provider>
              <I18nProvider>
                <ModeProvider>
                  <OnboardingProvider>
                    {children}
                    <Analytics />
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
