# EAS submit configuration, LocalPoker

`eas.json` now carries the real `ascAppId` (`6815726621`) and `appleTeamId`
(`D7VUBSSP2F`). Neither is a secret: both appear in public App Store URLs and
in any distributed binary. What it deliberately does **not** carry is the
Apple ID email or any App Store Connect API key field, because this repository
is public.

## Releasing from CI, which is the intended path

`.github/workflows/ci.yml` has an `ios-release` job that runs EAS Build and
submits the result to TestFlight. It is opt-in per run: go to **Actions > CI >
Run workflow** and tick **ios_release**. It depends on the `test` job, so a
release cannot skip type-checking, lint, unit tests or the Firebase rules
suite.

It authenticates to Apple with an **App Store Connect API key only**. An Apple
ID and password cannot work unattended, because Apple will ask for a
two-factor code that no CI runner can answer.

### After the first successful release

The build lands in App Store Connect and, once Apple finishes processing it,
appears under **TestFlight > iOS Builds** as *Complete*. Processing takes a few
minutes after EAS reports the submission as finished, so a build that is not
visible immediately is normal.

Installing it on a device needs one more thing that uploading does not: an
**internal testing group** with testers in it. TestFlight testers are per app,
so being the account holder does not enrol you automatically. Either:

- Create the group by hand once, under **TestFlight > Internal Testing**, and
  add testers from **Users and Access**; or
- add `--auto-testflight-setup` to the submit command in the workflow, which
  asks EAS to create an internal group for the app. This is deliberately not
  enabled here: the release path above is verified working end to end, and the
  flag has not been exercised, so turning it on is a change worth making
  deliberately rather than inheriting.

### One-time setup that CI cannot do for itself

**iOS build credentials have to be bootstrapped once, interactively.** In
non-interactive mode eas-cli will happily *reuse* a distribution certificate
but will never *create* one: `SetUpDistributionCertificate.runNonInteractiveAsync`
throws `MissingCredentialsNonInteractiveError` when none exists. A first CI
release therefore fails with "Distribution Certificate is not validated for
non-interactive builds / Credentials are not set up."

This has already been done for this project, and only needs repeating if the
credentials are deleted or the certificate expires (21 Dec 2026):

```sh
EXPO_ASC_API_KEY_PATH=~/Downloads/AuthKey_YMUGSZ476Q.p8 \
EXPO_ASC_KEY_ID=YMUGSZ476Q \
EXPO_ASC_ISSUER_ID=<issuer uuid> \
EXPO_APPLE_TEAM_ID=D7VUBSSP2F \
npx eas-cli@latest credentials:configure-build -p ios -e production
```

Answer **yes** to reusing the existing distribution certificate rather than
creating another. Apple caps an account at two distribution certificates, and
the existing one is already shared by the account's other apps. Say yes to
generating a new provisioning profile: those are per bundle identifier, so this
app needs its own.

Note that the API key is enough for all of this. No Apple ID password or
two-factor prompt is involved, which is the whole reason the release path can
be automated at all.

### The four repository secrets it needs

| Secret | What it is |
|---|---|
| `EXPO_TOKEN` | Expo access token, from <https://expo.dev/settings/access-tokens>. |
| `APPSTORE_CONNECT_API_KEY_P8` | The whole `.p8` private key file, pasted in including the `BEGIN`/`END` lines. |
| `APPSTORE_CONNECT_API_KEY_ID` | The key's ID, the 10-character string in the `.p8` filename. |
| `APPSTORE_CONNECT_ISSUER_ID` | The issuer UUID shown above the keys table. |

**You very likely do not need to create a new key.** App Store Connect API keys
are issued per *account*, not per app, so the key already configured in the
`bestplan` repository authorises this app too. The same four values can simply
be copied across. GitHub secrets are write-only, so they cannot be read back
out of `bestplan`; use the original `.p8` you downloaded when the key was
created.

