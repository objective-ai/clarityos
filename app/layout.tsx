/**
 * app/layout.tsx — Root layout
 *
 * Sets up global fonts, CSS custom properties, and any providers that wrap
 * the entire application tree.
 */

import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | ClarityOS",
    default: "ClarityOS — Optometry Practice Management",
  },
  description: "Clinical workflow management for modern optometry practices.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=JSON.parse(localStorage.getItem("clarity-theme"));if(t&&t.state&&t.state.theme){document.documentElement.setAttribute("data-theme",t.state.theme)}else{document.documentElement.setAttribute("data-theme","light")}}catch(e){document.documentElement.setAttribute("data-theme","light")}try{var c=JSON.parse(localStorage.getItem("clarity-tenant-customization"));if(c&&c.state&&c.state.fontSize){document.documentElement.style.fontSize=c.state.fontSize+"px"}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-jakarta antialiased">
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
