---
name: verify-on-simulator
description: "Put a LocalPoker change in front of a real iOS simulator and look at it. Use when changing anything on the poker table (board, seats, showdown, hole cards, alerts, pacing), or when a layout looks right in the arithmetic but has not been seen on a screen. Covers staging a deterministic hand without taps, muting the app, reading measurements back out of the running app, and reverting the harness before committing."
---

# Verify on a simulator

Layout arithmetic in this repo has been wrong three times while its unit tests
passed. Each time the tests asserted the formula rather than whether the result
was readable, and each time the simulator found it in one screenshot. If a
change moves a pixel, look at it.

`xcrun simctl` **cannot tap**. Everything below exists to reach a given screen
without touching it.

## 1. Stage the hand deterministically

`startHand` shuffles from `` `${seed}:${handNumber}` ``, so a seed fixes the
cards. To reach a showdown with no decisions at all, set **`ante` equal to
`startingStack`**: everyone is all in before the blinds, nobody has an action,
and the board runs out on its own.

Find a seed for the situation you want by running the engine headlessly rather
than by playing toward it:

```ts
// scratch-seeds.test.ts at the repo root, deleted afterwards
const cfg = { smallBlind: 10, bigBlind: 20, ante: 10, startingStack: 10, maxPlayers: 6, turnTimerSec: 20 };
const s = startHand(createGame(cfg, players, seed));
const winners = s.winners.filter((w) => w.amount > 0);   // length === n is an n-way split
```

Seeds known to work with that config: **2 players** split on 4, **3** on 234,
**4** on 26, **5** on 61, **6** on 1140. The local player busts heads-up on
seed 1, which is how to reach the "Table over" flow.

## 2. Boot into it, muted

Add a temporary block to `App.tsx` and have `RootNavigator` return it before
the age gate. **Mute through the real setting**, which routes through
`AppContext` to `sound.configure` and silences every `sound.play` in the app:

```tsx
const SHOT: 'play' | 'split4' | '' = 'split4';
function ShotNavigator() {
  const { updateSettings } = useApp();
  // Guarded by a ref: `updateSettings` is rebuilt whenever settings change,
  // so depending on it and calling it is an infinite render loop.
  const muted = React.useRef(false);
  useEffect(() => {
    if (muted.current) return;
    muted.current = true;
    updateSettings({ soundEnabled: false, winFanfare: false, hapticsEnabled: false });
  }, [updateSettings]);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Table" component={TableScreen} initialParams={{ seed, settings }} />
      <Stack.Screen name="Home" component={HomeScreen} />
    </Stack.Navigator>
  );
}
```

Route `initialParams` are fixed at first mount, so **fast refresh will not
re-apply them**. Terminate and relaunch to remount the navigator.

## 3. Run it

```bash
SIM=$(xcrun simctl create "lp-verify" "iPhone 17 Pro")
xcrun simctl boot $SIM && sleep 22
xcrun simctl install $SIM ~/Library/Developer/Xcode/DerivedData/LocalPokerPokerwithFriends-*/Build/Products/Debug-iphonesimulator/LocalPokerPokerwithFriends.app
CI=1 npx expo start --port 8081          # in the background
xcrun simctl launch --terminate-running-process $SIM com.mike0264.localpoker
for i in $(seq 1 14); do sleep 1; xcrun simctl io $SIM screenshot .shots/a$i.png; done
```

- **`CI=1` turns Metro's watch mode off**, so edits are not picked up: restart
  Metro after every change. Without `CI=1` the server exits on its own when
  stdin is not a TTY, which is worse.
- **Use a simulator you created.** A shared one may have another app's modal
  covering the screen, and an older build of this app left running on a
  different simulator will keep logging into the same Metro, so you end up
  reading someone else's numbers and concluding the bundle is stale.
- The first launch bundles for about ten seconds, so the first burst misses
  the action. Launch twice.
- Downscale before viewing: `sips -Z 820 shot.png --out shot-s.png`.

## 4. Measure, do not estimate

Counting pixels in a screenshot is how wrong conclusions get drawn. Log the
real numbers out of the running app and read them back from Metro's output:

```ts
console.log('SHOT-LAYOUT', JSON.stringify({ laneTop, laneH, heroPodH, sdCardSize, boardBox }));
```

That is what revealed `heroH` starting at 96 and only ever growing, so a
guessed constant had quietly become a floor the table could never get back
under, costing the board forty points of felt for the whole session.

## 5. Clean up, always

```bash
git checkout App.tsx                     # drop the harness
# remove every TEMP log, delete scratch-*.test.ts and .shots/
xcrun simctl shutdown $SIM && xcrun simctl delete $SIM
```

Then `npx tsc --noEmit`, `npm test` and `npx eslint src --ext .ts,.tsx` before
committing. Keep the screenshots outside the repo; they are evidence, not
source.
