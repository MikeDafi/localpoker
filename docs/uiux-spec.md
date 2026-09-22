# UI/UX Design Specification — Wii-Style Mobile Poker

**Stack:** React Native + Expo (SDK 57) · react-native-svg · react-native-reanimated · moti · expo-haptics · @expo-google-fonts
**Design target:** September 2026 modern-mobile craft × Nintendo **Wii Menu / Mii** visual identity.
**Principle:** Bright, friendly, tactile, glossy — never flat "AI slop." Every value below is codeable.

---

## 1. Modern Mobile UI/UX Principles (late 2026)

What reads as *current & premium* in 2026:

- **Spatial depth via soft, layered shadows** — not one hard drop shadow. Stack a tight contact shadow + a wide ambient shadow. Ambient shadows are tinted with the surface's own hue (e.g. blue-tinted shadow under a blue tile), never pure `#000`.
- **Tactile / physical feel** — surfaces look pressable: subtle top gloss, 1px inner highlight, and a press-state that *insets* (scale `0.96`, shadow shrinks, brightness `−4%`). Motion mimics real mass.
- **Spring-based motion, not linear timing** — everything settles with a spring. Durations are *emergent*, not fixed. Use `withSpring`, reserve `withTiming` for opacity/color only.
- **Generous spacing & strong typographic hierarchy** — 8pt spacing grid, big display sizes (28–40pt) paired with calm body (16pt). White space is a feature, not wasted room.
- **Accessible contrast & tap targets** — body text ≥ 4.5:1, large text ≥ 3:1. Minimum interactive target **44×44pt** (56pt for primary actions). Never rely on color alone (win/fold also use icon + label).
- **Reduced-motion support** — honor `AccessibilityInfo.isReduceMotionEnabled()`; swap springs for 120ms fades and disable parallax/confetti.
- **Dark mode as a real design, not an inversion** — Wii is a light-first identity, so dark mode is a *dim* variant (deep slate `#12171F` bg, tiles stay glossy but desaturated). Ship both, driven by the theme object.
- **Micro-interactions** — button "squish," chip count roll-up counters, tile hover-lift on focus, card flip on reveal, toast slide + settle.
- **Haptics** — pair key state changes with `expo-haptics`. Physicality sells the Wii feel.

### Anti-patterns to AVOID (the "AI slop" tells)

- ❌ Flat purple→blue diagonal gradients on everything.
- ❌ Centered giant emoji as a substitute for real iconography/illustration.
- ❌ Generic bootstrap/Material cards with 8px radius and `#00000029` shadow.
- ❌ Low-contrast gray-on-gray text (`#999` on `#EEE`).
- ❌ Over-rounded "pill everything" — pills only for buttons/tags, not containers.
- ❌ Meaningless glassmorphism (blur with no depth logic).
- ❌ Uniform 100% saturation neon; no gloss; no hierarchy; equal-weight everything.
- ❌ Symmetric dead-centered layouts with no focal point.

---

## 2. Wii Visual Design Language

Deconstructing the Wii Menu / Channels:

- **Bright, near-white canvas** with a faint cool gradient (top slightly brighter than bottom).
- **Glossy rounded-square channel tiles** (~`22px` radius) with a **thin gray border**, a **top gloss highlight** (upper half lighter), and a **soft ambient shadow**.
- **Signature light-blue accent** — the Wii blue used on the round bottom button, selection glows, and links.
- **Bottom bar** with the round blue **"Wii" button** flanked by smaller round pills (mail/settings analog).
- **Soft ambient shadows** everywhere; nothing has a harsh edge.
- Overall tone: **clean, friendly, confident** — lots of white, restrained color, playful gloss.

### Exact Palette

