import fs from "fs";
import path from "path";
import { google } from "googleapis";
import fetch from "node-fetch";

const __dirname = new URL(".", import.meta.url).pathname;

// ===== CONFIG =====
const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;     // Mahadev
const POSTED_FOLDER_ID = process.env.POSTED_FOLDER_ID;     // postedFiles
const MEDIA_DIR = path.resolve("media");

// ===== AUTH =====
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

// ===== HELPERS =====
function extractNumber(name) {
  const m = name.match(/clip_(\d+)\.mp4/i);
  return m ? parseInt(m[1], 10) : null;
}

// ===== MAIN =====
async function run() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }

  // 1️⃣ Remove old GitHub Pages media
  for (const f of fs.readdirSync(MEDIA_DIR)) {
    fs.unlinkSync(path.join(MEDIA_DIR, f));
  }
  console.log("🗑 Old GitHub Pages media deleted");

  // 2️⃣ List files in SOURCE folder
  const list = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and mimeType='video/mp4'`,
    fields: "files(id, name)",
  });

  if (!list.data.files.length) {
    throw new Error("No clips found in source folder");
  }

  // 3️⃣ Pick NEXT SEQUENTIAL clip
  const files = list.data.files
    .map(f => ({ ...f, num: extractNumber(f.name) }))
    .filter(f => f.num !== null)
    .sort((a, b) => a.num - b.num);

  const file = files[0];
  console.log(`🎯 Selected: ${file.name}`);

  // 4️⃣ Download file
  const destPath = path.join(MEDIA_DIR, file.name);
  const res = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    res.data.pipe(dest);
    dest.on("finish", resolve);
    dest.on("error", reject);
  });

  console.log(`⬇ Downloaded ${file.name}`);

  // 5️⃣ COPY → postedFiles (n8n-style)
  const copied = await drive.files.copy({
    fileId: file.id,
    parents: [POSTED_FOLDER_ID],
    name: file.name,
  });

  console.log(`📦 Copied ${file.name} to postedFiles`);

  // 6️⃣ DELETE original from source
  await drive.files.delete({ fileId: file.id });
  console.log(`🗑 Removed ${file.name} from source folder`);

  console.log("✅ Upload workflow completed successfully");
}

// ===== RUN =====
run().catch(err => {
  console.error("❌ Upload failed:", err.message);
  process.exit(1);
});