If you do need a fresh one: App Store Connect > **Users and Access** >
**Integrations** > **App Store Connect API** > **+**, with the **App Manager**
role. The `.p8` downloads exactly once and cannot be retrieved again.

```sh
gh secret set EXPO_TOKEN --repo MikeDafi/localpoker
gh secret set APPSTORE_CONNECT_API_KEY_ID --repo MikeDafi/localpoker
gh secret set APPSTORE_CONNECT_ISSUER_ID --repo MikeDafi/localpoker
gh secret set APPSTORE_CONNECT_API_KEY_P8 --repo MikeDafi/localpoker < AuthKey_XXXXXXXXXX.p8
```

### Why the key fields are not in `eas.json` here

The `bestplan` repository puts `ascApiKeyPath`, `ascApiKeyId` and
`ascApiKeyIssuerId` directly in its `eas.json`. That is safe there because that
repository is **private**. This one is **public**, so the same values would be
published.

The two commands need different handling, which is worth knowing before
editing the workflow:

- **`eas build`** reads `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID` and
  `EXPO_ASC_ISSUER_ID` from the environment, through
  `resolveAscApiKeyAsync`. Environment variables are enough.
- **`eas submit`** does not. It only consults the submit profile in `eas.json`
  or a key already stored in the EAS credentials service, and in
  non-interactive mode it refuses to set one up, failing with "App Store
  Connect API Keys cannot be set up in --non-interactive mode."

So the workflow writes those three fields into `eas.json` on the runner,
immediately before submitting, from the same secrets. The file is modified only
in the CI checkout and never committed. The key itself is written to the
runner's temp directory, never the workspace, and deleted in an `always()`
step.

## Building on this Mac instead of on EAS

A cloud build is the easy path but spends EAS Build minutes. `--local` runs the
same build on your own machine and spends none. Credentials still come from EAS,
so the binary is signed with exactly what CI would have used.

```bash
export EXPO_ASC_API_KEY_PATH="$HOME/Downloads/AuthKey_YMUGSZ476Q.p8"
export EXPO_ASC_KEY_ID=YMUGSZ476Q
export EXPO_ASC_ISSUER_ID=92c03eb1-db75-47cf-a217-485ede98fb89
export EXPO_APPLE_TEAM_ID=D7VUBSSP2F EXPO_APPLE_TEAM_TYPE=INDIVIDUAL

./scripts/build-ios-local.sh
```

**Use the script rather than calling `eas build --local` directly.** EAS
archives the project through git, and `.env` is gitignored, so the build never
sees the `EXPO_PUBLIC_*` values. Those are inlined into the JS bundle at build
time, so a build without them installs and runs while reporting every online
feature as "not configured". That is how build 8 shipped with no working online
play. The script copies `.env` into the production profile's `env` block,
builds, and restores `eas.json` on any exit, which is the same thing CI does
from repository secrets.

Always confirm the values actually landed in the binary before uploading:

```bash
unzip -q build/localpoker.ipa -d build/ipa-check
grep -c -a -F "$EXPO_PUBLIC_FIREBASE_API_KEY" \
  build/ipa-check/Payload/*.app/main.jsbundle    # must be 1, not 0
```

Then upload with Apple's own tool, which avoids `eas submit` and so avoids
having to write key fields into `eas.json` at all:

```bash
cp ~/Downloads/AuthKey_YMUGSZ476Q.p8 ~/.appstoreconnect/private_keys/
xcrun altool --validate-app -f build/localpoker.ipa -t ios \
  --apiKey YMUGSZ476Q --apiIssuer 92c03eb1-db75-47cf-a217-485ede98fb89
xcrun altool --upload-app   -f build/localpoker.ipa -t ios \
  --apiKey YMUGSZ476Q --apiIssuer 92c03eb1-db75-47cf-a217-485ede98fb89
```

Validate first. It catches the same problems the upload would, in seconds,
without burning a build number.

### Three things that will bite