| Token | Hex | Use |
|---|---|---|
| Wii White | `#F7FAFC` | primary canvas |
| Off-White | `#EDF1F5` | recessed panels, tile base bottom |
| Pure White | `#FFFFFF` | gloss highlight, card faces |
| Channel Blue Light | `#7FD4F5` | gloss top of blue tiles, hover glow |
| Channel Blue Mid | `#22A7E0` | primary accent, links |
| Channel Blue Deep | `#0E7CB8` | pressed state, deep gradient stop |
| Wii Button Blue | `#1CA0DB` | round Wii button fill |
| Border Gray | `#D3DCE4` | tile & panel borders (1px) |
| Text Gray Dark | `#3A4650` | primary text |
| Text Gray Mid | `#6B7A88` | secondary text |
| Text Gray Light | `#9AA8B4` | captions, disabled |
| Felt Green | `#2E8B57` | poker table felt |
| Felt Green Deep | `#1F6B41` | felt vignette edge |
| Warning Red | `#E5533C` | fold, destructive, error |
| Success Gold | `#F2B705` | wins, chips, highlights |
| Chip Green | `#3AA76D` · Chip Red `#D64541` · Chip Blue `#2E6FBF` · Chip Black `#2B2F36` | denominations |

### Tile Styling Recipe (the core Wii look)

```
border-radius:      22px
border:             1px solid #D3DCE4
background:         linear-gradient(180deg, #FFFFFF 0%, #F2F6FA 55%, #E7EDF3 100%)
inner gloss overlay: linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 48%)
                     applied to top ~50% only, radius-matched
drop shadow (ambient): 0px 8px 18px rgba(34,167,224,0.14)   // blue-tinted
drop shadow (contact): 0px 2px 4px  rgba(58,70,80,0.10)
inner highlight:    inset 0 1px 0 rgba(255,255,255,0.9)
```

For a **colored (blue) channel tile**, swap the base gradient to `#7FD4F5 → #22A7E0 → #0E7CB8` and keep the white gloss overlay on the top half.

---

## 3. Mii Character Design Language

Mii avatars: **simple round head**, **pastel skin**, **big simple eyes**, **minimal mouth/brows**, sitting on a **flat pastel circle** background, all **clean vector**. No shading gradients on the face — flat fills with crisp edges.

### Procedural Mii SVG component (`react-native-svg`)

Compose these layers inside an `<Svg viewBox="0 0 100 100">`:

1. **Background circle** — `<Circle cx=50 cy=50 r=50 fill={bg} />` (pastel).
2. **Head** — rounded shape. Offer 3 head shapes:
   - `round`: `<Circle cx=50 cy=52 r=30 />`
   - `oval`: ellipse `rx=27 ry=32`
   - `square-round`: `<Rect x=22 y=24 width=56 height=58 rx=24 />`
3. **Ears** — two small circles `r=5` at `x≈20/80, y≈54`, skin fill.
4. **Hair** — a top cap path over the head (a filled arc); vary with 4 style paths (short, swoop, bun, bald=none).
5. **Brows** — two short rounded rects, `width=10 height=3 rx=1.5`, at `y≈44`.
6. **Eyes** — pick a style:
   - `dot`: `<Circle r=4 />`
   - `oval`: ellipse `rx=3.5 ry=5`
   - `happy`: an upward arc `<Path d="M.. Q.." stroke fill=none />`
   Positioned at `x≈38/62, y≈52`.
7. **Mouth** — pick: `smile` (quadratic arc), `neutral` (rounded rect), `open` (small filled ellipse), at `y≈66`.

Keep strokes at `strokeWidth ≈ 2`, `strokeLinecap="round"`. Face features use `#2B2F36`; brows/hair use the hair color.

### Skin tones (6–8)

`#FCE0C8` · `#F8CFA9` · `#EEB58C` · `#D99A6C` · `#C07E4E` · `#9C6237` · `#7A4A28` · `#5C3620`

### Hair colors (6–8)

`#2B2320` · `#4A342A` · `#6E4B2A` · `#A9713B` · `#C9A24B` · `#B8000` (auburn `#8B3A2F`) · `#8A8F96` (gray) · `#E8E4DD` (white)

### Pastel background circles (6–8)

`#BFE9FF` · `#C9F2D8` · `#FFE2B8` · `#FFD1DC` · `#E4D5FF` · `#D6F0F5` · `#FCEAB8` · `#FFC9B5`

