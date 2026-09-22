# 🃏 Poker iOS App — Design Document

> **Implementation note (update):** The shipped local prototype pivoted from
> native SwiftUI to **React Native + Expo (SDK 57)** for a faster cross-platform
> MVP that runs in **Expo Go**, and adopted a **Nintendo Wii / Mii** visual
> identity. See `README.md` for how to run it and `docs/uiux-spec.md` for the
> Wii UI/UX spec. The product/monetization/architecture principles below still
> apply; substitute SwiftUI → React Native and SwiftData → AsyncStorage.

## 1. Product Concept

A **free, ad-supported social poker app** for playing Texas Hold'em (and later
variants) with friends in private rooms, backed by rich personal stats.

**Play-money only — no real-money gambling.** This keeps the app clear of the App
Store's real-gambling restrictions and the associated legal/licensing minefield.

**Core pillars**

- Polished, premium UI
- Deep, meaningful stats
- Frictionless friend play (invite codes / share sheet)
- Sustainable ad-based monetization

---

## 2. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **UI** | SwiftUI (iOS 16+) | Modern, fast to build, great animations |
| **State** | Swift Concurrency + Observable | Clean async game loop |
| **Persistence** | SwiftData / Core Data | Stats & profile caching |
| **Real-time multiplayer** | Firebase Realtime DB **or** custom WebSocket (Node/Go) | Live table sync |
| **Auth** | Sign in with Apple + Firebase Auth | Low friction, App Store friendly |
| **Backend** | Firebase (fast MVP) → custom later | Auth, DB, functions, push |
| **Ads** | Google AdMob | Best fill/revenue on iOS |
| **Analytics** | Firebase Analytics + Crashlytics | Funnels & stability |
| **Push** | APNs via Firebase Cloud Messaging | "Your turn", invites |

**Recommendation:** Start on Firebase for the MVP to ship fast. Abstract the
networking layer behind a protocol so a custom authoritative server can be
swapped in later (important for anti-cheat).

---

## 3. Architecture

```
┌─────────────────────────────────────────┐
│              SwiftUI Views               │
│  Table · Lobby · Stats · Profile · Store │
├─────────────────────────────────────────┤
│           ViewModels (Observable)        │
│   GameVM · LobbyVM · StatsVM · AuthVM    │
├─────────────────────────────────────────┤
│              Domain / Engine             │
│  PokerEngine · HandEvaluator · Dealer    │
├─────────────────────────────────────────┤
│            Services (protocols)          │
│  GameSync · AuthService · AdService      │
│  StatsRepo · FriendsService · Push       │
├─────────────────────────────────────────┤
│   Firebase / WebSocket · AdMob · APNs    │
└─────────────────────────────────────────┘
```

