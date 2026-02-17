import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        arc: {
          bg: "#0f0f17",
          surface: "rgba(255, 255, 255, 0.06)",
          "surface-hover": "rgba(255, 255, 255, 0.10)",
          border: "rgba(255, 255, 255, 0.06)",
          "text-primary": "#e8e8ed",
          "text-secondary": "rgba(255, 255, 255, 0.40)",
          accent: "#6366f1",
          "accent-hover": "#818cf8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
