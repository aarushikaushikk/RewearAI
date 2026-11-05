import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReWear AI — Your Intelligent Digital Wardrobe',
  description: 'Organize your wardrobe and discover occasion-based outfits with ReWear AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
