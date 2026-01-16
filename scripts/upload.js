import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;
const MEDIA_DIR = path.join(process.cwd(), "media");

// -------------------- AUTH --------------------
if (!process.env.GOOGLE_SERVICE_KEY) {
  throw new Error("GOOGLE_SERVICE_KEY secret is missing");
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

// -------------------- HELPERS --------------------
function getClipNumber(name) {
  const match = name.match(/clip_(\d+)\.mp4/i);
  return match ? parseInt(match[1], 10) : null;
}

// -------------------- MAIN --------------------
async function run() {
  console.log("🚀 Upload workflow started");

  // 1️⃣ Clear GitHub Pages media
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

  for (const file of fs.readdirSync(MEDIA_DIR)) {
    if (file.endsWith(".mp4")) {
      fs.unlinkSync(path.join(MEDIA_DIR, file));
    }
  }
  console.log("🧹 Old GitHub Pages media deleted");

  // 2️⃣ List videos from SOURCE folder
  const listRes = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and mimeType='video/mp4' and trashed=false`,
    fields: "files(id, name)",
  });

  if (!listRes.data.files || listRes.data.files.length === 0) {
    throw new Error("❌ No video files found in SOURCE folder");
  }

  // 3️⃣ Sort sequentially
  const sortedFiles = listRes.data.files
    .map(f => ({ ...f, num: getClipNumber(f.name) }))
    .filter(f => f.num !== null)
    .sort((a, b) => a.num - b.num);

  if (!sortedFiles.length) {
    throw new Error("❌ No valid clip_XX.mp4 files found");
  }

  const file = sortedFiles[0];
  console.log(`🎯 Selected: ${file.name}`);

  // 4️⃣ Download file
  const destPath = path.join(MEDIA_DIR, file.name);
  const dest = fs.createWriteStream(destPath);

  const downloadRes = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    downloadRes.data
      .pipe(dest)
      .on("finish", resolve)
      .on("error", reject);
  });

  console.log(`⬇️ Downloaded ${file.name}`);

  // 5️⃣ DELETE file from SOURCE folder
  await drive.files.delete({ fileId: file.id });

  console.log(`🗑️ Deleted ${file.name} from SOURCE folder`);
  console.log("✅ Upload workflow completed successfully");
}

run().catch(err => {
  console.error("🔥 Upload failed:", err.message);
  process.exit(1);
});
