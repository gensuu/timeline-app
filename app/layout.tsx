import type { Metadata, Viewport } from "next"; // ★ Viewport をインポート
import "./globals.css"; 

export const metadata: Metadata = {
  title: "タイムラインアプリ",
  description: "時間の流れを直感的に管理するタイムラインアプリ",
  manifest: "/manifest.json", // manifest.json へのパス
  // themeColor: "#0a0a0a", // 警告が出るため、ここから削除
};

// ★★★ PWAの警告(themeColor)を修正 ★★★
// metadata から viewport に themeColor を移動
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};
// ★★★ ここまで ★★★

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      {/*
       * ★ 最終版レイアウト ★
       * body を、fixed 要素の基準 (relative) となるシンプルなタグに戻します。
       */}
      <body className="relative antialiased overflow-hidden h-screen">
        {/*
         * {children} (app/page.tsx) がここに挿入されます。
         */}
        {children}
      </body>
    </html>
  );
}