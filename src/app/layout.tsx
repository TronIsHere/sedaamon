import type { Metadata, Viewport } from "next";
// Fonts are served from node_modules, never from Google Fonts, so the app works on the national network.
import "vazirmatn/Vazirmatn-Variable-font-face.css";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "صدامون",
  description: "سرورهای صوتی و تصویری برای گروه‌ها",
  applicationName: "صدامون",
  appleWebApp: {
    capable: true,
    title: "صدامون",
    // Content draws under the iOS status bar; the layout pads itself with the safe-area insets.
    statusBarStyle: "black-translucent",
  },
  // Stop iOS from turning phone numbers into call links.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // On Android the layout shrinks above the on-screen keyboard, so the message box stays visible.
  interactiveWidget: "resizes-content",
  themeColor: "#08080b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body className="h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