### Deterministic derivation from a seed

Hash the user id/seed (FNV-1a or a small `xmur3`/`mulberry32`), then index each feature by a slice of the hash:

```
const h = xmur3(userId)();
const pick = (arr, salt) => arr[(h ^ salt) >>> 0 % arr.length];
skin  = pick(SKIN, 0x1);   bg   = pick(PASTEL, 0x2);
hair  = pick(HAIR, 0x3);   head = pick(HEADS, 0x4);
eyes  = EYE_STYLES[(h >>> 5) % EYE_STYLES.length];
mouth = MOUTH_STYLES[(h >>> 9) % MOUTH_STYLES.length];
```

Same id ⇒ same Mii forever (stable avatars across sessions/devices).

---

## 4. Typography

**Primary:** **Fredoka** (`@expo-google-fonts/fredoka`) — rounded, friendly, humanist; the closest free match to the soft Wii feel. Weights: `Fredoka_400Regular`, `Fredoka_500Medium`, `Fredoka_600SemiBold`, `Fredoka_700Bold`.
**Alt if a softer/wider look is wanted:** Baloo 2 or Quicksand. Body-heavy screens can use **Nunito** for longer text comfort.
**Numeric / chip counts:** **Nunito** tabular or **Space Grotesk / JetBrains Mono** (`@expo-google-fonts/jetbrains-mono`) for aligned digits in stacks and pots. Enable `fontVariant: ['tabular-nums']`.

### Type scale (8pt-ish rhythm)

| Role | Size | Weight | Line-height | Notes |
|---|---|---|---|---|
| Display | 34 | 700 | 40 | lobby title, showdown "WINNER" |
| Title | 26 | 700 | 32 | screen titles |
| Heading | 20 | 600 | 26 | section headers, tile labels |
| Body-Lg | 17 | 500 | 24 | primary body |
| Body | 15 | 400 | 22 | default text |
| Caption | 13 | 500 | 18 | metadata, hints |
| Micro | 11 | 600 | 14 | badges, letter-spacing 0.4 |
| Numeric-Lg | 28 | 700 | 32 | pot / stack (tabular) |
| Numeric | 16 | 600 | 20 | chip counts (tabular) |

Letter-spacing: `−0.2` on Display/Title, `0` on body, `+0.4` on Micro/badges.

---

## 5. Motion & Haptics

Use **reanimated** for gesture-driven/shared-value work and **moti** for declarative enter/exit.

### Spring configs (the bouncy Wii feel)

```ts
export const springs = {
  bouncy:  { stiffness: 260, damping: 14, mass: 1 },   // tiles pop in, buttons
  snappy:  { stiffness: 380, damping: 26, mass: 1 },   // panels, sheets
  gentle:  { stiffness: 140, damping: 20, mass: 1 },   // large surfaces
  chip:    { stiffness: 220, damping: 18, mass: 0.8 }, // chip fly to pot
};
```

### Transitions

- **Channel tiles (lobby):** staggered entrance — each tile `from {opacity:0, scale:0.8, translateY:12}` → `animate {opacity:1, scale:1, translateY:0}` with `springs.bouncy`, `delay = index * 45ms`. On press: `scale 0.96` + shadow shrink; on release: overshoot back via `springs.bouncy`.
- **Cards (panels/sheets):** slide-up + `springs.snappy`; exit fade+drop 120ms.
- **PlayingCard reveal:** rotateY flip 0→180°, swap face at 90°, `springs.gentle`.
- **Chip fly / pot:** animate chip `translate` along a slight arc to pot, `springs.chip`, then pot counter rolls up (animated number).
- **Winner/showdown:** highlight ring pulse (scale 1→1.06 loop) + confetti (skip on reduced motion).

### Haptics (`expo-haptics`)

