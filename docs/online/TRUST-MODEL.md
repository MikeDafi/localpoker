# Online trust model, and what is wrong with it

## The short version

**The player who opens a table deals its cards.** There is no server in the
middle. A modified host client can see every hole card at the table, and can
influence what is dealt.

This is a deliberate, recorded trade-off rather than an oversight, and this
document exists so nobody has to rediscover it from the code.

## Why it is like this

`localpoker` runs on Firebase's free Spark plan with no billing account
attached, which is the right default for a free app anyone can download: usage
stops at the quota instead of generating a bill. Spark has no Cloud Functions,
so there is nowhere trusted to run a deal.

The host therefore does it. `buildHostGame` in `src/services/firebase/roomSync.ts`
creates the game, shuffles, and writes two things: a redacted `publicState` that
everyone reads, and one `views/$code/$uid` per player holding only that player's
hole cards. The rules enforce that **only the host may write those**, and that
**no player may read another player's view**. What the rules cannot check is
whether the host dealt honestly, because they cannot see the deck.

## What this does and does not expose

Protected by rules, and tested in `npm run test:rules`:

- a player cannot read another player's hole cards;
- a player cannot write another player's action, or act as them;
- a player cannot forge their stack, seat, or host flag on their own roster
  entry, nor add fields of their own to it;
- a stranger cannot read a room they are not seated at;
- a user the host blocked cannot join their lobby;
- a private table cannot be advertised in the public lobby.

Not protected, and not protectable without a trusted server:

- the host knows every hole card at their own table;
- the host chooses the shuffle seed;
- the host could publish a state that does not follow from the previous one.

## Why it is tolerable today, and when it stops being

LocalPoker is play-money only. There are no cash prizes, nothing convertible,
and busting out offers a free rebuy, so the prize for cheating is a number that
only matters to the person looking at it. Among friends, the trust model is also
the social one: you already know who dealt.

Two things change that calculus:

1. **The public lobby**, where strangers sit at a table hosted by someone they
   have no reason to trust. The Room setting says so in as many words at the
   point where a host chooses to open one.
2. **Anything with real value** attached to a result: cash, prizes, ranked
   ladders, tournaments with entry fees, or cosmetics that cannot be earned
   any other way.

If either grows, the deal has to move off the host.

## What fixing it takes

Move dealing and state transitions to a trusted backend, so clients only ever
submit **intents** and never author state:

1. Upgrade the Firebase project to Blaze, or stand up a small server.
2. Move `buildHostGame`, `applyAction` and `redactGameState` behind a Cloud
   Function. The deck lives there and is never written to the database.
3. Make `publicState` and `views/**` writable only by the service account, so
   the existing `.write` rules for the host become writes nobody can make.
4. Keep `actions/` client-writable, since an intent is all a client should ever
   produce. The bounded `actionSeq` check stays useful.

The redaction split already exists and is the hard part; what changes is who
runs it.