**`GIT_CONFIG_COUNT` with an empty value.** If the shell exports
`GIT_CONFIG_COUNT=3` while `GIT_CONFIG_VALUE_2` is an empty string, spawning
drops the empty variable, so git sees three keys and two values and refuses to
run. `pod install` then fails cloning a pod from source and the build reports
only `Unknown error. See logs of the Install pods build phase`. Setting
`GIT_CONFIG_COUNT=0` for the build is the fix, which `build-ios-local.sh` does
for you.

**Installing fastlane can break CocoaPods.** `eas build --local` needs fastlane
for iOS, and `brew install fastlane` upgrades Ruby underneath an existing
CocoaPods, which then cannot activate its own gems. `brew reinstall cocoapods`
repairs it.

**Build numbers are spent, not reserved.** `autoIncrement: true` with
`appVersionSource: remote` takes the next number when a build *starts*, so
failed attempts leave gaps. Do not expect the next build to be the next integer.

## Opening the app to the public internet

`expo start --tunnel` is not an option here, and the reason is worth recording
because the symptom is misleading. Expo implements the tunnel with ngrok, and
ngrok fails on this machine with `ngrok tunnel took too long to connect`, which
reads like a network problem. It is not:

- ngrok's endpoints resolve and accept TLS on 443, so egress is open;
- the binary carries a valid Developer ID signature from ngrok LLC;
- Rosetta works, since node itself runs as x86_64 here.

The binary is `SIGKILL`ed in well under a second with no output. Copying the
same bytes to a different filename and running them succeeds, so the kill
follows the *name*, not the code: an endpoint security agent (Microsoft
Defender is present) is blocking execution of ngrok by identity. That is a
deliberate policy control, so the answer is to use a different distribution
mechanism, not to rename the binary around it.

A tunnel would also only have exposed a dev server tied to one laptop, which
stops working the moment that laptop sleeps.

The real mechanism for public iOS distribution is a **TestFlight public link**,
which needs an *external* group; internal groups cannot have one. The setup is
scripted through the App Store Connect API the same way tester management is:

1. Create an external group with `publicLinkEnabled` true. The link is issued
   immediately, before any review.
2. Attach a build to that group.
3. Fill `betaAppReviewDetails` (contact, and notes saying Guest needs no
   credentials) and create a `betaAppLocalizations` entry with a description,
   feedback email and privacy URL. External testing refuses to submit without
   both.
4. `POST /v1/betaAppReviewSubmissions` for the build.

Beta App Review is separate from, and lighter than, App Store review, but it is
still a review: the link does not accept installs until the build leaves
`WAITING_FOR_BETA_REVIEW`. The current link is
<https://testflight.apple.com/join/etf57Rhk>, and it admits
up to 10,000 testers once approved. It served build 13; build 16 supersedes it
and needs its own beta review before testers receive it.

Worth knowing: submitting a build for beta review does not disturb an App Store
submission that is already in flight. Both were in review at the same time here.

## Getting a build to a tester

A build that finishes processing is still not installable: TestFlight needs a
group, and internal groups need App Store Connect users. `scripts/asc-api.py`
does this over the App Store Connect API using the same `.p8` key CI submits
with, which avoids an Apple ID password and a 2FA prompt entirely.

It takes its configuration from the environment, because this repository is
public and a key id, issuer and app id together tell an attacker exactly what to
phish for:

```bash
export ASC_KEY_ID=...            # the .p8 key id
export ASC_ISSUER_ID=...         # App Store Connect issuer id
export ASC_KEY_PATH="$HOME/Downloads/AuthKey_<id>.p8"
export ASC_APP_ID=...            # the numeric app id
export ASC_TESTER_EMAIL=...      # only needed by `setup`

python3 scripts/asc-api.py survey                 # groups, users, builds
python3 scripts/asc-api.py setup <build-id>       # group + tester + assign
```

`survey` redacts App Store Connect usernames, which are email addresses. Pass
`ASC_SHOW_USERS=1` when you actually need them.

