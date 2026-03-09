import { readFileSync as _readEnv, existsSync as _envExists } from "fs";

const _origEmit = process.emit.bind(process);
process.emit = function (event, ...args) {
  if (event === "warning" && args[0]?.code === "DEP0180") return false;
  return _origEmit(event, ...args);
};

if (_envExists(".env")) {
  _readEnv(".env", "utf8").split("\n").forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const eq = clean.indexOf("=");
    if (eq === -1) return;
    const key = clean.slice(0, eq).trim();
    const val = clean.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  });
}

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} from "@whiskeysockets/baileys";

import pino from "pino";
import fs from "fs";
import path from "path";
import { lookup } from "mime-types";
import NodeCache from "node-cache";

const msgRetryCounterCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

const PHONE_NUMBER = (process.env.PHONE_NUMBER || "").replace(/\D/g, "");
if (!PHONE_NUMBER) {
  console.error("❌ PHONE_NUMBER not set in .env");
  process.exit(1);
}

const authDir = "./session";
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

process.on("unhandledRejection", (err) => console.error("Unhandled:", err?.message || err));
process.on("uncaughtException",  (err) => console.error("Uncaught:",  err?.message || err));
process.on("SIGINT", () => { console.log("\nShutting down..."); process.exit(0); });

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "CSV has no data rows." };
  const parseRow = (line) => {
    const cols = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase());
  if (!headers.includes("whatsapp")) return { rows: [], error: 'No "whatsapp" column in data.csv.' };
  const rows = lines.slice(1).map(line => {
    const cols = parseRow(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
  return { rows };
}

function parseTemplate(raw) {
  const listRows = [], responses = {}, seen = new Set();
  let m;

  const bReg = /<b(\d+)>([\s\S]*?)<b\1>/g;
  while ((m = bReg.exec(raw)) !== null) {
    if (seen.has(m[1])) throw new Error(`Duplicate <b${m[1]}>.`);
    seen.add(m[1]);
    listRows.push({ id: m[1], label: m[2].trim() });
  }

  const rReg = /<r(\d+)>([\s\S]*?)<r\1>/g;
  while ((m = rReg.exec(raw)) !== null) {
    responses[m[1]] = responses[m[1]] || {};
    responses[m[1]].text = m[2].trim();
  }

  const brReg = /<br(\d+)>([\s\S]*?)<br\1>/g;
  while ((m = brReg.exec(raw)) !== null) {
    responses[m[1]] = responses[m[1]] || {};
    responses[m[1]].replyText = m[2].trim();
  }

  const text = raw
    .replace(/<b(\d+)>[\s\S]*?<b\1>/g, "")
    .replace(/<r(\d+)>[\s\S]*?<r\1>/g, "")
    .replace(/<br(\d+)>[\s\S]*?<br\1>/g, "")
    .trim();

  return { text, listRows, responses };
}

const fill    = (t, row) => t.replace(/\{(\w+)\}/g, (_, k) => row[k.toLowerCase()] ?? `{${k}}`);
const toJid   = (n) => `${String(n).replace(/\D/g, "")}@s.whatsapp.net`;
const fmtTime = (s) => {
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60), r = Math.ceil(s % 60);
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
};
const bar = (pct) => {
  const f = Math.round(pct / 10);
  return "█".repeat(f) + "░".repeat(10 - f);
};
const findAttachment = () => fs.readdirSync(".").find(f => /^file\..+$/i.test(f)) || null;
const fileCat = (mime) => {
  if (!mime) return "document";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
};
const getText = (msg) =>
  msg.message?.conversation ||
  msg.message?.extendedTextMessage?.text || "";

async function sendMsg(sock, jid, text, attachPath, quotedMsg = null) {
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (!attachPath) return sock.sendMessage(jid, { text }, opts);
  const mime = lookup(attachPath) || "application/octet-stream";
  const cat  = fileCat(mime);
  const buf  = fs.readFileSync(attachPath);
  const fileName = path.basename(attachPath);
  switch (cat) {
    case "image": return sock.sendMessage(jid, { image: buf, caption: text }, opts);
    case "video": return sock.sendMessage(jid, { video: buf, caption: text }, opts);
    case "audio":
      await sock.sendMessage(jid, { audio: buf, mimetype: mime, ptt: false }, opts);
      if (text) await sock.sendMessage(jid, { text }, opts);
      return;
    default:
      return sock.sendMessage(jid, { document: buf, mimetype: mime, fileName, caption: text }, opts);
  }
}

async function sendWithList(sock, jid, text, listRows, attachPath, quotedMsg = null) {
  if (!listRows.length) return sendMsg(sock, jid, text, attachPath, quotedMsg);
  const opts = quotedMsg ? { quoted: quotedMsg } : {};
  if (attachPath) await sendMsg(sock, jid, "", attachPath);
  try {
    return await sock.sendMessage(jid, {
      text,
      footer: "",
      buttonText: "📋 View Options",
      sections: [{
        title: "Options",
        rows: listRows.map(r => ({ rowId: `row_${r.id}`, title: r.label })),
      }],
    }, opts);
  } catch (err) {
    console.log(`⚠️ List failed, falling back: ${err.message}`);
    const numbered = listRows.map(r => `${r.id}. ${r.label}`).join("\n");
    return sendMsg(sock, jid, `${text}\n\n${numbered}\n\nReply with the number of your choice.`, null, quotedMsg);
  }
}

let connectionAttempts = 0;
const listStateMap = new Map();

const startBot = async () => {
  let isOpen = false;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    let waVersion = [2, 3000, 1015901307];
    try {
      const { version } = await fetchLatestBaileysVersion();
      waVersion = version;
      console.log(`WA version: ${version.join(".")}`);
    } catch {
      console.log("Using fallback WA version");
    }

    const logger = pino({ level: "silent" });

    const sock = makeWASocket({
      version: waVersion,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      msgRetryCounterCache,
      maxMsgRetryCount: 0,
      getMessage: async () => undefined,
      shouldIgnoreJid: jid => isJidBroadcast(jid) || jid.includes("@newsletter"),
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingRequested = false;

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting") {
        console.log("Connecting to WhatsApp...");
        if (!state.creds.registered && !pairingRequested) {
          pairingRequested = true;
          await new Promise(r => setTimeout(r, 3000));
          if (isOpen) return;
          try {
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            console.log("\n" + "=".repeat(42));
            console.log(`  🔑 PAIRING CODE : ${code}`);
            console.log("=".repeat(42));
            console.log("1️⃣  WhatsApp → Settings → Linked Devices");
            console.log("2️⃣  Link a Device → Use Phone Number");
            console.log(`3️⃣  Enter code : ${code}`);
            console.log("⏳ Expires in ~60 seconds\n");
          } catch (err) {
            pairingRequested = false;
            console.error("Pairing failed:", err.message);
          }
        }
      }

      if (connection === "close") {
        isOpen = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason     = lastDisconnect?.error?.message || "unknown";
        if (statusCode === DisconnectReason.loggedOut) {
          console.log("\nLogged out — clearing session.\n");
          fs.rmSync(authDir, { recursive: true, force: true });
          process.exit(0);
        }
        connectionAttempts++;
        const delay = Math.min(connectionAttempts * 3000, 30000);
        console.log(`Connection closed (${reason}). Retry in ${delay / 1000}s...`);
        setTimeout(startBot, delay);
      }

      if (connection === "open") {
        isOpen             = true;
        connectionAttempts = 0;
        pairingRequested   = true;

        const num  = sock.user.id.split(":")[0];
        const name = sock.user.name || "User";

        console.log("\n" + "=".repeat(42));
        console.log("  ✅ BOT CONNECTED");
        console.log("=".repeat(42));
        console.log(`  📱 Number : +${num}`);
        console.log(`  👤 Name   : ${name}`);
        console.log(`  🕐 Time   : ${new Date().toLocaleString()}`);
        console.log("=".repeat(42) + "\n");

        const selfJid = `${num}@s.whatsapp.net`;
        try {
          await sock.sendMessage(selfJid, {
            text:
              `✅ *Broadcast Bot Connected*\n\n` +
              `👤 *${name}*\n` +
              `📱 +${num}\n\n` +
              `📁 Make sure *data.csv* and *msg.txt* are ready.\n` +
              `Send */sendall* to start broadcasting.`,
          });
        } catch { }
      }
    });

    let broadcastRunning = false;

    const runBroadcast = async (selfJid) => {
      if (broadcastRunning) {
        await sock.sendMessage(selfJid, { text: "⚠️ Broadcast already running." });
        return;
      }
      broadcastRunning = true;
      try {
        if (!fs.existsSync("data.csv")) {
          await sock.sendMessage(selfJid, { text: "❌ *data.csv* not found." }); return;
        }
        if (!fs.existsSync("msg.txt")) {
          await sock.sendMessage(selfJid, { text: "❌ *msg.txt* not found." }); return;
        }

        const { rows, error } = parseCSV("data.csv");
        if (error) { await sock.sendMessage(selfJid, { text: `❌ ${error}` }); return; }
        if (!rows.length) { await sock.sendMessage(selfJid, { text: "❌ data.csv is empty." }); return; }

        let parsed;
        try { parsed = parseTemplate(fs.readFileSync("msg.txt", "utf8")); }
        catch (e) { await sock.sendMessage(selfJid, { text: `❌ msg.txt error: ${e.message}` }); return; }

        const { text: msgText, listRows, responses } = parsed;
        const attachFile = findAttachment();
        const estSecs    = (rows.length * 2500) / 1000;

        await sock.sendMessage(selfJid, {
          text:
            `📢 *Broadcast Preview*\n${"─".repeat(20)}\n` +
            `👥 Recipients : ${rows.length}\n` +
            `⏱️ Est. time  : ${fmtTime(estSecs)}\n` +
            `${"─".repeat(20)}\n🚀 Starting in 3s...`,
        });
        await new Promise(r => setTimeout(r, 3000));

        const progressSent = await sock.sendMessage(selfJid, {
          text: `📤 Sending...  0 / ${rows.length}  (0%)\n░░░░░░░░░░\n\n✅ 0    ❌ 0\n⏳ ${fmtTime(estSecs)}`,
        });
        const progressKey = progressSent.key;

        let success = 0, failed = 0;
        const failedList = [];
        const startTime  = Date.now();

        for (let i = 0; i < rows.length; i++) {
          const row   = rows[i];
          const waRaw = (row.whatsapp || "").replace(/\D/g, "");

          if (!waRaw) {
            failed++;
            failedList.push(`${row.name || `Row ${i + 2}`} — no number`);
          } else {
            const recipJid  = toJid(waRaw);
            const finalText = fill(msgText, row);
            try {
              const sentMsg = await sendWithList(sock, recipJid, finalText, listRows, attachFile);
              if (listRows.length && sentMsg?.key) {
                const rowMap = {};
                listRows.forEach(r => {
                  rowMap[`row_${r.id}`] = { responses: responses[r.id] || {}, row, originalKey: sentMsg.key };
                });
                listStateMap.set(recipJid, rowMap);
              }
              success++;
              console.log(`✅ [${i + 1}/${rows.length}] ${row.name || waRaw}`);
            } catch (err) {
              failed++;
              failedList.push(`${row.name || "Unknown"} (${waRaw})`);
              console.log(`❌ [${i + 1}/${rows.length}] ${err.message}`);
            }
          }

          const elapsed   = (Date.now() - startTime) / 1000;
          const remaining = i + 1 < rows.length ? (elapsed / (i + 1)) * (rows.length - i - 1) : 0;
          const pct       = Math.round(((i + 1) / rows.length) * 100);
          await sock.sendMessage(selfJid, {
            text:
              `📤 Sending...  ${i + 1} / ${rows.length}  (${pct}%)\n${bar(pct)}\n\n` +
              `✅ ${success}    ❌ ${failed}\n⏳ ~${fmtTime(remaining)}`,
            edit: progressKey,
          });
          await new Promise(r => setTimeout(r, 1800 + Math.random() * 1200));
        }

        const totalElapsed = (Date.now() - startTime) / 1000;
        await sock.sendMessage(selfJid, {
          text:
            `🎉 Done!  ${rows.length} / ${rows.length}  (100%)\n${"█".repeat(10)}\n\n` +
            `✅ ${success}    ❌ ${failed}\n⏱️ ${fmtTime(totalElapsed)}`,
          edit: progressKey,
        });
        await sock.sendMessage(selfJid, {
          text:
            `📊 *Broadcast Report*\n${"─".repeat(20)}\n` +
            `✅ Sent     : ${success}\n❌ Failed   : ${failed}\n` +
            `👥 Total    : ${rows.length}\n⏱️ Duration : ${fmtTime(totalElapsed)}\n${"─".repeat(20)}`,
        });

        if (failedList.length && failedList.length <= 100) {
          for (let c = 0; c < failedList.length; c += 10) {
            const chunk = failedList.slice(c, c + 10);
            await sock.sendMessage(selfJid, {
              text: `⚠️ Failed (${c + 1}–${Math.min(c + 10, failedList.length)} of ${failedList.length})\n` +
                chunk.map((f, j) => `${c + j + 1}. ${f}`).join("\n"),
            });
            await new Promise(r => setTimeout(r, 600));
          }
        } else if (failedList.length > 100) {
          await sock.sendMessage(selfJid, { text: `⚠️ ${failedList.length} numbers failed. Check data.csv.` });
        }
      } finally {
        broadcastRunning = false;
      }
    };

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return;

      for (const msg of messages) {
        if (!msg.message) continue;
        const jid = msg.key.remoteJid;
        if (!jid || jid.includes("@broadcast") || jid.includes("@g.us")) continue;

        const selfJid  = `${sock.user.id.split(":")[0]}@s.whatsapp.net`;
        const isFromMe = !!msg.key.fromMe;

        if (isFromMe) {
          if (getText(msg).trim().toLowerCase() === "/sendall") await runBroadcast(selfJid);
          continue;
        }

        const selectedRowId = msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
        const rowState = listStateMap.get(jid);

        if (rowState && selectedRowId && rowState[selectedRowId]) {
          const { responses, row, originalKey } = rowState[selectedRowId];
          if (responses.text)
            await sock.sendMessage(jid, { text: fill(responses.text, row) });
          if (responses.replyText)
            await sock.sendMessage(jid, { text: fill(responses.replyText, row) },
              { quoted: { key: originalKey, message: { conversation: "" } } });
          continue;
        }

        if (rowState) {
          const raw = getText(msg).trim();
          if (/^\d+$/.test(raw) && rowState[`row_${raw}`]) {
            const { responses, row, originalKey } = rowState[`row_${raw}`];
            if (responses.text)
              await sock.sendMessage(jid, { text: fill(responses.text, row) });
            if (responses.replyText)
              await sock.sendMessage(jid, { text: fill(responses.replyText, row) },
                { quoted: { key: originalKey, message: { conversation: "" } } });
            continue;
          }
        }

        if (getText(msg).trim().toLowerCase() === "/sendall") await runBroadcast(selfJid);
      }
    });

  } catch (err) {
    console.error("Fatal:", err.message);
    setTimeout(startBot, 10000);
  }
};

console.clear();
console.log("\nBroadcast Bot starting...\n");
console.log(
  fs.existsSync(path.join(authDir, "creds.json"))
    ? "Found existing session, connecting...\n"
    : "No session found — will request pairing code...\n"
);
startBot();
