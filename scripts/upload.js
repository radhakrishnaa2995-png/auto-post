import fs from "fs";
import path from "path";
import { google } from "googleapis";
import fetch from "node-fetch";

const __dirname = new URL(".", import.meta.url).pathname;

// ENV
const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;
const POSTED_FOLDER_ID = process.env.POSTED_FOLDER_ID;
const GOOGLE_SERVICE_KEY = JSON.parse(process.env.GOOGLE_SERVICE_KEY);

// AUTH
const auth = new google.auth.JWT(
  GOOGLE_SERVICE_KEY.client_email,
  null,
  GOOGLE_SERVICE_KEY.private_key,
  ["https://www.googleapis.com/auth/drive"]
);

const drive = google.drive({ version: "v3", auth });

// HELPERS
function extractClipNumber(name) {
  const m = name.match(/clip_(\d+)\.mp4/i);
  return m ? Number(m[1]) : null;
}

async function clearMediaFolder() {
  const mediaDir = path.join(__dirname, "../media");
  if (!fs.existsSync(mediaDir)) return;

  for (const f of fs.readdirSync(mediaDir)) {
    if (f.endsWith(".mp4")) fs.unlinkSync(path.join(mediaDir, f));
  }
}

// MAIN
async function run() {
  console.log("🧹 Clearing GitHub Pages media...");
  await clearMediaFolder();

  console.log("📂 Fetching source files...");
  const res = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name, parents)",
  });

  const files = res.data.files
    .map(f => ({ ...f, n: extractClipNumber(f.name) }))
    .filter(f => f.n !== null)
    .sort((a, b) => a.n - b.n);

  if (!files.length) throw new Error("No clips found in source folder");

  const file = files[0];
  console.log(`🎯 Selected ${file.name}`);

  // DOWNLOAD
  const destPath = path.join(__dirname, "../media", file.name);
  const downloadRes = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    downloadRes.data.pipe(dest);
    dest.on("finish", resolve);
    dest.on("error", reject);
  });

  console.log(`⬇️ Downloaded ${file.name}`);

  // 🔥 CRITICAL FIX — MOVE FILE SAFELY
  const currentParents = file.parents?.join(",") || "";

  await drive.files.update({
    fileId: file.id,
    addParents: POSTED_FOLDER_ID,
    removeParents: currentParents,
    fields: "id, parents",
  });

  console.log(`📦 Moved ${file.name} → postedFiles`);
  console.log("✅ Upload workflow completed successfully");
}

run().catch(err => {
  console.error("🔥 Upload failed:", err.message);
  process.exit(1);
});
