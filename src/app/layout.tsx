import type { Metadata } from "next";
import { Barlow, Manrope, JetBrains_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Títulos: geométrica em maiúsculas, como o cartão da CFFGROUP.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Estoque CFFGROUP",
  description: "Controle de estoque de materiais de escritório — CFFGROUP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${barlow.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink font-sans">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--brand)",
              borderRadius: "12px",
              fontFamily: "var(--font-manrope)",
              fontSize: "14px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            },
            success: { iconTheme: { primary: "var(--ok)", secondary: "var(--ok-soft)" } },
            error: { iconTheme: { primary: "var(--critical)", secondary: "var(--critical-soft)" } },
          }}
        />
      </body>
    </html>
  );
}
