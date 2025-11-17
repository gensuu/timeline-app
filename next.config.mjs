/** @type {import('next').NextConfig} */

// ★★★ 変更点 ★★★
// インポート先を 'next-pwa' から '@ducanh2912/next-pwa' に変更
import withPWAInit from "@ducanh2912/next-pwa";

// PWAの設定
const withPWA = withPWAInit({
  dest: "public", // 'public' フォルダに出力 (変更なし)
  register: true, // サービスワーカーを自動で登録 (変更なし)
  skipWaiting: true, // すぐに有効化 (変更なし)
  // ★★★ 変更点 ★★★
  // disable: ... の行を削除 (ライブラリが自動で 'development' 時に無効化してくれる)
});

// Next.js の設定
const nextConfig = {
  // (変更なし)
};

// PWA設定とNext.js設定をマージしてエクスポートします
export default withPWA(nextConfig);