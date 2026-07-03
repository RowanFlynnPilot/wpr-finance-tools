# wpr-finance-tools

Sponsor-funded financial calculators for Wausau Pilot & Review, seeded with real
Marathon County data from WPR's own pipelines. Calculator 1 is **The True Cost of
Buying in Marathon County**. Calculator 2 is **Rent or Buy in Marathon County?**
— same bundle, mounted via `?tool=rentvsbuy`.

Live: https://rowanflynnpilot.github.io/wpr-finance-tools/
Embedded in WordPress via iframe, same as every other WPR widget.

## Architecture

```
src/local-constants.json     ← THE data contract. Single source of all local numbers.
src/TrueCostCalculator.jsx   ← Calculator 1. Imports constants at BUILD time.
src/RentVsBuyCalculator.jsx  ← Calculator 2. Same contract, same validation rules.
src/truecost.css             ← All styling. WPR design system.
src/main.jsx                 ← Mounts one calculator by ?tool= param. Nothing else.
```

There is **no scraper, no cron, no runtime fetch, no backend**. This repo is
deliberately the simplest widget in the WPR fleet: static React, constants baked
in at build, GitHub Actions deploy-only workflow on push to `main`. Updating a
number = edit `local-constants.json`, commit, push. The deploy is the update
mechanism. Do not add a fetch layer, a loading state, or an API.

## The constants contract (rules, not suggestions)

1. `src/local-constants.json` is the ONLY place local numbers live. No literals
   in components. If a calculator needs a new number, it gets a new key in the
   contract with `source`, `as_of`, and `verified` fields.
2. Every consuming component MUST validate the keys it uses at module load and
   `throw` on any missing/invalid key. A blank iframe we notice beats a wrong
   mortgage number a reader trusts. Do not soften these throws into defaults.
3. `verified: false` means a human (Rowan or Shereen) has not signed off on the
   value. Nothing launches to production with unverified financial constants —
   flag them, don't fix them silently.
4. Adding a municipality = adding a verified entry to
   `property_tax.municipalities`, checked against the Marathon County
   Treasurer's December mill-rate publication. An unlisted municipality is a
   missing feature, not a reason to guess or interpolate.
5. `market.median_sale_price` comes from the wpr-property-transactions ledger.
   Quarterly cadence. The value in the repo is a SEED until replaced.
6. `loan_defaults.*` are UI starting values only — users adjust them, so weekly
   mortgage-rate movement never requires a deploy.

## Engineering rules (house style — same as all WPR repos)

- One correct path, no fallbacks. Fail fast and loud.
- Surgical, single-responsibility changes. No overengineering.
- Fix root causes, not symptoms. Evidence-based debugging before writing code.
- Windows / PowerShell 5.1: chain with `;` not `&&`. Use `python -m pip` (n/a
  here — this repo is Node-only, but the convention stands for tooling docs).
- No localStorage/sessionStorage anywhere — this runs in an iframe on WordPress.

## Design system

WPR brand, non-negotiable: cream `#f6f2e9` background, ink `#1a1a1a`, teal
`#3A867C` primary / `#4aaba7` secondary. Fraunces for display, Public Sans for
body, JetBrains Mono for every number and data label. The signature element is
the itemized monthly "ledger" with dotted leaders and the stacked PITI bar —
protect it. Widget max-width 760px; must hold together at 380px (mobile iframe).
`prefers-reduced-motion` is respected; keep it that way.

## Sponsor slot

The dashed "Homebuyer tools presented by" box is a deliberate placeholder — the
sales pitch is literally "here's where your name goes." When a sponsor signs:
replace placeholder text with sponsor name + logo, wire the "Talk to a local
lender →" tag to their URL (single `sponsor` block in the constants contract:
`name`, `url`, `logo`). Keep the disclosure tag ("presented by") — that's an
editorial-integrity requirement, not decoration.

## Compliance footer

The estimates disclaimer in `.tcc-foot` is load-bearing: "not a loan offer or
financial advice." Do not remove or bury it. If a sponsor asks for it to be
smaller, the answer is no.

## Roadmap

1. **Now:** Human review (Rowan or Shereen) of all constants — every value is
   sourced (ledger / DOR / NAIC / HUD) but `verified` flags are still false.
   Flip flags, launch.
2. ~~Calculator 2 — rent-vs-buy~~ **Built (2026-07):** `?tool=rentvsbuy`, `rent`
   block in the contract (HUD FY2026 FMR + two user-adjustable assumption
   defaults). Model: level home price, owner-occupancy, renter invests the
   would-be down payment; maintenance/utilities/selling costs not modeled
   (stated in the footer).
3. **Sponsor block** in constants once signed (see above) — wiring done
   (2026-07); go-live is a one-commit constants edit.

## Deploy

Push to `main` → `.github/workflows/deploy.yml` builds with Vite and publishes
to GitHub Pages. `vite.config.js` sets `base: '/wpr-finance-tools/'` — if the
repo is ever renamed, that base must change with it or all assets 404.

Pages was created once via `gh api repos/RowanFlynnPilot/wpr-finance-tools/pages -X POST -f build_type=workflow`.
Do NOT add `enablement: true` to configure-pages — the workflow token lacks
admin scope to create the site, and it doesn't need to; the site exists.

WordPress embed:
```html
<iframe src="https://rowanflynnpilot.github.io/wpr-finance-tools/"
        style="width:100%;border:none;min-height:980px" loading="lazy"
        title="The true cost of buying in Marathon County"></iframe>

<iframe src="https://rowanflynnpilot.github.io/wpr-finance-tools/?tool=rentvsbuy"
        style="width:100%;border:none;min-height:1080px" loading="lazy"
        title="Rent or buy in Marathon County?"></iframe>
```
