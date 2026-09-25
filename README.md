# 🃏 LocalPoker: Poker with Friends

A free, ad-supported **Texas Hold'em** iOS app with a friendly **console-menu**
visual identity and customizable **Pal** characters, built with **React Native +
Expo (SDK 57)**. Play against difficulty-tunable bots now; private friend rooms
have a Firebase real-time scaffold (see `docs/FIREBASE_SETUP.md`).

> Play-money only, no real-money gambling (keeps it App-Store friendly).

## Run it locally

```bash
npm install
npm start          # then scan the QR code with Expo Go (iOS)
# or
npm run ios        # build and run a native iOS app in the simulator
```

Requires Node 18+ and Xcode for `npm run ios`. Expo Go still works for most of
the app, but **Google sign-in only works in a native build**: the OAuth redirect
is bound to this app's bundle identifier, not Expo Go's. Use `npm run ios` (or a
TestFlight build) to exercise sign-in.

## What's built

- **Wii-style UI**, glossy channel tiles, bouncy spring buttons, felt table,
  procedural **Mii avatars** (deterministic SVG faces from a seed).
- **Home lobby** as a Wii channel grid, **Poker table**, **Create/Join room**,
  **Stats dashboard**, and **Profile** screens.
- **Poker engine** (`src/engine`), pure TypeScript, dependency-free: seeded
  shuffle, 5–7 card hand evaluator, full Hold'em state machine (blinds, betting,
  side pots, showdown), and a heuristic bot. Fully unit-tested.
- **Stats**, VPIP, PFR, aggression factor, win rate, stack history chart,
  persisted locally via AsyncStorage.
- **Economy**, starting chips + daily bonus.
- **Ads**, placeholder banner slots reflecting the ad-supported design.

## Scripts

```bash
npm start          # Expo dev server
npm run ios        # native iOS build in the simulator
npm run android    # native Android build
npm test           # run the poker-engine test suite (vitest)
npx tsc --noEmit   # typecheck
```

## Project structure

```
App.tsx                 # navigation + font loading
src/
  engine/               # pure-TS poker engine + tests
  theme/theme.ts        # Wii design tokens (colors, spacing, springs…)
  components/            # Mii avatar, Wii button/panel/tile, cards, chips, seat…
  screens/              # Home, Table, CreateJoin, Stats, Profile
  state/AppContext.tsx  # profile, chips, stats (AsyncStorage)
  navigation/types.ts   # route + table-config types
docs/uiux-spec.md       # the September-2026 Wii UI/UX specification
DESIGN.md               # product/architecture design doc
```

## Not yet wired (next steps)

These are designed for but intentionally stubbed so the app runs in **Expo Go**
without a custom native dev client or cloud project:

- **AdMob** (`react-native-google-mobile-ads`), needs a dev client; see
  `src/components/AdBanner.tsx`. Currently a visual placeholder.
- **Firebase** real-time friend rooms, invite codes/UI exist; multiplayer sync
  is not connected. Local play vs. bots is fully functional.
- **In-app purchases** (remove-ads, chip packs) and push notifications.

See `docs/uiux-spec.md` and `DESIGN.md` for the full design.
