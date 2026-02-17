import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Study Timer',
  description: 'Study Timer with Accountability Partners',
  icons: {
    icon: [
      { url: '/icons/favicon-32-v2.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-192-v2.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/favicon-180-v2.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Study Timer',
  },
};

export const viewport: Viewport = {
  themeColor: '#10b981',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