| Event | API |
|---|---|
| Button press | `impactAsync(Light)` |
| Tile select / navigate | `selectionAsync()` |
| Bet / raise confirm | `impactAsync(Medium)` |
| Win / pot awarded | `notificationAsync(Success)` |
| Fold / destructive | `notificationAsync(Warning)` |
| Invalid action | `notificationAsync(Error)` |

### Reduced-motion fallback

If `isReduceMotionEnabled`: replace springs with `withTiming(…, {duration: 120})` opacity-only transitions, disable stagger (delay 0), disable confetti/parallax/looping pulses, keep haptics.

---

## 6. Screen-by-Screen Visual Direction

### (a) Home / Lobby — Wii-channel grid
2-column grid of glossy `WiiChannelTile`s on Wii-white canvas with faint cool gradient. Each channel = a game mode / action (Play, Create Room, Join, Stats, Profile, Store). Tiles have icon/illustration in the top ~65% and a label strip below. Staggered bouncy entrance. **Bottom bar** pinned: round **Wii button** (blue, center) opens quick-menu; small round pills left/right (settings, notifications). Subtle horizontal "shelf" line behind tiles for that channel-shelf feel.

### (b) Poker Table — Wii Sports felt, Wii chrome
Center **felt green** oval table (`#2E8B57` with `#1F6B41` vignette edge, faint radial light center). Seats around the arc, each a `WiiPanel` pod with a **MiiAvatar**, name, stack (tabular numerals), and a dealer button chip. Community cards centered on a subtle white rounded tray. Pot shown above cards in a gold pill. Action buttons (Fold/Check/Call/Raise) as glossy Wii pill buttons docked bottom; raise uses a slider in a Wii panel. Top-left round back button (Wii pill).

### (c) Create / Join Room
White canvas, one centered `WiiPanel` card. Create: segmented Wii toggles (blind level, max players, speed), each a rounded-square selectable tile that glows blue when active. Big glossy **primary Wii button** "Create Room" at bottom. Join: large room-code input in a recessed off-white field + numeric keypad styled as mini Wii tiles, or a scrollable list of room cards.

### (d) Stats Dashboard
Scrollable set of `WiiPanel` cards: hero card (win rate, big Numeric-Lg + small sparkline in Channel Blue), grid of stat tiles (hands played, biggest pot, VPIP), and a bar/line chart with rounded bars in Channel Blue/Gold. Keep whitespace generous; no dense tables.

### (e) Profile with Mii
Large **MiiAvatar** on a pastel circle, centered, with a gentle idle bob animation. Below: display name (Title), edit-Mii button (Wii pill), and stat chips. Mii editor (optional): horizontal pickers for head/hair/eyes/mouth/skin/bg, each swatch a mini glossy tile; live avatar updates with spring.

### (f) Showdown
Dim the felt slightly, spotlight the winning seat with a pulsing gold ring, flip revealed hole cards (rotateY), fly the pot chips to the winner with `springs.chip`, roll up their stack counter, `notificationAsync(Success)` + confetti. "WINNER" in Display weight with gold. Tap-to-continue Wii pill.

---

## 7. Component Recipes (TS/JSX-ready)

### WiiChannelTile

```ts
export const wiiChannelTile = {
  width: '100%', aspectRatio: 1.15, borderRadius: 22,
  borderWidth: 1, borderColor: '#D3DCE4',
  backgroundColor: '#FFFFFF',            // wrap in LinearGradient below
  overflow: 'hidden',
  // shadow (iOS)
  shadowColor: '#22A7E0', shadowOpacity: 0.14,
  shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  elevation: 6,                          // Android
};
// Gradient stops: ['#FFFFFF', '#F2F6FA', '#E7EDF3'] @ [0, 0.55, 1], vertical.
// Gloss overlay: absolute top-half LinearGradient
//   ['rgba(255,255,255,0.9)','rgba(255,255,255,0)'] height '50%'.
// Label strip: absolute bottom, height 34, bg 'rgba(255,255,255,0.85)',
//   borderTopWidth 1, borderTopColor '#E1E7ED', Heading text #3A4650 centered.
```

### WiiButton — glossy round + pill

