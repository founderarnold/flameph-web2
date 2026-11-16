# FLAME PH design system (member layer)

One design language for flameph.org. The member experience **reuses** the styles the public site already has and **extends** them. Nothing here restyles an existing public page.

- **Where it lives:** tokens and classes in `src/app/globals.css`; React components in `src/components/ui.tsx`.
- **Live reference:** `/admin/design-system` (staff only, not indexed).
- **Rule:** new member screens use only these tokens, classes and components. If something is missing, extend this system and this document. Do not write one-off colours or sizes.

## 1. Colour tokens

Defined as CSS variables on `:root`, with dark-mode values under `prefers-color-scheme: dark`. Tailwind utilities come from `@theme inline` (for example `bg-primary`, `text-muted`, `border-line`).

| Token | Utility | Use |
|---|---|---|
| `--bg`, `--bg-soft`, `--bg-warm` | `bg-bg`, `bg-bg-soft`, `bg-bg-warm` | Page, soft sections, hero band |
| `--card` | `bg-card` | Cards and inputs |
| `--fg`, `--fg-muted` | `text-fg`, `text-muted` | Text, secondary text |
| `--border` | `border-line` | Lines and card borders |
| `--primary`, `--primary-fg`, `--primary-soft` | `bg-primary`, `text-primary-fg`, `bg-primary-soft` | FLAME PH blue: main actions, active states |
| `--mph` | `text-mph` | Inline links |
| `--flame`, `--flame-strong`, `--flame-soft` | `text-flame`, `text-flame-strong`, `bg-flame-soft` | Brand accent. Use `flame-strong` for text and for anything that must pass contrast |
| `--gold` | `text-gold` | Decorative accent only, never for text on white |
| `--ok`, `--ok-soft` | `text-ok`, `bg-ok-soft` | Success |
| `--warn`, `--warn-soft` | `text-warn`, `bg-warn-soft` | Warning, "Coming soon" |
| **new** `--danger`, `--danger-soft` | `text-danger`, `bg-danger-soft` | Errors and destructive actions. Same values as the red already used in forms (red-700 / red-50 in light, red-300 / red-950 in dark) |
| **new** `--on-danger`, `--on-flame` | (used by classes) | Text on danger or flame fills, readable in both modes |
| `--focus` | (used by `:focus-visible`) | Keyboard focus ring |

## 2. Type scale

Body text is 16px with line height 1.6. Headings use the display font with line height 1.2. Form inputs are always 16px, so phones don't zoom in.

| Utility | Size | Use |
|---|---|---|
| `text-xs` | 12px | Badges, tiny labels |
| `text-sm` | 14px | Captions, help text, tabs |
| `text-base` | 16px | Body, inputs |
| `text-lg` | 18px | Intros, card titles |
| `text-xl` | 20px | Sub-headings |
| `text-2xl` | 24px | Section titles (`sm:text-3xl` on wider screens) |
| `text-3xl` / `sm:text-4xl` / `lg:text-5xl` | 30 / 36 / 48px | Page titles |

Weights: `font-semibold` for labels, `font-bold` for titles and buttons, `font-extrabold` for page and section titles.

## 3. Spacing, radius, elevation

- **Spacing:** Tailwind's 4px scale (`--spacing: 0.25rem`). The common steps are 1, 2, 3, 4, 5, 6, 8, 10 and 14.
- **Page gutter:** 16px on phones, 24px from 768px up (`.container-x`, max width 1200px).
- **Card padding:** `p-5` (20px). **Sections:** `py-10` on phones, `lg:py-14` on desktop.
- **Radius (new tokens for existing values):** `--radius-control` 10px for buttons and inputs, `--radius-card` 14px for cards, `--radius-pill` for chips and badges.
- **Elevation:** flat by default. The new `.card-raised` (`--shadow-raised`) is only for menus, sheets and pop-overs.
- **Bars (new tokens):** `--topbar-h` 56px and `--bottombar-h` 56px, for the member top bar and bottom bar in Phase 2.

## 4. Breakpoints

Phone first. Tailwind defaults:

- `sm` 640px
- `md` 768px
- `lg` 1024px: the desktop menu appears and the mobile bottom bar hides
- `xl` 1280px

Every member screen must work at 360px wide, with no sideways scrolling.

## 5. Buttons

Base `.btn` (existing): minimum height 44px, radius 10px, bold.

