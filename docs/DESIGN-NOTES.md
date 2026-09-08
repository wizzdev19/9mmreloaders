# Design notes

Short reference for whoever touches the stylesheet next. The rules below are constraints the client set, not preferences, so please keep them.

## Hard rules

| Rule | Enforced by |
|---|---|
| No gradients of any kind | `npm run audit:claims` fails on `linear-gradient`, `radial-gradient`, `conic-gradient` |
| No purple | the same check fails on purple hex tokens and named purples |
| No pill shaped buttons | the same check fails on a `.btn` radius of 999px, 50 percent or similar. Buttons use a 3px radius |
| No emoji as icons | the same check fails on emoji codepoints anywhere in templates or CSS |
| No cursor animation, no scroll animation | there is no JavaScript that touches the cursor or scroll position. Transitions are disabled under `prefers-reduced-motion` |
| No inline `style` attributes | `npm run audit:seo` warns on any it finds, and the CSP has no `style-src 'unsafe-inline'` |
| No em dashes in copy | the claim checker fails on them |
| No fake counters, metrics or reviews | every number on the site is a `COUNT()` or a `MIN`/`MAX` from the database |

## Palette

Flat colour only. One accent carries the brand, the rest are used to separate sections and to colour code the catalogue tiles.

| Token | Value | Used for |
|---|---|---|
| `--ink` | `#14171a` | Body text, header, footer, the home page hero background |
| `--ink-2` | `#2b3138` | Secondary body text |
| `--muted` | `#5a636d` | Labels, captions, counts |
| `--bg` | `#f3f4f6` | Page background |
| `--paper` | `#ffffff` | Cards, panels, the white sections |
| `--line` | `#d5d9de` | Hairlines |
| `--accent` | `#8c2f14` | Rust. Primary buttons, the hero rule, section heading markers, step 1 |
| `--accent-light` | `#e2714b` | The same rust lightened, only for text on the dark hero |
| `--steel` | `#1f3a5f` | Second colour. Range tiles, FAQ markers, step 2, alternate section tint |
| `--brass` | `#7a5c0f` | Third colour. Parts tiles, step 3 |
| `--forest` | `#1f5c3d` | Fourth colour. Step 4, and the in stock state |
| `--teal`, `--clay` | `#14545c`, `#6d3218` | Two more caliber tile colours, so the seven calibers do not repeat |
| `--focus` | `#0b57d0` | Focus ring. On the dark hero it switches to `#8ab4f8` |

## Contrast

Every foreground and background pair introduced with the colour work was measured. Lowest result is 5.74:1, which clears WCAG AA for normal text with room to spare.

| Pair | Ratio |
|---|---|
| Hero eyebrow `#e2714b` on `#14171a` | 5.74 |
| Hero H1 white on `#14171a` | 17.99 |
| Hero lede `#ced5dc` on `#14171a` | 12.14 |
| Factbar label `#a8b1ba` on `#1c2127` | 7.45 |
| White on rust `#8c2f14` | 8.29 |
| White on steel `#1f3a5f` | 11.48 |
| White on brass `#7a5c0f` | 6.24 |
| White on forest `#1f5c3d` | 7.91 |
| Ink on the steel tint `#e9eef6` | 15.44 |
| Ink on the rust tint `#fbece6` | 15.63 |

If you add a colour, measure it before you commit it. Colour is never the only signal for anything on this site: the in stock state, form errors and the current breadcrumb all carry text as well as colour.

## Where the colour sits on the home page

1. **Hero** dark `--ink` band with a 4px rust rule under it, white heading, rust eyebrow, white product card floated on the dark.
2. **Fact bar** four dark cards inside the hero, each with a different coloured left edge: rust, pale steel, brass, green.
3. **Model tiles** neutral top border, rust on hover. They are the busiest grid on the page, so they stay quiet.
4. **Caliber tiles** on a steel tinted section, each with its own colour cycling through the six palette colours, and a matching tint on hover.
5. **Range and part tiles** steel for ranges, brass for parts, so the two groups read as different things.
6. **Recently added** white section, so the product photography sits on a clean field.
7. **How buying works** four steps, each numbered badge in a different palette colour, in order rust, steel, brass, green.
8. **FAQ** steel tinted section with alternating steel and rust markers.
9. **Closing notes** rust tinted for the eligibility warning, steel tinted for the plain one.

Section headings site wide carry a 4px rust bar to the left of the `h2`, which turns steel inside a steel tinted section.