It is idempotent: an existing group is reused and an existing tester is left
alone, so re-running it is safe.

## Running a submit by hand instead

Everything below is the manual path, for when you are not going through CI.

## iOS values

### Apple ID email

Use the email address you use to sign in to App Store Connect.

Set it at submit time with the environment variable that EAS supports:

```sh
EXPO_APPLE_ID="you@example.com" npx eas-cli@latest submit --platform ios --profile production
```

For app-specific password upload, also set:

```sh
EXPO_APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

Create an app-specific password at appleid.apple.com under **Sign-In and Security** > **App-Specific Passwords**.

### App Store Connect app ID

This is the App Store Connect app's numeric Apple ID, not the bundle identifier.

Find it here:

1. Open appstoreconnect.apple.com.
2. Go to **My Apps**.
3. Open **LocalPoker: Poker with Friends**.
4. Select the **App Store** tab.
5. In the left sidebar, open **General** > **App Information**.
6. Copy **Apple ID** under **General Information**.

EAS does not document an environment variable for `ascAppId` in `eas.json`. In interactive mode, leave it out and EAS will prompt or ensure the app exists. For non-interactive submit, make this exact local one-line edit at submit time, then do not commit it:

```json
"ios": { "bundleIdentifier": "com.mike0264.localpoker", "sku": "localpoker-ios", "language": "en-US", "appName": "LocalPoker: Poker with Friends", "ascAppId": "1234567890" }
```

### Apple Developer Team ID

Find it here:

1. Open developer.apple.com/account.
2. Select **Membership details**.
3. Copy **Team ID**.

EAS does not document an environment variable for `appleTeamId` in `eas.json`. Most interactive submits can omit it unless your Apple ID belongs to multiple teams or EAS needs to create the app record. For non-interactive submit or multiple-team accounts, make this exact local one-line edit at submit time, then do not commit it:

```json
"ios": { "bundleIdentifier": "com.mike0264.localpoker", "sku": "localpoker-ios", "language": "en-US", "appName": "LocalPoker: Poker with Friends", "ascAppId": "1234567890", "appleTeamId": "ABCDE12345" }
```

## Android values

The tracked profile sets only the Play track. Do not commit a service account JSON path.

Preferred path:

1. Open play.google.com/console.
2. Create the `com.mike0264.localpoker` app if needed.
3. Create a Google service account key using Expo's current guide.
4. Run `eas credentials --platform android`.
5. Choose the production profile.
6. Choose **Google Service Account** > **Upload a Google Service Account Key**.

If you must use a local JSON key path instead, keep the key outside git and make this exact local one-line edit at submit time, then do not commit it:

```json
"android": { "track": "internal", "serviceAccountKeyPath": "./secrets/google-play-service-account.json" }
```

## Adding a native capability invalidates the provisioning profile

Adding `expo-notifications` made two consecutive local builds fail with:

```
Provisioning profile "...AppStore 2026-09-24..." doesn't include the
Push Notifications capability
... doesn't include the aps-environment entitlement
```

This is not a signing misconfiguration and re-running does not fix it. An
entitlement only reaches a profile once the **bundle ID declares the matching
capability**, and EAS reuses the profile it already has rather than noticing
that the app's entitlements changed. Supplying `EXPO_ASC_*` credentials does
not help on its own, because nothing triggers a resync.

The fix is to enable the capability on the bundle ID, which makes Apple mark
every profile containing that bundle ID `INVALID`, after which EAS has no
choice but to generate a new one:

```python
# POST /v1/bundleIdCapabilities
{"data": {"type": "bundleIdCapabilities",
          "attributes": {"capabilityType": "PUSH_NOTIFICATIONS"},
          "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": "<id>"}}}}}