```ts
export const wiiButtonRound = {
  width: 76, height: 76, borderRadius: 38,
  borderWidth: 1, borderColor: '#0E7CB8',
  backgroundColor: '#1CA0DB',            // gradient ['#7FD4F5','#22A7E0','#0E7CB8']
  alignItems: 'center', justifyContent: 'center',
  shadowColor: '#0E7CB8', shadowOpacity: 0.35,
  shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
};
export const wiiButtonPill = {
  minHeight: 52, paddingHorizontal: 24, borderRadius: 26,
  borderWidth: 1, borderColor: '#0E7CB8',
  backgroundColor: '#22A7E0',            // gradient ['#7FD4F5','#22A7E0']
  alignItems: 'center', justifyContent: 'center',
  shadowColor: '#22A7E0', shadowOpacity: 0.30,
  shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
};
// Gloss: top-half white overlay rgba(255,255,255,0.85)->0.
// Press: scale 0.96, shadowRadius/2, overlay opacity -0.2, springs.bouncy.
// Variants: danger bg '#E5533C'/border '#B23A28'; gold bg '#F2B705'/border '#C79300';
//           neutral bg '#FFFFFF'/border '#D3DCE4' text '#3A4650'.
```

### WiiPanel / Card

```ts
export const wiiPanel = {
  borderRadius: 20, borderWidth: 1, borderColor: '#D3DCE4',
  backgroundColor: '#FFFFFF', padding: 16,
  shadowColor: '#3A4650', shadowOpacity: 0.10,
  shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4,
};
// Optional top gloss overlay height 40%, rgba(255,255,255,0.6)->0.
```

### PlayingCard

```ts
export const playingCard = {
  width: 64, height: 90, borderRadius: 10,
  borderWidth: 1, borderColor: '#E1E7ED',
  backgroundColor: '#FFFFFF', padding: 6,
  shadowColor: '#3A4650', shadowOpacity: 0.18,
  shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
};
// Rank top-left / bottom-right (rotated), suit glyph center.
// Red suits '#D64541', black suits '#2B2F36'. Back: blue Wii gradient + logo.
```

### ChipStack

```ts
export const chip = {
  width: 34, height: 34, borderRadius: 17,
  borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', // dashed edge feel
  shadowColor: '#000', shadowOpacity: 0.20,
  shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3,
};
// Denomination fills: white#F2F4F7, red#D64541, green#3AA76D, blue#2E6FBF, black#2B2F36.
// Stack: render N chips with translateY: -index*4 for a leaning tower;
//   count label in Numeric (tabular) below. Animate additions with springs.chip.
```

### MiiAvatar wrapper

```ts
export const miiAvatar = {
  width: 72, height: 72, borderRadius: 36,
  borderWidth: 2, borderColor: '#FFFFFF',
  backgroundColor: '#EDF1F5',            // fallback; SVG paints pastel circle
  overflow: 'hidden',
  shadowColor: '#3A4650', shadowOpacity: 0.15,
  shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
};
// Renders <Mii seed={userId} size={72}/> (SVG from §3). Idle bob: translateY
// 0->-2 loop gentle spring on profile/hero only.
```

---

## 8. Color Tokens & Theme Object (`theme.ts`)

