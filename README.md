> [!CAUTION]
> The Buttons Are Deprecated, So They won't Work!
> 
> Due to WhatsApp's Strict regulations, Sending More than 50 people at one day can cause you a temporary Or permanent ban.

# 🎩 WhatsApp Broadcaster Bot

A WhatsApp bulk messaging bot built on Baileys.
Connect using a Terminal Live **pair code** Method.
---

## ✨ Features

- 🔑 **Pair code login** › no QR code, works on headless servers
- 📊 **Dynamic CSV columns** › any column name becomes a `{placeholder}`
- ✏️ **Real-time progress** › a single WhatsApp message is edited live with a progress bar and time remaining
- ⏱ **Pre-send estimate** › shows expected duration before sending starts
- 🔘 **Interactive buttons** › add tap-to-respond buttons in your message template
- 📎 **Smart attachments** › auto-detects image / video / audio / document format
- 📋 **Delivery report** › full summary with failed numbers listed
- 🔄 **Auto-reconnect** › reconnects automatically on disconnections

---

## 📋 Requirements

- Node.js **v18 or higher**
- An active WhatsApp account 

---

## 🚀 Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/amanmohdtp/broadcaster-bot.git
cd broadcaster-bot

# 2. Install dependencies
npm install

# 3. Set up your phone number
cp .env.example .env
# then edit .env and fill in your number

# 4. Start the bot
node index.js
```

---

## 🔐 .env Setup

Create a `.env` file in the bot folder (or copy from `.env.example`):

```env
PHONE_NUMBER=919876543210
```

| Variable | Description |
|----------|-------------|
| `PHONE_NUMBER` | Your WhatsApp number with country code, no `+` or spaces |

> India: `919876543210` · USA: `13243123456` · UK: `447911123456`

The bot reads this on startup to request the pairing code. Once linked, `auth_info/` stores the session and the number is no longer needed until you re-pair.

---

## 📁 File Structure

```
broadcaster-bot/
├── index.js          ← Bot code
├── package.json
├── .env              ← Your phone number (gitignored)
├── data.csv          ← Recipient list  (you create/edit this)
├── msg.txt           ← Message template (you create/edit this)
├── file.jpg          ← Optional attachment (any name starting with "file")
└── auth_info/        ← Auto-created after first login
```

---

## 📊 data.csv ⟩ Recipient List

### Rules
- The **first row** defines all column names › you choose them freely.
- Column names are **case-insensitive** (`WhatsApp`, `WHATSAPP`, and `whatsapp` all work).
- The **`whatsapp`** column is **required**. It must contain the full number with country code and no spaces or `+`.
- All other columns are optional and become `{placeholders}` in your message.

### Example

```csv
ID,Name,Phone,WhatsApp,Gender,Age,Place
1,Alice,9876543210,919876543210,Female,24,"India"
2,Bob,1234567890,13243123456,Male,30,"USA"
3,Charlie,447911123456,447911123456,Male,28,"UK"
```

> **WhatsApp column format:** country code + number, no `+`, no spaces.  
> India: `919876543210` · USA: `13243123456` · UK: `447911123456`

You can add **any extra columns** and reference them as placeholders:

```csv
ID,Name,WhatsApp,Department,Salary
E001,Alice,919876543210,Engineering,85000
```

Then use `{department}` and `{salary}` in your message.

---

## ✉️ msg.txt ⟩ Message Template

### Placeholders

Use `{columnname}` (lowercase) anywhere in the message body or button responses.  
The bot replaces each `{placeholder}` with that row's value before sending.

| Placeholder | Replaced with |
|-------------|--------------|
| `{name}` | Name column value |
| `{id}` | ID column value |
| `{whatsapp}` | WhatsApp column value |
| `{place}` | Place column value |
| … | Any column you define |

### WhatsApp Formatting

All standard WhatsApp markdown is supported:

| Syntax | Result |
|--------|--------|
| `*text*` | **bold** |
| `_text_` | *italic* |
| `~text~` | ~~strikethrough~~ |
| `` `text` `` | `highlight` |
| ` ```text``` ` | monospace |
| Empty line | Line break / paragraph |

Works in any language

### Interactive Buttons

Add tap-to-respond buttons using special tags:

#### Button definition
```
<b1>Yes, confirm<b1>
```
- `b` followed by a **unique number** (1, 2, 3 …)
- The text between the tags is the button label
- ⚠️ No `{placeholders}` in button labels

#### Normal response (sent as a new message when tapped)
```
<r1>Thanks {name}! Your registration is confirmed.<r1>
```
- Same number as the button it responds to
- ✅ `{placeholders}` are supported

#### Reply response (sent as a reply to the original bulk message when tapped)
```
<br1>Got it {name}. Reference ID: {id}<br1>
```
- `br` + same number as the button
- ✅ `{placeholders}` are supported
- Message is threaded under the original

You can define **both** `<r1>` and `<br1>` for the same button & the bot will send both.

#### Full example with buttons

```
Hello *{name}* 👋

