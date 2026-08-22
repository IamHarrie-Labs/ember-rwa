import type { Config } from "tailwindcss";

// Every colour is a CSS variable defined in app/globals.css, which is itself a transcription
// of the Ember design project. Nothing here is a literal.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        ink: "var(--ink)",
        body: "var(--body)",
        muted: "var(--muted)",
        line: "var(--line)",
        "line-soft": "var(--line-soft)",
        panel: "var(--panel)",
        wash: "var(--wash)",
        ember: "var(--ember)",
        "ember-deep": "var(--ember-deep)",
        dim: "var(--dim)",
        out: "var(--out)",
        danger: "var(--danger)",
        "ink-muted": "var(--ink-muted)",
        "ink-line": "var(--ink-line)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Helvetica", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: {
        shell: "1200px",
      },
      // One curve, used everywhere a hover or focus state transitions. Never the browser
      // default `ease` — see design-taste/references/design-judgment.md § Motion Restraint.
      transitionTimingFunction: {
        brand: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
