# KeyForge

English | [简体中文](./README.zh-CN.md)

A **LessPass v2-compatible** deterministic password generator with local profile memory, custom symbol subsets, counter tracking, and AES-256-CTR encrypted sync.

> Inspired by [LessPass](https://github.com/lesspass/lesspass). KeyForge keeps the stateless, master-password-free architecture while adding everyday usability enhancements for personal multi-device workflows.

---

## Features

- **100% LessPass v2 Compatible**
  - Uses `PBKDF2-HMAC-SHA256` (100,000 iterations) + deterministic `BigInt` character extraction.
  - With default symbols enabled, generates the exact same passwords as official LessPass v2.
- **Custom Symbol Subsets per Site**
  - Freely toggle individual special characters per platform (e.g. for legacy sites that only accept `!@#$`).
- **Local Site Profile Memory**
  - Saves site domain, username/login, re-randomization counter, password length, and custom symbol preferences locally (`localStorage` / `chrome.storage.local`).
  - **Never stores** your master password or generated passwords.
  - **Auto-complete dropdown** when typing in the `Site` field, plus automatic domain detection in the browser extension.
- **One-Click Re-randomization (`+1`)**
  - Track how many times a site's password has been rotated (`Counter`) and increment it with one click.
- **Master Password Visual Fingerprint**
  - Displays 3 deterministic colored icons as you type your master password so you can visually spot typos before generating.
- **Encrypted Backup & Garbled-Preview Import (`AES-256-CTR`)**
  - Export profiles as a `.mlp` encrypted file or copyable Base64 text protected by your master password.
  - During import, decrypted bytes are shown in a live preview box — a matching password shows clean JSON ready for merge/replace, while a wrong password produces obvious garbled text.

---

## Deployment & Installation

### 1. Browser Extension (Chrome / Edge, Manifest V3)

Since `dist/` is generated locally during build, build the extension package first:

```bash
git clone https://github.com/aDobeZ/KeyForge.git
cd KeyForge
npm install
npm run build
```

Then load it into your browser:
1. Open `chrome://extensions/` in Chrome (or `edge://extensions/` in Edge).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `dist/extension` folder inside this project.
4. Click the **KeyForge** icon in the toolbar (you can pin the icon to the toolbar for quick access). It automatically reads the current tab's domain and matches saved profiles.

### 2. Offline PWA (Android / Mobile)

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys `dist/pwa/` to GitHub Pages on every push to `main`:
1. In your GitHub repository, go to **Settings -> Pages -> Build and deployment -> Source** and select **GitHub Actions**.
2. Open the deployed Pages URL in mobile Chrome/Edge and tap **Add to Home screen** to use completely offline.

### 3. Standalone Single-File HTML (Desktop)

After running `npm run build`, you can directly double-click `dist/mylesspass-standalone.html` to use KeyForge in any browser without installation.

---

## Local Development

```bash
npm install
npm test      # Run Vitest unit tests (LessPass v2 vectors & AES-CTR sync)
npm run build # Build PWA, Browser Extension, and Standalone HTML
```

---

## Security Note

All cryptographic operations (`PBKDF2`, `HMAC-SHA256`, `AES-256-CTR`) run strictly in-browser via the **Web Crypto API**. No network requests or backend servers are used.
