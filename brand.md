# Brand — Ember

_Status: active. Source of truth is the Claude Design project `Ember Interactive Site Build`
(`Ember.dc.html`), imported 2026-08-16. This file records that design; it does not invent it._

## The idea

An ember dies unless it is fed. The interface's job is to make decay legible and every claim
checkable. Nothing here is decoration — the countdown, the colour, and the bar are the state
machine rendered.

## Palette

Light, editorial, high-contrast. Paper rather than terminal. The ember is the only saturated
colour in the system and it is reserved for liveness.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FAFAF8` | Page ground |
| `--ink` | `#0B0B0A` | Headings, primary text, inverted section grounds |
| `--body` | `#3A3A36` | Body copy |
| `--muted` | `#6E6E68` | Labels, captions, mono metadata |
| `--line` | `#DEDED8` | Structural hairlines, grid gaps |
| `--line-soft` | `#EDEDE7` | Row dividers, track backgrounds |
| `--panel` | `#FFFFFF` | Cards on paper |
| `--wash` | `#F3F3EE` | Alternating section ground |
| `--ember` | `oklch(0.63 0.17 42)` | Live. The only saturated colour |
| `--ember-deep` | `oklch(0.60 0.17 42)` | Hover, links |
| `--dim` | `#B9B9B0` | Dimming indicator fill |
| `--out` | `#9A9A92` | Out / stale |

On inverted sections: ground `--ink`, text `--paper`, muted `#A8A8A0`, hairline `#2A2A26`.

**State colours are load-bearing.** If something is ember on this site, an asset is live. There
is no decorative ember. A dimming asset renders in ink with a grey dot rather than a second hue,
so the palette never has to invent a "warning colour".

## Typography

**Archivo** for UI and headings — tight tracking, heavy display weights at large sizes.
**JetBrains Mono** for every number, hash, address, countdown, contract name, and label.

Anything a reader might verify against the chain is mono. That is the rule: mono means checkable.

Headlines run `-0.03em` tracking at 34–68px, weight 700. Eyebrow labels are 11px mono, uppercase,
`0.14em` tracking, muted. Numbers are `font-variant-numeric: tabular-nums` without exception, so
a ticking countdown never reflows.

## Layout

1200px max width, 32px gutters. Sections separated by full-bleed hairlines rather than whitespace
alone. Grids use a 1px gap over a `--line` ground so cells read as a table, not as floating cards.

## Motion

One keyframe: `emberPulse`, a 2s opacity breath on live indicators. Nothing else animates.
Under `prefers-reduced-motion` it stops and colour plus the numeric countdown carry the state.

## Voice

Plain, technical, unhedged. Verifiable or omitted.

- "There is no admin key on this contract." Then the address, so the reader can check.
- "Measured, not asserted." Then the script that produced the number.
- "The limits are on the page, not in a footnote."

Never state a security property the contract does not enforce, and never show a number that was
not measured. An unmeasured metric renders as `—`, not as a plausible placeholder.
