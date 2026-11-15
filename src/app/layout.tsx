import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

import { headers } from 'next/headers';
import { cache } from 'react';
import { getShopById } from '@/lib/db/shops';
import { ShopNameProvider } from '@/components/ShopNameContext';

const shopName = cache(async () => {
  const request = await headers();
  const id = request.get('x-shop-id');
  if (!id) return request.get('x-admin-request') === '1' ? 'Xeroo Admin' : 'Print shop';
  return (await getShopById(id))?.name || 'Print shop';
});

export async function generateMetadata(): Promise<Metadata> {
  return { title: await shopName(), description: 'Order prints and track your pickup.' };
}
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">

      <body>
        <Toaster position="top-right" />
        <ShopNameProvider value={await shopName()}>{children}</ShopNameProvider>
      </body>
    </html>
  );
}
