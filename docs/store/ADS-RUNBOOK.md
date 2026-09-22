# Real ads enablement runbook

Current 1.0 submission path: ads are off. `EXPO_PUBLIC_ADS_ENABLED` defaults to false, and the app does not render the old reserved banner slot. Keep it false for App Store submission unless every item below is complete.

Guideline basis: App Store Review Guideline 2.1(a) requires final binaries and says placeholder text and temporary content must be scrubbed before submission.

## To turn ads on later

1. Install a real ad SDK, for example `react-native-google-mobile-ads`.
2. Build with a custom Expo development client or EAS build. The AdMob native module does not run in Expo Go.
3. Add the SDK config plugin to `app.json` with real iOS and Android AdMob app IDs.
4. Replace `src/components/AdBanner.tsx` with the SDK banner component and test ad unit IDs.
5. Keep `EXPO_PUBLIC_ADS_ENABLED=true` only in builds that use the real banner component.
6. Add Google UMP or another required consent flow for regions that require ad consent.
7. If the ad configuration requests IDFA or tracking, add an ATT prompt and `NSUserTrackingUsageDescription`.
8. Add the current `SKAdNetworkItems` list required by Google or the chosen ad network.
9. Replace test ad unit IDs with production ad unit IDs only after validation.
10. Recapture all App Store screenshots so no placeholder ad UI appears.

## Privacy labels that change after real ads ship

Verify against the ad network's current Apple privacy guidance before submitting. Common flips for an AdMob style build are:

- Advertising: Yes in age rating and store questionnaires.
- Tracking: Yes if personalized ads, IDFA access, or cross-app tracking is enabled.
- Device ID: likely collected, linked, and used for third-party advertising if IDFA or equivalent identifiers are used.
- Advertising Data: likely collected for ad delivery, impressions, clicks, and measurement.
- Product Interaction: likely collected by the ad SDK for ads or analytics.
- Coarse Location: possible through IP based ad delivery or fraud prevention.
- Diagnostics: possible, depending on the SDK.

Do not answer Yes to ads, tracking, IDFA, or advertising data for the current no-ads binary.