You have been selected for our entrance exam.
Your ID is `{id}` and your exam center is _{place}_.

Would you like to participate?

<b1>✅ Yes, I'm in<b1>
<b2>❌ No thanks<b2>

<r1>Wonderful! {name}, you're officially enrolled. Welcome aboard! 🎉<r1>
<r2>No problem {name}, maybe next time!<r2>
<br1>✅ Enrollment confirmed for You!<br1>

~NEW ACADEMY~
```

**Rules for buttons:**
- Each button number must be **unique** (no `<b1>` twice)
- Numbers don't need to be sequential » `b1`, `b5`, `b12` is fine
- A button without a matching `r` or `br` entry simply does nothing when tapped

---

## 📎 Attachments

Place one file in the bot folder named **`file`** followed by any extension:

| File name | Sent as |
|-----------|---------|
| `file.jpg` / `file.png` / `file.webp` | Image (with caption) |
| `file.mp4` / `file.mov` | Video (with caption) |
| `file.mp3` / `file.ogg` / `file.m4a` | Audio |
| `file.pdf` / `file.docx` / `file.xlsx` | Document (with caption) |
| Any other extension | Document |

Only **one** attachment per send. Remove or rename the file to send without an attachment.

---

## 📈 Progress & Reports

After sending `/sendall` the bot:

1. Shows a **preview** with recipient count, columns, attachment, buttons, and estimated time
2. Sends a **live progress message** that is edited in real-time:

```
⏳ Sending…  47 / 200  (23%)
██░░░░░░░░

✅ Success: 45    ❌ Failed: 2
⏱  Time left: ~5m 12s
```

3. After completion the progress message updates to show final stats.
4. Sends a **summary report**:

```
📊 Send Report
━━━━━━━━━━━━━━━━━━
✅ Sent      : 195
❌ Failed    : 5
📦 Total     : 200
⏱  Duration  : 7m 3s
━━━━━━━━━━━━━━━━━━
```

5. Sends the **failed numbers list** (if any):

| Failures | Behaviour |
|----------|-----------|
| 0 | Nothing extra sent |
| 1 – 100 | Listed 10 per message |
| > 100 | Summary only ("too many to list") |

---

## ⌨️ Commands

| Command | Where | Action |
|---------|-------|--------|
| `/sendall` | Self DM to bot number | Start bulk send |

---

## ⚙️ Configuration

Everything is controlled by these files:

| File | Edit to… |
|------|----------|
| `data.csv` | Change recipients |
| `msg.txt` | Change message, formatting, buttons |
| `file.*` | Change or remove the attachment |
| `.env` | Edit Environmental Variables In this File | 

---

## 🔒 Session & Re-login

Session credentials are stored in `auth_info/`.  
- Bot reconnects automatically on network drops.
- To log out and re-pair: delete the `auth_info/` folder and restart.
- Never share the `auth_info/` folder - it gives full access to your WhatsApp.

---

## ⚠️ Disclaimer

This bot uses an **unofficial** WhatsApp API (Baileys).  
- Use responsibly and in accordance with [WhatsApp's Terms of Service](https://www.whatsapp.com/legal/terms-of-service).
- Sending unsolicited bulk messages may result in your number being banned.
- The authors are not responsible for any account restrictions.

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `@whiskeysockets/baileys` | WhatsApp Web API |
| `@hapi/boom` | HTTP error handling (Baileys dep) |
| `dotenv` | Loads `.env` variables |
| `mime-types` | File type detection |
| `pino` | Logger (Baileys dep) |

---

## 📄 License

MIT © amanmohdtp

STAR ⭐ THE REPO IF YOU DID LIKE IT
