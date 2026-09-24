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

## Build sanity notes

- `app.json` uses bundle identifier and package `com.mike0264.localpoker`, which is valid.
- Version `1.0.0`, iOS build number `1`, and Android version code `1` are valid for the first upload. Increment build number and version code before every later upload.
- `ios.supportsTablet` is deliberately `false` for the phone-only launch.
- `ITSAppUsesNonExemptEncryption` is `false`; keep that only if the app uses standard HTTPS/TLS and no custom non-exempt encryption.
- `npx eas-cli@latest build --profile production` may ask to link an EAS project if `extra.eas.projectId` is not present. This project is not linked yet, so run `npx eas-cli@latest init` once first and commit the `app.json` change it makes.
- `eas-cli` is deliberately not a dependency of this project, so always invoke it through `npx eas-cli@latest`. A bare `eas` will not resolve here.
