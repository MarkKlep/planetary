---
name: design-critique
description: Audits a running app's actual visual chrome (screenshots, not just code) against the generic "AI-app" defaults, then proposes and — using judgment about scope — implements a distinctive redesign direction grounded in what the product itself actually is. Use whenever the user asks to review, critique, evaluate, or "check" their app's design/UI/UX/look, asks a new skill (like frontend-design) to "check my app again," asks whether their design looks generic/templated/like every other AI product, or wants a second opinion on visual identity — even if they don't use the words "design" or "critique." Builds directly on the frontend-design skill's calibration and process; load frontend-design as part of running this one.
---

# Design Critique

A workflow for looking at what an app's chrome actually is right now — not what the
code says it's trying to be — and giving an honest, specific verdict grounded in the
product's own subject matter, then acting on it.

## Why this exists as its own skill

`frontend-design` is written for the moment of building or reshaping UI: it tells you
how to make good choices going forward. It does not tell you how to *look at an
existing app and see it clearly* — recognizing that a violet-blue gradient dashboard
is the same violet-blue gradient dashboard everyone else shipped, even though the code
comments call it "mission control." That seeing-clearly step is what this skill adds.
Always load `frontend-design` as part of running this one; its calibration (the three
clusters AI-generated design converges on) and its token-system format are what the
critique and the proposal are measured against.

## Step 1: Look at the real thing, not the code

Reading component files tells you what classes exist, not what a person actually sees.
Get the app running and take real screenshots — the default view, at least one
expanded/interactive state (a menu open, a hover, an active selection), and any
secondary surfaces (a HUD, a modal, a loading/splash screen, an empty state). A
critique based on one landing-page screenshot will miss the parts of the chrome that
are actually most templated, because defaults hide best in the corners nobody
screenshots for a portfolio.

If a `run` skill or an equivalent project-specific launch skill is available, use it to
start the app rather than reinventing that step. Otherwise start whatever dev server
the project uses and drive it with a browser automation tool.

## Step 2: Critique against calibration, grounded in the actual subject

Apply `frontend-design`'s calibration honestly: does this land in the cream+serif
cluster, the near-black+neon cluster, or the broadsheet cluster? Name the actual hex
values and font stack in use — vague "it feels generic" is not a critique, "this is
`#667eea → #764ba2`, the most reused tech-startup gradient of the last few years" is.

Then go one step further than a surface read: find what is genuinely distinctive about
*this specific product*, not its category. "A space app" is a category; "an app where
every visible position is a JPL-verified orbital calculation" is the actual subject.
The gap between those two is usually the entire critique — a generic shell wrapped
around something that had a real, ownable identity available and unused. Look at what
the product's own domain does that other things in its category don't: real data it
computes, a rigor or constraint it has that others don't, a vocabulary specific to its
field. That is where a signature element should come from, not from a trend list.

## Step 3: Propose a concrete plan, not vibes

Follow `frontend-design`'s own token-system format: 4–6 named color values with a
stated reason for each (not "amber because it's warm" — "amber because it's the color
of the one light source every computed position in the scene depends on"), a type
pairing with a rationale, a layout concept, and one named signature element. Self-
critique it the way that skill asks: would this exact proposal come out of a generic
prompt for a similar product? If yes, it hasn't found the specific thing yet — go back
to Step 2.

## Step 4: Decide whether to confirm before building

Use judgment, not a fixed rule. A full visual overhaul — new tokens, new type, new
layout language across every surface — is opinionated and hard to fully un-feel even
though git makes it trivial to revert; present the plan and wait for a go-ahead before
touching files. A narrowly-scoped request the user already authorized in how they
asked ("the button text is unreadable, fix it," "make the active state clearer") does
not need a second confirmation — that would just be friction for something already
decided. When genuinely unsure which side a request falls on, ask.

## Step 5: If building, survey before touching anything

A redesign applied to some files and not others is worse than the generic look it
replaced — it reads as broken rather than as a choice. Before editing:

- Find every file carrying hardcoded chrome colors/fonts/radii (`grep` for hex
  literals, `rgba(`, font-family declarations across the style files, not just the
  one component that prompted the request).
- Check for dead/unused chrome files (an orphaned duplicate loading screen, an old
  unused theme file) — restyling something nobody sees wastes the pass; deleting it
  is a separate decision the user didn't ask for, so just leave it alone and don't
  touch it either way.
- Identify anything intentionally out of scope — an embedded third-party app, a
  vendored sub-project — and stay out of its actual content, though light consistency
  touches on the host chrome around it are fine.

Centralize the new palette/type/radii into one real token source (CSS custom
properties, a theme file — whatever the project's existing convention is closest to)
rather than hand-writing the same hex values into a dozen files. Apply it to every
live surface identified above. After the pass, `grep` for the old palette's literal
values to confirm nothing was missed, and do one honest contrast check on whatever
became the quietest/dimmest text token — a distinctive palette that is also
borderline illegible is not a win.

## Step 6: Verify and report

Typecheck and build if the project has that tooling. Re-screenshot the same views
from Step 1 to confirm the result — side by side against the originals is the fastest
way to catch a token that didn't propagate somewhere. Report back concisely: what
changed, tied to the specific reasoning from Step 2/3 (not "made it look nicer"), and
name anything you deliberately left alone and why (dead code, out-of-scope embedded
content, a follow-up worth a separate decision).
