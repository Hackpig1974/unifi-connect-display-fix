# UniFi Connect Display — Protect App Manual Update Fix

> **Community workaround** — not affiliated with Ubiquiti.  
> Tested on UDM Pro running UniFi Connect 3.24.14 with UC Display, UC Display 7, and UC Display 13.

---

> 🚀 **Stay tuned** — a portable Windows app is coming that makes this entire process point-and-click. No SSH, no command line, no hassle. Watch this repo for updates.

---

## The Problem

UC Displays get stuck on old versions of the UniFi Protect app. The console shows an available update, but the displays never reboot or install it. No error is shown in the WebUI — it just silently fails.

## Why It Happens

After SSH investigation of a UDM Pro — including the firmware directory, PostgreSQL database, and Ubiquiti's firmware API — here is my best theory of what is happening:

- The console **correctly downloads** the latest Protect APK from Ubiquiti's servers — the file is valid and uncorrupted
- The console then tries to **push** the file to the displays over its management channel
- That push mechanism is **broken** — the display never receives or installs the file
- The WebUI **manual upload** path uses a completely different code path that **works correctly** — it parses the APK, registers it in PostgreSQL, and the display fetches it successfully

**The fix:** Download the APK directly from Ubiquiti and upload it through the WebUI. Same file, working code path.

---

## Two Methods

| | Simple Method | SSH Method |
|---|---|---|
| **Requires SSH** | No | Yes |
| **Technical level** | Beginner | Intermediate |
| **Best for** | Most users | Advanced users / troubleshooting |

---

## ✅ Simple Method (No SSH Required)

This is the quickest path for most users. No command line needed.

### 1 — Find the Latest Version

Open this URL in your browser to see all available Protect app versions from Ubiquiti's firmware API:

```
https://fw-update.ubnt.com/api/firmware?filter=eq~~product~~protect-android-app&filter=eq~~platform~~android-app&filter=eq~~channel~~release&limit=20&sort=-created
```

It returns JSON. Look for the first entry (the latest version) and find the `href` field inside `_links > data`. It will look like:

```
https://fw-download.ubnt.com/data/protect-android-app/e3a3-android-app-3.2.0-616-18dd4fc8-1703-4134-ba69-625793d57077.apk
```

### 2 — Download the APK

Paste that URL directly into your browser address bar and download the file. It is a plain `.apk` file (130–200 MB).

### 3 — Upload Through the WebUI

1. Open the UniFi Connect WebUI
2. Click on any Display device
3. Scroll to the **Manage** section
4. Click **Manage Apps**
5. Click the **upload icon** (top right of the dialog)
6. Select the APK file you just downloaded
7. Confirm the upload

The console will parse and register it. It will appear in the App dropdown for your displays.

> **Note:** You may need to refresh your browser before the new version appears.

### 4 — Assign to Each Display

1. Click on each display in the WebUI
2. Under **Mode**, set Display Mode to **Android App**
3. In the **App** dropdown, select the newly uploaded version
4. The display will reboot and install the update
5. Verify the version in the Protect app settings after reboot

> **Note:** In my case the update applied to all displays simultaneously.

---

## 🔧 SSH Method (Advanced)

Use this method if the Simple Method doesn't work, or if you want to verify the file the console already downloaded rather than downloading again.

### Prerequisites

- SSH access enabled on your console (login is `root`)
- A computer with SCP capability (Windows 10/11 has this built in)

### Step 1 — Enable SSH on Your Console

1. Log into your UniFi OS console WebUI
2. Go to **Settings → System → SSH**
3. Enable SSH and **set a password** — note this password, you will need it
4. Note your console's IP address

Then connect:

```bash
ssh root@<your-console-ip>
```

When prompted, use the password you set in the SSH settings above.

### Step 2 — Check Available Versions

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

### Step 3 — Locate the Already-Downloaded APK

```bash
ls -la /volume1/.srv/unifi-connect/firmware/
```

The console almost certainly already downloaded the latest version. Verify integrity:

```bash
md5sum /volume1/.srv/unifi-connect/firmware/<filename>.apk
```

Compare the MD5 against the value from the API in Step 2. If it matches, skip Step 4.

### Step 4 — Download the APK (If Needed)

```bash
cd /volume1/.srv/unifi-connect/firmware/
curl -O "<paste the full URL from Step 2 here>"
```

### Step 5 — Copy to Your Computer

From your **local machine** (not the SSH session):

```cmd
scp root@<your-console-ip>:/volume1/.srv/unifi-connect/firmware/<filename>.apk C:\Users\<youruser>\Downloads\
```

> **Tip:** Avoid destination paths with spaces.

### Steps 6 & 7 — Upload and Assign

Follow **Steps 3 and 4** from the Simple Method above.

---

## Troubleshooting

**Upload rejected with "Unsupported Format"**  
Only plain `.apk` files are accepted. Do not use `.apkm` or `.apkx` bundle files. Files from Ubiquiti's firmware servers are plain APKs.

**Display does not reboot after selecting the new version**  
Try refreshing the WebUI and assigning again. You can also check logs via SSH:
```bash
tail -f /volume1/.srv/unifi-connect/log/apk.log
```

**MD5 does not match**  
The file is corrupt. Delete it and re-download.

**SSH connection refused**  
Verify SSH is enabled in **UniFi OS → Settings → System → SSH**. Username is `root`, password is the one set in that same section.

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

A full Word document with extended background, root cause theory, and troubleshooting is included in this repository.

---

*Community guide — not affiliated with Ubiquiti. Use at your own risk.*
