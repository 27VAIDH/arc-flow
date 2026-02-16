import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        arc: {
          bg: "#0f0f17",
          surface: "#1a1a2e",
          "surface-hover": "#252540",
          border: "#2a2a45",
          "text-primary": "#e8e8ed",
          "text-secondary": "#8888a0",
          accent: "#6366f1",
          "accent-hover": "#818cf8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
