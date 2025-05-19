import type {Metadata} from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import Providers from '@/components/providers'; // General providers (like React Query)
import { AuthProvider } from '@/contexts/AuthContext'; // Specific Auth Provider

export const metadata: Metadata = {
  title: 'מנהל צה"ל',
  description: 'אפליקציה לניהול חיילים וציוד צבאי',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <Providers> {/* General providers like React Query */}
          <AuthProvider> {/* AuthProvider wraps the children */}
            {children}
          </AuthProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
