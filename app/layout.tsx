import React from "react"
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/components/providers/session-provider"
import { ThemeProvider } from "@/components/theme-provider"

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: '',
  description: 'A sustainable prompting interface powered by your LLM of choice. Explore intelligent conversations with sustainability in mind.' + 
  'Our modular platform allows for any organization to verify carbon offsetting to eco-ify their LLM usage.',
}

export const viewport: Viewport = {
  themeColor: '#3d7a4f',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
