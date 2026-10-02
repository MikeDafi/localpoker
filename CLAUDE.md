# LocalPoker

See **[AGENTS.md](AGENTS.md)** for orientation: what the app is, how the code
is laid out, the three constraints behind most decisions, and the house style.

Task-specific knowledge lives in `.github/skills/`:

- `verify-on-simulator` — getting a change in front of a real simulator, which
  is how every layout bug here has actually been caught.
- `table-layout` — how the felt, the lane and the board size themselves, and
  the three changes that look right and are not.
- `ship-testflight` — building and getting it to testers, including the parts
  `eas submit` does not do.
