import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;
const POSTED_FOLDER_ID = process.env.POSTED_FOLDER_ID;

const MEDIA_DIR = path.join(process.cwd(), "media");

// -------------------- AUTH --------------------
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

// -------------------- HELPERS --------------------
function getClipNumber(name) {
  const m = name.match(/^clip_(\d+)\.mp4$/i);
  return m ? Number(m[1]) : null;
}

// -------------------- MAIN --------------------
async function run() {
  console.log("🚀 Upload workflow started");

  // 1️⃣ Clear GitHub Pages media
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

  for (const f of fs.readdirSync(MEDIA_DIR)) {
    if (f.endsWith(".mp4")) {
      fs.unlinkSync(path.join(MEDIA_DIR, f));
    }
  }
  console.log("🧹 Old GitHub Pages media deleted");

  // 2️⃣ List ONLY files that are DIRECT children of SOURCE folder
  const listRes = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and mimeType='video/mp4' and trashed=false`,
    fields: "files(id, name, parents)",
    pageSize: 1000,
  });

  const files = listRes.data.files || [];
  if (!files.length) {
    throw new Error("❌ No video files found in SOURCE folder");
  }

  // 3️⃣ Strict numeric sort ASCENDING
  const sorted = files
    .map(f => ({ ...f, num: getClipNumber(f.name) }))
    .filter(f => f.num !== null)
    .sort((a, b) => a.num - b.num);

  if (!sorted.length) {
    throw new Error("❌ No valid clip_XX.mp4 files found");
  }

  // ✅ ALWAYS pick SMALLEST number
  const file = sorted[0];
  console.log(`🎯 Selected (LOWEST): ${file.name}`);

  // 4️⃣ Download
  const destPath = path.join(MEDIA_DIR, file.name);
  const dest = fs.createWriteStream(destPath);

  const res = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    res.data.pipe(dest).on("finish", resolve).on("error", reject);
  });

  console.log(`⬇️ Downloaded ${file.name}`);

  // 5️⃣ MOVE file → postedFiles (REMOVE SOURCE PARENT EXPLICITLY)
  await drive.files.update({
    fileId: file.id,
    addParents: POSTED_FOLDER_ID,
    removeParents: SOURCE_FOLDER_ID,
    fields: "id, parents",
  });

  console.log(`📦 Moved ${file.name} → postedFiles`);
  console.log("✅ Upload workflow completed successfully");
}

run().catch(err => {
  console.error("🔥 Upload failed:", err.message);
  process.exit(1);
});

