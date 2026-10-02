---
name: ship-testflight
description: "Build LocalPoker and get it onto TestFlight. Use when asked to make a build, ship to TestFlight, cut a release, or submit to the App Store. Covers checking App Store Connect state first, dispatching the opt-in CI release job, and the three things eas submit does not do that otherwise leave the build where no tester can install it."
---

# Ship a build to TestFlight

A build is **never** produced by pushing. It costs EAS Build minutes and
creates a real App Store Connect submission, so it is opt-in per run.

## 0. Look at App Store Connect first

A new build can disturb a submission that is already in review. Check before
building, do not assume: the plan file in this repo said a build was attached
to a pending review long after that had stopped being true.

```bash
# Values live outside this public repo. The key is already on this machine at
# ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8; the issuer and app id
# are in App Store Connect under Users and Access > Integrations.
export ASC_KEY_ID=...  ASC_ISSUER_ID=...  ASC_APP_ID=...
export ASC_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8"
python3 scripts/asc-api.py survey
```

A key id, an issuer and an app id together tell an attacker exactly what to
phish for, which is why `scripts/asc-api.py` takes all four from the
environment and hard-codes none of them. Keep it that way in anything added
here.

For the version's own state, query `/v1/apps/{id}/appStoreVersions`. If it is
`REJECTED` or `PREPARE_FOR_SUBMISSION`, nothing is pending and a build is free
to go up. If it is `WAITING_FOR_REVIEW` or `IN_REVIEW`, **ask first**: swapping
the build means pulling the submission.

## 1. Dispatch the release job

```bash
gh auth switch --user MikeDafi
gh workflow run ci.yml --repo MikeDafi/localpoker --ref main -f ios_release=true
gh run watch <id> --repo MikeDafi/localpoker --exit-status
gh auth switch --user <your usual account>
```

Expect **40 to 60 minutes**, nearly all of it EAS free-tier queue. The job
times out at 150. The build number comes from EAS's remote counter
(`appVersionSource: remote`, `autoIncrement: true`); nothing local needs
bumping.

## 2. Finish what `eas submit` does not

`eas submit` uploads the binary and stops. A build that only gets that far
processes to `VALID` and then sits where **no tester can install it**. Three
more things are needed, all through the App Store Connect API, and all easy to
forget because the CI job goes green without them.

Wait for Apple to finish processing first (a few minutes; the build appears in
`/v1/apps/{id}/builds` once it does), then:

1. **Release notes.** `PATCH /v1/betaBuildLocalizations/{id}` with `whatsNew`.
   The localization row already exists, empty.
2. **Internal group.** `POST /v1/betaGroups/{internal}/relationships/builds`.
3. **External group.** `POST /v1/betaAppReviewSubmissions` for the build, then
   `POST /v1/betaGroups/{external}/relationships/builds`. Apple usually waives
   review when an earlier build of the same version already passed, and the
   build goes straight to `IN_BETA_TESTING`.

Confirm with `/v1/builds/{id}/buildBetaDetail`: both `internalBuildState` and
`externalBuildState` should read `IN_BETA_TESTING`.

## Facts worth not rediscovering

- **`eas build` and `eas submit` read credentials differently.** `build` takes
  `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID` and `EXPO_ASC_ISSUER_ID`;
  `submit` ignores all three and reads only `eas.json` or the EAS credentials
  service, and refuses to set one up non-interactively. CI works around this
  by writing the fields into `eas.json` on the runner.
- **Credentials cannot be bootstrapped in CI.** A distribution certificate is
  reused but never created non-interactively. Apple caps them at about two, so
  reuse the existing one rather than making another.
- **Node 22**, not 20: `eas-cli` pulls `@oclif/plugin-autocomplete`, which
  declares `engines node >=22`.
- `ITSAppUsesNonExemptEncryption: false` is already set, so export compliance
  never blocks a TestFlight build.
- Builds expire **90 days** after upload.

`docs/store/EAS-SUBMIT.md` is the long form. `docs/store/APP-STORE-CONNECT.md`
holds the current status table; update it when the build number changes.
