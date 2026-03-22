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

const SPLASH_CSS = `
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
  .v-node {
    opacity: 0;
    transform: scale(0.6);
    transform-origin: center;
    animation: appear 0.4s ease forwards;
  }
  .v-node:nth-child(1) { animation-delay: 0.07s; }
  .v-node:nth-child(2) { animation-delay: 0.14s; }
  .v-node:nth-child(3) { animation-delay: 0.21s; }
  .v-node:nth-child(4) { animation-delay: 0.28s; }
  .v-node:nth-child(5) { animation-delay: 0.35s; }
  .v-node:nth-child(6) { animation-delay: 0.42s; }
  .v-node:nth-child(7) { animation-delay: 0.49s; }
  @keyframes appear {
    to { opacity: 1; transform: scale(1); }
  }
  .v-node.synced {
    fill: #10B981;
    filter: drop-shadow(0 0 8px #10B981);
    transition: fill 0.3s ease, filter 0.3s ease;
  }
`;

const SPLASH_JS = `
(function () {
  setTimeout(function () {
    var nodes = document.querySelectorAll('.v-node');
    nodes.forEach(function (n) { n.classList.add('synced'); });
  }, 900);
  window.addEventListener('load', function () {
    var splash = document.getElementById('vaultia-splash');
    if (!splash) return;
    splash.classList.add('loaded');
    setTimeout(function () {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 600);
  });
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
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div
          id="vaultia-splash"
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#F9F9F9', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, transition: 'opacity 0.6s ease' }}
        >
          <svg width="350" height="50" viewBox="0 0 350 50">
            <circle className="v-node" cx="25"  cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="75"  cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="125" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="175" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="225" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="275" cy="25" r="10" fill="#1D1D1F" opacity="0" />
            <circle className="v-node" cx="325" cy="25" r="10" fill="#1D1D1F" opacity="0" />
          </svg>
        </div>
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
        <script dangerouslySetInnerHTML={{ __html: SPLASH_JS }} />
      </body>
    </html>
  );
}
