# NFC Toolkit

A free NFC tag reader/writer for iPhone and Android, built with Expo (SDK 57) and
[`react-native-nfc-manager`](https://github.com/revtel/react-native-nfc-manager).
There are no ads, no account and no paywall, and all data stays on the device.

## Features

**Read**
- UID (hex, decimal, reversed), tech list, NFC Forum type, capacity and a memory-usage meter
- Chip identification (NTAG210/212/213/215/216, Ultralight EV1 and others) through `GET_VERSION`, plus the NXP originality signature and scan counter
- Details for ISO 15693, ISO 7816 (AID and historical bytes) and FeliCa tags
- Every record decoded into a readable form, with Open and Copy buttons and the raw payload in hex
- Continuous reading mode and optional auto-open of links
- Share results, clone a tag into the writer, or copy it to other tags

**Write** (multiple records per tag, with a live size check against NTAG213/215/216)
- Text, URL, web search, location, address
- Contact (vCard), email, phone / FaceTime, SMS, 15 social networks
- Wi-Fi (WPA2, WPA/WPA2, WPA, WEP, open) and Bluetooth pairing
- iOS Shortcut, Android app launch (AAR), Home Assistant tag, custom URI or deep link
- Smart Poster, custom MIME type, external type, raw NDEF hex, empty record
- Verify after write, lock after write, and writing to password-protected tags
- Saved templates

**Tools**
- Copy/clone, batch write with automatic numbering (`{n}`, `{n:000}`), erase, format (Android) and lock
- Password protection: set, change or remove (NTAG21x / Ultralight EV1), optionally protecting reads too
- Dynamic URL: NTAG213/215/216 insert their UID and/or scan count into the URL on every scan
- Enable, disable and read the scan counter
- Memory dump: NTAG/Ultralight pages, ISO 15693 blocks, MIFARE Classic sectors (Android, tries default keys); shareable as text
- Advanced commands: raw NFC-A, ISO-DEP (APDU) and NFC-V commands, with presets
- History with search, JSON backup export and import, and settings

## Running it on your phone

NFC needs native code, so **Expo Go won't work**. Use one of the options below.

### Android (easiest)
With the phone plugged in over USB and USB debugging enabled:

```bash
npx expo run:android --variant release
```

You can also sideload a pre-built APK from `android/app/build/outputs/apk/release/app-release.apk`,
or build one in the cloud:

```bash
npx eas-cli@latest build -p android --profile preview
```

### iPhone
Apple only allows NFC tag access on apps signed by a **paid Apple Developer account** ($99/yr).
Free "Personal Team" signing does not include the NFC capability. With a paid account:

```bash
npx expo run:ios --device --configuration Release
```

Or use `npx eas-cli@latest build -p ios --profile development`.
The iOS Simulator has no NFC hardware.

## Platform differences

| | iPhone | Android |
|---|---|---|
| Read/write NDEF, lock, erase | ✅ | ✅ |
| Password, counter, dynamic URL, NTAG memory dump | ✅ | ✅ |
| Format blank tags | ❌ (most tags ship pre-formatted) | ✅ |
| MIFARE Classic | ❌ (iOS limitation) | ✅ on NXP-chip phones |
| Tap to join Wi-Fi / pair Bluetooth | ❌ (iOS ignores these) | ✅ |
| Launch app record | ❌ | ✅ |

On iPhone, the best way to run automations is Shortcuts → Automation → NFC, which works with any tag.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test          # NDEF encoder/decoder tests (no device needed)
```

Code layout:
- `src/lib/ndef.ts`: NDEF message encoding and decoding
- `src/lib/records.ts`: every writable record type (fields, validation, encoder)
- `src/lib/describe.ts`: turns any record into readable data
- `src/lib/nfc.ts`: session handling (iOS sheet, Android overlay, cancel, errors)
- `src/lib/type2.ts`: NTAG/Ultralight commands (password, mirror, counter, raw writes, dump)
- `src/lib/tagops.ts`: high-level operations used by the screens
- `src/app/`: Expo Router screens
