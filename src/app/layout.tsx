import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/context/AuthContext';
import { ScreenshotModeProvider } from '@/context/ScreenshotModeContext';
import { ObservabilityInit } from '@/components/observability/ObservabilityInit';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'VitaZen — Transforma tu vida',
  description: 'Ecosistema premium de desarrollo personal basado en 5 imperios: Disciplina, Mente, Energía, Finanzas y Crecimiento.',
  icons: {
    icon: [
      { url: '/images/vitazen-logo.png' },
      { url: '/images/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/images/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/images/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased bg-[#000000] text-white font-sans`}>
        <AuthProvider>
          <ScreenshotModeProvider>
            <ObservabilityInit />
            {children}
            <Toaster />
          </ScreenshotModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
