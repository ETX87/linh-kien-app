/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // DESIGN_GUIDELINES.md §3 — 1 ho font duy nhat (display = sans, chi khac weight)
        display: ["Plus Jakarta Sans", "Be Vietnam Pro", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["Plus Jakarta Sans", "Be Vietnam Pro", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        primary: "var(--color-primary)",
        "primary-dark": "var(--color-primary-dark)",
        "primary-soft": "var(--color-primary-soft)",
        "primary-hover": "var(--color-primary-hover)",
        "brand-cyan": "var(--brand-cyan)",
        subtle: "var(--color-subtle)",
        link: "var(--color-link)",
        "ink-body": "var(--color-text-body)",
        "ink-faint": "var(--color-text-faint)",
        "line-soft": "var(--color-border-soft)",
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
      // DESIGN_GUIDELINES.md §5
      borderRadius: { kpi: "14px", card: "12px", field: "10px", btn: "8px", pill: "12px", badge: "10px" },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        raise: "var(--shadow-raise)",
        drawer: "var(--shadow-drawer)",
      },
    },
  },
  plugins: [],
};