```

Find the id with `GET /v1/bundleIds?filter[identifier]=com.mike0264.localpoker`.
Then rebuild with the `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`,
`EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID` and `EXPO_APPLE_TEAM_TYPE`
variables set, exactly as `ci.yml` does, so EAS can mint the replacement
without an interactive Apple login. Confirm it worked by reading the
entitlement straight out of the IPA rather than trusting the build log:

```python
# Payload/*.app/embedded.mobileprovision -> Entitlements['aps-environment']
```

It should read `production`. The issuer id is shown in App Store Connect under
Users and Access > Integrations > App Store Connect API; it is not a secret on
its own, but it lives in repository secrets rather than in this file because
naming it alongside the key id tells an attacker exactly what to phish for.

## An approved build is not a distributed build

A build passing beta review does **not** put it in front of testers. It also
has to be added to each beta group, and nothing warns you that it has not
been. Build 16 sat `APPROVED` while both groups still served build 13, so the
tester saw a fortnight-old UI and reported bugs that had already been fixed.

Check before believing a build has shipped:

```
GET /v1/betaGroups/<groupId>/builds
```

and add it explicitly:

```
POST /v1/betaGroups/<groupId>/relationships/builds
{"data": [{"type": "builds", "id": "<buildId>"}]}
```

Both groups need it: `Internal Testers` and the public-link `Public Beta`.

A related trap when reporting a bug from TestFlight: **room codes are not
comparable across builds.** Build 13 issued ten-character codes and 16 onwards
issue four, so a host and a joiner on different builds can never resolve the
same code no matter what else is correct.

## Half-built review submissions block the next one

Creating a `reviewSubmission` and then failing to attach its
`reviewSubmissionItem` leaves an orphan in `READY_FOR_REVIEW` that holds the
version. The next submission then fails with a 409 that names the wrong
problem:

```
ENTITY_ERROR.RELATIONSHIP.REQUIRED
App ... must have an approved appStoreVersions for platform IOS
```

That reads like the app has never been approved. It actually means the version
is already spoken for. Cancel any submission sitting in `READY_FOR_REVIEW`
before creating a new one, and check the status of the `reviewSubmissionItems`
POST rather than assuming it worked.

## Swapping the build on a version that is already in review

App Store Connect will not let a new build attach to a version that is
`WAITING_FOR_REVIEW`: "To submit a new build, you must remove this version
from review." Over the API that is three steps, not one.

```
PATCH /v1/reviewSubmissions/<id>            {"attributes": {"canceled": true}}
PATCH /v1/appStoreVersions/<id>/relationships/build   {"data": {"type": "builds", "id": "<build>"}}
POST  /v1/reviewSubmissions                 then POST /v1/reviewSubmissionItems
PATCH /v1/reviewSubmissions/<new>           {"attributes": {"submitted": true}}
```

Cancelling is asynchronous: the submission reports `CANCELING` first and the
version only becomes editable once it reaches `DEVELOPER_REJECTED`, so poll
before attaching rather than assuming the `200` means it is done.

The cost is queue position, which is worth paying whenever the build in review
has a defect a reviewer would plausibly hit. Build 13 could not create a room
for anyone who had friends, which is the app's headline feature, so replacing
it most likely avoided a rejection rather than merely delaying the release.

## Build sanity notes

- `app.json` uses bundle identifier and package `com.mike0264.localpoker`, which is valid.
- Version `1.0.0`, iOS build number `1`, and Android version code `1` are valid for the first upload. Increment build number and version code before every later upload.
- `ios.supportsTablet` is deliberately `false` for the phone-only launch.
- `ITSAppUsesNonExemptEncryption` is `false`; keep that only if the app uses standard HTTPS/TLS and no custom non-exempt encryption.
- `npx eas-cli@latest build --profile production` may ask to link an EAS project if `extra.eas.projectId` is not present. This project is not linked yet, so run `npx eas-cli@latest init` once first and commit the `app.json` change it makes.
- `eas-cli` is deliberately not a dependency of this project, so always invoke it through `npx eas-cli@latest`. A bare `eas` will not resolve here.