**Key principle:** The poker rules engine runs **authoritatively on the server**
(or a designated host), never trusting the client, to prevent cheating (seeing
others' cards / manipulating outcomes).

---

## 4. Core Modules

### A. Poker Engine (pure Swift, unit-tested)
- 7-card best-of-5 hand evaluator
- Betting rounds, pot & side-pots, blinds, dealer rotation, showdown logic
- Fully deterministic and testable in isolation from UI/network

### B. Multiplayer / Rooms
- Create private room → 6-char invite code + share sheet (iMessage/link)
- Room states: `waiting → in-hand → showdown → next-hand`
- Reconnection handling (sit-out on disconnect, auto-fold on timeout)
- Seats 2–9, configurable blinds, buy-in, turn timer

### C. Stats Engine
- Per-hand logging → aggregate metrics:
  - VPIP, PFR, aggression factor, win rate (bb/100), showdown %,
    biggest pot, hands played, net chips over time
- Session history, graphs, hand replays
- Local cache + cloud sync (stats persist across devices)

### D. Ads (AdMob)
- **Interstitial:** between sessions / after leaving a table (never mid-hand)
- **Rewarded video:** "watch to top up play chips" — good UX + revenue
- **Banner:** lobby/stats screens only, never at the table
- Frequency capping + a cheap **remove-ads IAP** as secondary revenue

### E. Economy (play money)
- Daily free chip bonus, streak rewards, rewarded-ad top-ups, optional chip-pack IAP

---

## 5. Screens / UX Flow

1. **Onboarding** — Sign in with Apple, pick avatar/username
2. **Home/Lobby** — Play with friends · Quick play (bots) · Daily bonus · banner ad
3. **Create/Join Room** — invite code, configure stakes, share sheet
4. **Poker Table** (hero screen) — felt, community cards, chip animations, hole
   cards, action bar (Fold/Check/Call/Raise + slider), turn timer, avatars &
   stacks, emotes/chat
5. **Showdown** — reveal + pot award animation
6. **Stats Dashboard** — graphs, key metrics, filters, hand replays
7. **Profile** — avatar, lifetime stats, achievements, friends list
8. **Store** — remove ads, chip packs, cosmetics (card backs/table themes)

**UI direction:** dark premium felt, smooth chip/card animations (matched
geometry + spring), haptics on actions, SF Symbols, clean typography. Cosmetic
themes double as monetization.

---

## 6. Social / Comms (chat → voice → video)

Real-time audio/video is the **most expensive** feature and can exceed ad
revenue, so it is phased and gated.

### Cost model
Video/voice SDKs bill **per participant-minute**. A 6-player table = **6×** the
cost per minute of real time.

| Provider | Video (HD 720p) | Audio only | Free tier |
|----------|-----------------|-----------|-----------|
| Agora | ~$3.99 / 1k min | ~$0.99 / 1k min | 10k min/mo |
| Daily.co | ~$4 / 1k min | ~$1 / 1k min | 10k min/mo |
| 100ms | ~$4 / 1k min | ~$1.5 / 1k min | 10k min/mo |
| Vonage Video | ~$4.75 / 1k min | cheaper | trial credit |
| LiveKit (self-host) | server + egress only | same | open source |
| Twilio Video | ❌ discontinued | — | — |

### Poker math (6 players, 1-hour session, HD video @ ~$4/1k part-min)
```
6 players × 60 min = 360 participant-minutes
360 × $0.004 = $1.44 per table-hour ≈ $0.24 / player / hour
```
AdMob for a casual free user yields ~$0.02–0.15 per session — **video costs more
than it earns.** Audio-only is ~4× cheaper (~$0.36/table-hour).

### Self-hosting LiveKit
No per-minute fee — only server + **egress bandwidth**. An SFU relaying 6 players
at ~1 Mbps ≈ 13 GB/table-hour egress:
- AWS/GCP egress (~$0.09/GB) → ~$1.20/hr (no cheaper than managed)
- Cheap-egress hosts (Hetzner ~€1/TB, DigitalOcean/OVH bundled) → **~$0.01–0.05/table-hour** 🏆

### Recommendation (phased)
1. **v1:** text chat + emotes (near-zero cost)
2. **Add voice before video** (4× cheaper, enough for social poker)
3. **Gate A/V as a perk**, off by default, opt-in per room:
   - unlock via **rewarded ad** ("watch to enable table video this session"), or
   - bundle into **remove-ads / premium IAP**
4. At scale, **self-host LiveKit** on a cheap-egress host

---

## 7. Anti-Cheat & Fairness
- Server-authoritative deck & dealing; clients receive only their own hole cards
- Cryptographically seeded shuffle (server-side RNG)
- Turn timers + rate limiting; validate every action server-side

---

## 8. Monetization Summary
1. AdMob rewarded + interstitial + banner (primary)
2. Remove-ads IAP
3. Chip packs + cosmetic IAPs (card backs, table themes)

---

## 9. Roadmap

| Phase | Scope |
|-------|-------|
| **MVP (v0.1)** | Engine + local single-table with bots, table UI, basic stats |
| **v0.2** | Firebase auth + real-time friend rooms via invite codes |
| **v0.3** | AdMob integration + economy/daily bonus |
| **v0.4** | Full stats dashboard, hand replays, achievements |
| **v0.5** | Cosmetics store, push notifications, text chat + emotes, polish |
| **v1.0** | App Store launch |
| **Later** | Voice → gated video, tournaments, Omaha, leaderboards, clubs |

---

## 10. Key Risks
- **App Store gambling rules** → strictly play-money, no cash-out, ever
- **Cheating** → server-authoritative from day one for multiplayer
- **Real-time sync complexity** → start with Firebase, abstract for later swap
- **A/V economics** → keep audio/video premium/gated, never default-on
