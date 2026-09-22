# EAS submit configuration, LocalPoker

The tracked `eas.json` intentionally contains no Apple ID, App Store Connect app ID, Apple team ID, or Google Play service account key path. That prevents placeholder values from being submitted by accident.

## iOS values

### Apple ID email

Use the email address you use to sign in to App Store Connect.

Set it at submit time with the environment variable that EAS supports:

```sh
EXPO_APPLE_ID="you@example.com" eas submit --platform ios --profile production
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
"ios": { "bundleIdentifier": "com.localpoker.app", "sku": "localpoker-ios", "language": "en-US", "appName": "LocalPoker: Poker with Friends", "ascAppId": "1234567890" }
```

### Apple Developer Team ID

Find it here:

1. Open developer.apple.com/account.
2. Select **Membership details**.
3. Copy **Team ID**.

EAS does not document an environment variable for `appleTeamId` in `eas.json`. Most interactive submits can omit it unless your Apple ID belongs to multiple teams or EAS needs to create the app record. For non-interactive submit or multiple-team accounts, make this exact local one-line edit at submit time, then do not commit it:

```json
"ios": { "bundleIdentifier": "com.localpoker.app", "sku": "localpoker-ios", "language": "en-US", "appName": "LocalPoker: Poker with Friends", "ascAppId": "1234567890", "appleTeamId": "ABCDE12345" }
```

## Android values

The tracked profile sets only the Play track. Do not commit a service account JSON path.

Preferred path:

1. Open play.google.com/console.
2. Create the `com.localpoker.app` app if needed.
3. Create a Google service account key using Expo's current guide.
4. Run `eas credentials --platform android`.
5. Choose the production profile.
6. Choose **Google Service Account** > **Upload a Google Service Account Key**.

If you must use a local JSON key path instead, keep the key outside git and make this exact local one-line edit at submit time, then do not commit it:

```json
"android": { "track": "internal", "serviceAccountKeyPath": "./secrets/google-play-service-account.json" }
```

## Build sanity notes

- `app.json` uses bundle identifier and package `com.localpoker.app`, which is valid.
- Version `1.0.0`, iOS build number `1`, and Android version code `1` are valid for the first upload. Increment build number and version code before every later upload.
- `ios.supportsTablet` is deliberately `false` for the phone-only launch.
- `ITSAppUsesNonExemptEncryption` is `false`; keep that only if the app uses standard HTTPS/TLS and no custom non-exempt encryption.
- `eas build --profile production` may ask to link an EAS project if `extra.eas.projectId` is not present. Run `eas init` once if EAS asks for it.
