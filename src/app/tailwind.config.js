/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
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
