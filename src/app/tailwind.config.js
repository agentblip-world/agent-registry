/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        gray: {
          50:  "rgb(var(--gray-50) / <alpha-value>)",
          100: "rgb(var(--gray-100) / <alpha-value>)",
          200: "rgb(var(--gray-200) / <alpha-value>)",
          300: "rgb(var(--gray-300) / <alpha-value>)",
          400: "rgb(var(--gray-400) / <alpha-value>)",
          500: "rgb(var(--gray-500) / <alpha-value>)",
          600: "rgb(var(--gray-600) / <alpha-value>)",
          700: "rgb(var(--gray-700) / <alpha-value>)",
          800: "rgb(var(--gray-800) / <alpha-value>)",
          900: "rgb(var(--gray-900) / <alpha-value>)",
          950: "rgb(var(--gray-950) / <alpha-value>)",
        },
        brand: {
          50:  "#fffdf0",
          100: "#fff9d6",
          200: "#fff2a8",
          300: "#ffe766",
          400: "#FFD633",
          500: "#EEC300",
          600: "#d4ad00",
          700: "#a88900",
          800: "#7d6600",
          900: "#524300",
          950: "#2e2500",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgb(255 214 51 / 0.4), 0 0 20px rgb(255 214 51 / 0.1)" },
          "100%": { boxShadow: "0 0 10px rgb(255 214 51 / 0.6), 0 0 40px rgb(255 214 51 / 0.2)" },
        },
      },
    },
  },
  plugins: [],
};
