import type { Metadata, Viewport } from "next"; 
import "./globals.css"; 

export const metadata: Metadata = {
  title: "タイムラインアプリ",
  description: "時間の流れを直感的に管理するタイムラインアプリ",
  manifest: "/manifest.json", 
};

// ★★★ 変更点 ★★★
// themeColor を manifest.json と合わせます
export const viewport: Viewport = {
  themeColor: "#242936",
};
// ★★★ ここまで ★★★

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="relative antialiased overflow-hidden h-screen">
        {children}
      </body>
    </html>
  );
}