# TrackHire Approved Design References

This folder is the authoritative visual handoff for the TrackHire redesign.

## Existing Figma file and resume state

- Figma file: `https://www.figma.com/design/nyFC2u7V7yRwBMr6y9MDOc`
- Resume manifest: `design-system-state-trackhire-redesign-20260813.json`
- Already created: 4 collections, 97 scoped variables, and 6 text styles using Newsreader and Instrument Sans.
- Remaining: the rest of the styles if needed, reusable components, screen construction, and screenshot comparison.

Do not create another file or recreate completed foundations. Inspect the existing file and continue from the recorded state. Starter-plan constraints required separate Light and Dark color collections because only one mode per collection was available.

## Precedence

When references conflict, follow this order:

1. `01-landing-desktop-primary.png` is the primary desktop landing/hero composition and the pixel-matching target.
2. `02-header-borderless-precedence.png` overrides the header treatment shown in all other landing references. Use its borderless navigation and underlined text CTA direction.
3. `03-landing-full-page.png` supplies the remaining below-the-fold marketing sections.
4. Screen-specific references govern their corresponding product screens.

Do not average conflicting concepts or introduce a new visual direction. Preserve the warm editorial paper background, dark ink typography, brick-red accent, left binding treatment, restrained borders, and serif/sans hierarchy.

## Reference map

- `01-landing-desktop-primary.png` — approved desktop hero and dashboard-preview composition.
- `02-header-borderless-precedence.png` — revised borderless marketing header; takes precedence over older header concepts.
- `03-landing-full-page.png` — full landing-page sections, CTA, and footer.
- `04-landing-mobile.png` — mobile landing-page layout.
- `05-dashboard-light.png` — protected dashboard in the light theme.
- `06-dashboard-dark-primary.png` — Warm Editorial Night dashboard.
- `07-dashboard-mobile.png` — mobile dashboard, application cards, and navigation drawer.
- `08-authentication.png` — sign-in/sign-up screen.
- `09-new-application.png` — application-creation screen.
- `10-application-detail.png` — application-detail and generated-document workspace.
- `11-settings.png` — settings screen.

## Figma construction requirements

- Build native editable layers rather than placing these images as the final design.
- Use Auto Layout for structural relationships.
- Create reusable components for navigation, buttons, fields, application rows/cards, status labels, progress indicators, tabs, and shared surfaces.
- Create semantic color variables and text styles.
- Match the reference at 1536px desktop width first, then build the mobile and dark-theme frames from their references.
- Use only verifiable TrackHire capabilities; do not carry unsupported claims into final copy.
- After each major screen, capture a Figma screenshot and compare spacing, typography, alignment, scale, and color against its source image.