- **Variants:**
  - `.btn-primary` (existing): main action
  - `.btn-flame` (existing): brand call to action
  - `.btn-outline` (existing): secondary
  - `.btn-ghost` (existing): quiet
  - **new** `.btn-danger`: destructive
- **Sizes and layout (new):** `.btn-sm`, `.btn-lg`, `.btn-block` (full width, for confirmation screens such as "Back to feed"), `.btn-icon` (square, 44px).
- **States (new):**
  - `disabled` or `aria-disabled="true"` dims the button and blocks clicks.
  - `aria-busy="true"` with `.btn-spinner` shows loading.
  - These states apply only to buttons that also carry `.btn-ds` (added automatically by `<Button>` and `buttonClass()`). Existing public buttons, such as a form waiting for its security check, keep their current look.
- **Component:** `<Button variant size block loading href external>`. It renders a `<button>`, or a link when `href` is set. `buttonClass()` returns the class string for custom elements.

One primary action per screen. A confirmation screen uses a block primary button labelled **Back to feed**.

## 6. Cards

`.card` (existing) is the surface for everything. New modifiers:

- `.card-raised` adds a shadow.
- `.card-interactive` adds a hover border when the whole card is a link.

The existing `FeatureCard`, `EmptyState` and `Notice` components stay as they are. `Notice` gains a `danger` tone.

## 7. Form controls

- **Existing:**
  - `.input`: text, email, number, `select` and `textarea`. 44px tall, 16px text, focus ring.
  - `.label`: field label.
- **New states:**
  - `aria-invalid="true"` gives a red border and red focus ring.
  - `:disabled` gives a muted background.
  - Both apply only to inputs inside `.field` (the `<Field>` component), so existing public forms keep their current look.
- **New text:** `.field-help` for help text, and `.field-error` for error text (red, announced with `role="alert"`).
- **Component:** `<Field id label help error required>` wraps one control. It links the label, help and error to the control (`htmlFor`, `aria-describedby`, `aria-invalid`), so screen readers read them together.
- **Checkbox (new):** `.check` makes it 20px with the brand colour. Always put the checkbox and its text inside one `<label>`.
- **Switch (new):** `<Switch name label description>`. It is a native checkbox with `role="switch"`, so it works with the keyboard and in forms. It is **off unless `defaultChecked`** is set, as the consent rules require: each consent is a separate switch, never bundled. In a client form, pass `checked` and `onChange` to control it (the Join form does this).

## 8. Status pieces

- `StatusBadge` (existing): Live, Beta, Coming soon.
- **new** `<CountBadge count label>`: unread counts, such as Messages. Hidden at 0, shows 99+ above 99, always has a spoken label.
- **new** `<UnseenDot label>`: the "new posts" dot on Home. It has a hidden text label, so colour is not the only signal.
- **new** `<Chip>`: filters and tags. A pressed or current chip uses the blue tint.
- **new** `<Avatar name src>`: member photo (class `.ds-avatar`), or initials when there is none (reuses `Initials`).
- **new** `<Skeleton>`: loading placeholder (reuses `.skeleton`). Reduced-motion users get a still block.

## 9. Accessibility baseline (every member screen)

1. **Keyboard:** every action is reachable with Tab and works with Enter or Space. Nothing works by hover only.
2. **Visible focus:** the global `:focus-visible` ring (3px, `--focus`). Never remove outlines.
3. **Contrast:** text at least 4.5:1, large text and UI parts at least 3:1, in light **and** dark mode. Checked by `tests/design-system.test.mjs`.
4. **Labels:** every input has a `<label>` (use `Field`). Icon-only buttons have `aria-label`. Counts and dots have spoken text.
5. **Not colour alone:** errors have text, states have words or icons, and the unseen dot has a label.
6. **Tap targets:** at least 44 × 44px (`--tap-min`).
7. **Motion:** everything respects `prefers-reduced-motion` (existing global rule).
8. **Language:** `lang` is set on `<html>` (en-PH / fil). Write plain English or Taglish.
9. **Structure:** one `<h1>` per page, headings in order, landmarks (`header`, `nav`, `main`), and `aria-current="page"` on the active tab.

## 10. Known existing issue (not changed in Phase 1)

In dark mode, the existing `.btn-flame` puts white text on the light flame colour (`--flame-strong` #ffa070), which is low contrast. It is a public-site style, so Phase 1 leaves it unchanged. New member screens should use `.btn-primary` for main actions in dark mode, or the owner can approve a fix.
