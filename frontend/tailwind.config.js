/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Manrope", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        primary: "var(--color-primary)",
        "primary-dark": "var(--color-primary-dark)",
        "primary-soft": "var(--color-primary-soft)",
        bg: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-soft": "var(--color-surface-soft)",
        ink: "var(--color-text)",
        "ink-soft": "var(--color-text-secondary)",
        line: "var(--color-border)",
        success: "var(--color-success)",
        info: "var(--color-info)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        purple: "var(--color-purple)",
        neutral: "var(--color-neutral)",
      },
      borderRadius: { card: "10px", btn: "8px" },
      boxShadow: {
        drawer: "0 8px 30px rgba(9,30,66,.12)",
        pop: "0 4px 16px rgba(9,30,66,.10)",
      },
    },
  },
  plugins: [],
};