```ts
export const theme = {
  colors: {
    canvas:        '#F7FAFC',
    surface:       '#FFFFFF',
    surfaceAlt:    '#EDF1F5',
    glossHi:       'rgba(255,255,255,0.9)',
    border:        '#D3DCE4',
    borderSoft:    '#E1E7ED',

    blueLight:     '#7FD4F5',
    blue:          '#22A7E0',
    blueDeep:      '#0E7CB8',
    wiiButton:     '#1CA0DB',

    textPrimary:   '#3A4650',
    textSecondary: '#6B7A88',
    textMuted:     '#9AA8B4',
    onAccent:      '#FFFFFF',

    felt:          '#2E8B57',
    feltDeep:      '#1F6B41',

    danger:        '#E5533C',
    dangerDeep:    '#B23A28',
    gold:          '#F2B705',
    goldDeep:      '#C79300',
    success:       '#3AA76D',

    chip: { white: '#F2F4F7', red: '#D64541', green: '#3AA76D',
            blue: '#2E6FBF', black: '#2B2F36' },

    // Dark variant (dim, not inverted)
    dark: {
      canvas: '#12171F', surface: '#1B222C', surfaceAlt: '#232C38',
      border: '#2E3947', textPrimary: '#E6ECF2', textSecondary: '#9FB0BE',
    },
  },

  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },

  radii: { xs: 6, sm: 10, md: 14, lg: 20, tile: 22, pill: 26, round: 999 },

  shadows: {
    ambientBlue: { shadowColor: '#22A7E0', shadowOpacity: 0.14,
      shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    contact:     { shadowColor: '#3A4650', shadowOpacity: 0.10,
      shadowRadius: 4,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    panel:       { shadowColor: '#3A4650', shadowOpacity: 0.10,
      shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    button:      { shadowColor: '#0E7CB8', shadowOpacity: 0.32,
      shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  },

  gradients: {
    tileNeutral: { colors: ['#FFFFFF', '#F2F6FA', '#E7EDF3'], locations: [0, 0.55, 1] },
    tileBlue:    { colors: ['#7FD4F5', '#22A7E0', '#0E7CB8'], locations: [0, 0.5, 1] },
    gloss:       { colors: ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'], locations: [0, 1] },
    canvas:      { colors: ['#FBFDFF', '#F0F5F9'], locations: [0, 1] },
    felt:        { colors: ['#3A9E67', '#2E8B57', '#1F6B41'], locations: [0, 0.55, 1] },
  },

  typography: {
    fontFamily: {
      regular: 'Fredoka_400Regular', medium: 'Fredoka_500Medium',
      semibold: 'Fredoka_600SemiBold', bold: 'Fredoka_700Bold',
      numeric: 'JetBrainsMono_600SemiBold',
    },
    scale: {
      display:  { fontSize: 34, lineHeight: 40, letterSpacing: -0.2 },
      title:    { fontSize: 26, lineHeight: 32, letterSpacing: -0.2 },
      heading:  { fontSize: 20, lineHeight: 26 },
      bodyLg:   { fontSize: 17, lineHeight: 24 },
      body:     { fontSize: 15, lineHeight: 22 },
      caption:  { fontSize: 13, lineHeight: 18 },
      micro:    { fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
      numericLg:{ fontSize: 28, lineHeight: 32 },
      numeric:  { fontSize: 16, lineHeight: 20 },
    },
  },

  springs: {
    bouncy: { stiffness: 260, damping: 14, mass: 1 },
    snappy: { stiffness: 380, damping: 26, mass: 1 },
    gentle: { stiffness: 140, damping: 20, mass: 1 },
    chip:   { stiffness: 220, damping: 18, mass: 0.8 },
  },

  miiPalette: {
    skin:  ['#FCE0C8','#F8CFA9','#EEB58C','#D99A6C','#C07E4E','#9C6237','#7A4A28','#5C3620'],
    hair:  ['#2B2320','#4A342A','#6E4B2A','#A9713B','#C9A24B','#8B3A2F','#8A8F96','#E8E4DD'],
    bg:    ['#BFE9FF','#C9F2D8','#FFE2B8','#FFD1DC','#E4D5FF','#D6F0F5','#FCEAB8','#FFC9B5'],
    feature: '#2B2F36',
  },

  tap: { minTarget: 44, primaryTarget: 56 },
} as const;

export type Theme = typeof theme;
```

**Usage note:** wrap glossy surfaces in `expo-linear-gradient` using `theme.gradients.*`, layer the `gloss` gradient on the top half, and apply `theme.shadows.*`. Drive light/dark from `useColorScheme()` mapped onto `colors` vs `colors.dark`. Load fonts with `useFonts` from the `@expo-google-fonts/fredoka` and `@expo-google-fonts/jetbrains-mono` packages before rendering.
