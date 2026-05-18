import type { Metadata } from 'next';
import { Space_Mono } from 'next/font/google';
import './globals.css';

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
});

export const metadata: Metadata = {
  title: 'GhostRadar PRO',
  description: 'Operational radar console for GhostRadar PRO'
};

import { LanguageProvider } from '@/i18n/LanguageContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${spaceMono.variable} h-full w-full overflow-x-hidden bg-black font-mono`}>
        <LanguageProvider>
          <div className="app-grid" aria-hidden="true" />
          <div className="app-root">{children}</div>
          <div className="crt-overlay" aria-hidden="true" />
        </LanguageProvider>
      </body>
    </html>
  );
}
