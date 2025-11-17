import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ★★★ これが「色を直接書き込む」正しい設定です ★★★
      colors: {
        background: "hsl(220 10% 15%)", 
        foreground: "hsl(210 10% 80%)", 
        primary: {
          DEFAULT: "hsl(0 70% 60%)",
          foreground: "hsl(0 0% 100%)",
        },
        muted: {
          DEFAULT: "hsl(220 10% 25%)",
          foreground: "hsl(210 10% 50%)",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;