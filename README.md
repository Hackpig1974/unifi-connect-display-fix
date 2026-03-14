# UniFi Connect Display — Protect App Manual Update Fix

> **Community workaround** — not affiliated with Ubiquiti.  
> Tested on UDM Pro running UniFi Connect 3.24.14 with UC Display, UC Display 7, and UC Display 13.

---

## The Problem

UC Displays get stuck on old versions of the UniFi Protect app. The console shows an available update, but the displays never reboot or install it. No error is shown in the WebUI — it just silently fails.

## Why It Happens

After SSH investigation of a UDM Pro — including the firmware directory, PostgreSQL database, and Ubiquiti's firmware API — here is my best theory of what is happening:

- The console **correctly downloads** the latest Protect APK from Ubiquiti's servers — the file is valid and uncorrupted
- The console then tries to **push** the file to the displays over its management channel
- That push mechanism is **broken** — the display never receives or installs the file
- The WebUI **manual upload** path uses a completely different code path that **works correctly** — it parses the APK, registers it in PostgreSQL, and the display fetches it successfully

**The fix:** Pull the already-downloaded APK off the console and re-upload it through the WebUI. Same file, working code path.

---

## Prerequisites

- UDM Pro (or other UniFi OS console) running UniFi Connect
- SSH access enabled on your console (login is `root`)
- UC Displays adopted and visible in the UniFi Connect WebUI
- A computer with SCP capability (Windows 10/11 has this built in)
- The Protect app currently stuck on an old version on your displays

---

## Step 1 — Enable SSH on Your Console

If SSH is not already enabled:

1. Log into your UniFi OS console WebUI
2. Go to **Settings → System → SSH**
3. Enable SSH and **set a password** — note this password, you will need it
4. Note your console's IP address

Then connect via SSH from your computer:

```bash
ssh root@<your-console-ip>
```

When prompted for a password, use the password you set in the SSH settings above.

---

## Step 2 — Check Available Protect App Versions

From your SSH session, run the following command to query Ubiquiti's firmware API and display available versions in a readable format:

```bash
curl -s "https://fw-update.ubnt.com/api/firmware?filter=eq~~product~~protect-android-app&filter=eq~~platform~~android-app&filter=eq~~channel~~release&limit=20&sort=-created" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for f in data['_embedded']['firmware']:
    print('Version:', f['version'])
    print('URL:', f['_links']['data']['href'])
    print()
"
```

This outputs a clean list like:

```
Version: v3.2.0-616
URL: https://fw-download.ubnt.com/data/protect-android-app/e3a3-android-app-3.2.0-616-...apk

Version: v3.1.0-599
URL: https://fw-download.ubnt.com/data/protect-android-app/f3a8-android-app-3.1.0-599-...apk
```

Note the **URL** of the version you want to install (typically the latest at the top of the list).

---

## Step 3 — Locate the Already-Downloaded APK

The console has almost certainly already downloaded the latest version automatically. Check first:

```bash
ls -la /volume1/.srv/unifi-connect/firmware/
```

You should see a file like:

```
e3a3-android-app-3.2.0-616-18dd4fc8-1703-4134-ba69-625793d57077.apk
```

Verify the file is not corrupt by checking its MD5 against the value shown in the API output from Step 2:

```bash
md5sum /volume1/.srv/unifi-connect/firmware/<filename>.apk
```

If the MD5 matches ✓ — skip to Step 5. If the file is missing or corrupt, continue to Step 4.

---

## Step 4 — Download the APK (If Needed)

If the file was missing or corrupt, download it directly using the URL from Step 2:

```bash
cd /volume1/.srv/unifi-connect/firmware/
curl -O "<paste the full URL from Step 2 here>"
```

> The file will be large (130–200 MB). Wait for the download to complete before proceeding.

---

## Step 5 — Copy the APK to Your Computer

From your **local machine** (not the SSH session), open Command Prompt or PowerShell:

```cmd
scp root@<your-console-ip>:/volume1/.srv/unifi-connect/firmware/<filename>.apk C:\Users\<youruser>\Downloads\
```

For example:

```cmd
scp root@192.168.1.1:/volume1/.srv/unifi-connect/firmware/e3a3-android-app-3.2.0-616-18dd4fc8-1703-4134-ba69-625793d57077.apk C:\Users\ddowning\Downloads\
```

> **Tip:** Avoid destination paths with spaces. Downloading straight to `Downloads\` keeps it simple.

---

## Step 6 — Upload Through the UniFi Connect WebUI

This is the key step — uploading through the WebUI triggers the correct code path that actually works.

1. Open the UniFi Connect WebUI in your browser
2. Click on any Display device
3. Scroll down to the **Manage** section
4. Click **Manage Apps**
5. Click the **upload icon** (top right of the Manage Apps dialog)
6. Browse to the APK file you downloaded in Step 5
7. Select it and confirm the upload

The console will parse the APK and register it in its database. It will now appear in the App dropdown for your displays.

> **Note:** You may need to refresh your browser before the new version appears in the dropdown.

---

## Step 7 — Assign the New Version to Your Displays

1. Click on each display in the WebUI
2. Under **Mode**, set Display Mode to **Android App**
3. In the **App** dropdown, select the newly uploaded version
4. The display will reboot and install the new Protect app
5. After reboot, verify the version in the Protect app settings on the display

> **Note:** In my case the new version was applied to all displays simultaneously — you may not need to repeat this for each display individually.

---

## Troubleshooting

### Upload rejected with "Unsupported Format"
The WebUI only accepts plain `.apk` files. Do not use `.apkm` or `.apkx` bundle files. Files downloaded from Ubiquiti's firmware servers are plain APKs and will be accepted.

### Display does not reboot after selecting the new version
This is the original bug this guide works around. If it happens after uploading via the WebUI, try:
- Refreshing the WebUI and assigning the version again
- Forcing a reboot of the display from the WebUI, then re-assigning
- Checking the console logs via SSH: `tail -f /volume1/.srv/unifi-connect/log/apk.log`

### MD5 does not match
The downloaded file is corrupt. Delete it and re-download using the curl command in Step 4.

### SSH connection refused
Verify SSH is enabled in **UniFi OS → Settings → System → SSH**. Confirm you are using `root` as the username and the password you set in that same section.

---

## Tested Environment

| Component | Version |
|-----------|---------|
| UniFi Connect | 3.24.14 |
| Protect App (before) | 1.21.0 |
| Protect App (after) | 3.2.0-616 |
| Hardware | UC Display, UC Display 7, UC Display 13 |
| Console | UDM Pro |

---

## Detailed Guide

A full Word document with extended background, root cause theory, and troubleshooting is included in this repository for those who want the complete writeup.

---

*Community guide — not affiliated with Ubiquiti. Use at your own risk.*
