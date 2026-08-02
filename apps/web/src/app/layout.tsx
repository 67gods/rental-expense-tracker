import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rental Tracker',
  description: 'Expenses, hours, mileage, and time on site for the rental portfolio.',
  // Sideloaded onto phones and used one-handed; behaves like an app when the
  // user adds it to their home screen.
  appleWebApp: { capable: true, title: 'Rental', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximum-scale: pinch-zoom stays available, which matters for reading a
  // receipt total in bright sunlight.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
