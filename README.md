# KeyForge

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

## Three Build Targets (One Codebase)

1. **Browser Extension (Manifest V3)** — `dist/extension/`
   - Open `chrome://extensions/` (or `edge://extensions/`), enable **Developer mode**, and click **Load unpacked** -> select `dist/extension`.
2. **Offline PWA** — `dist/pwa/`
   - Deployed automatically via GitHub Actions to GitHub Pages. Open on Android Chrome/Edge and tap **Add to Home screen** to use completely offline.
3. **Standalone Single-File HTML** — `dist/mylesspass-standalone.html`
   - Open directly in any desktop browser without installation.

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
