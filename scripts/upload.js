import fs from "fs";
import path from "path";
import axios from "axios";
import { google } from "googleapis";

// ENV
const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;
const POSTED_FOLDER_ID = process.env.POSTED_FOLDER_ID;
const GOOGLE_SERVICE_KEY = JSON.parse(process.env.GOOGLE_SERVICE_KEY);

const MEDIA_DIR = "media";

// Auth
const auth = new google.auth.JWT(
  GOOGLE_SERVICE_KEY.client_email,
  null,
  GOOGLE_SERVICE_KEY.private_key,
  ["https://www.googleapis.com/auth/drive"]
);

const drive = google.drive({ version: "v3", auth });

// Helpers
const extractNumber = (name) => {
  const m = name.match(/clip_(\d+)\.mp4/i);
  return m ? Number(m[1]) : Infinity;
};

async function run() {
  // 1️⃣ Clean GitHub Pages media folder
  if (fs.existsSync(MEDIA_DIR)) {
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  console.log("🧹 Old media deleted");

  // 2️⃣ List source folder files
  const list = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id,name)",
  });

  if (!list.data.files.length) {
    throw new Error("No files in source folder");
  }

  // 3️⃣ Pick NEXT sequential clip
  const file = list.data.files
    .filter(f => /clip_\d+\.mp4/i.test(f.name))
    .sort((a, b) => extractNumber(a.name) - extractNumber(b.name))[0];

  if (!file) throw new Error("No valid clip found");

  console.log(`🎯 Selected ${file.name}`);

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

  // 5️⃣ MOVE FILE (CRITICAL FIX)
  // Step 1: ADD postedFiles parent
  await drive.files.update({
    fileId: file.id,
    addParents: POSTED_FOLDER_ID,
    fields: "id, parents",
  });

  // Step 2: REMOVE source folder parent
  await drive.files.update({
    fileId: file.id,
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
