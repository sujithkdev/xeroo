'use client';
import { createContext, useContext } from 'react';

export const ShopNameContext = createContext('Print shop');
export function ShopNameProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <ShopNameContext.Provider value={value}>{children}</ShopNameContext.Provider>;
}
export const useShopName = () => useContext(ShopNameContext);
