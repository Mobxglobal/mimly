# Git commits for today's work

Stage and push only the hero + nav changes from today. (Other modified files like `features-section`, `footer-section`, `pricing-section`, `dashboard/page` stay unstaged unless you add them.)

---

## Option A – Two commits (recommended)

**Commit 1 – Hero like count and styles**
```bash
git add components/marketing/hero-section.tsx app/globals.css
git commit -m "feat(hero): viral like count 24→300, per-platform end numbers, lighter heart

- JS-driven count-up from 24 to platform-specific end (287, 312, 264)
- Lighter heart icon (rose-400)
- Hero count and mobile menu styles in globals"
```

**Commit 2 – Mobile menu**
```bash
git add components/marketing/hero-nav.tsx
git commit -m "feat(nav): mobile menu transitions, pill CTAs, pastel background

- Open/close transition and overlay, Escape to close, body scroll lock
- Staggered link animation, pill-style links and CTAs
- Subtle pastel (amber-50) background for expanded menu"
```

**Push**
```bash
git push
```

---

## Option B – One commit

```bash
git add components/marketing/hero-section.tsx components/marketing/hero-nav.tsx app/globals.css
git commit -m "feat(hero,nav): viral like count and mobile menu improvements

Hero:
- Like count 24→300 on load, per-platform end numbers (287, 312, 264)
- Lighter heart icon (rose-400)

Nav:
- Mobile menu open/close transition, overlay, Escape, scroll lock
- Staggered link animation, pill CTAs, subtle pastel background"
git push
```

---

Use Option A for separate hero vs nav history; use Option B for a single push of today’s work.
