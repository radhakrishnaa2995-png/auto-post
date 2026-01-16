import fs from "fs";
import path from "path";
import { google } from "googleapis";

const MEDIA_DIR = "media";

// ENV
const SERVICE_ACCOUNT = JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT);
const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;

// Auth
const auth = new google.auth.JWT(
  SERVICE_ACCOUNT.client_email,
  null,
  SERVICE_ACCOUNT.private_key,
  ["https://www.googleapis.com/auth/drive"]
);

const drive = google.drive({ version: "v3", auth });

// Utils
function extractNumber(name) {
  const m = name.match(/clip_(\d+)\.mp4/i);
  return m ? Number(m[1]) : Infinity;
}

async function run() {
  // 1️⃣ Clear GitHub Pages media
  if (fs.existsSync(MEDIA_DIR)) {
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(MEDIA_DIR);
  console.log("🧹 Old GitHub Pages media deleted");

  // 2️⃣ List files from Drive source
  const res = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (!res.data.files.length) {
    throw new Error("No files found in source folder");
  }

  // 3️⃣ Pick next sequential clip
  const file = res.data.files
    .sort((a, b) => extractNumber(a.name) - extractNumber(b.name))[0];

  console.log(`🎯 Selected: ${file.name}`);

  // 4️⃣ Download clip
  const destPath = path.join(MEDIA_DIR, file.name);
  const dest = fs.createWriteStream(destPath);

  const download = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    download.data.pipe(dest).on("finish", resolve).on("error", reject);
  });

  console.log(`⬇️ Downloaded ${file.name}`);

  // 5️⃣ DELETE file from Drive source
  await drive.files.delete({
    fileId: file.id,
    supportsAllDrives: true,
  });

  console.log(`🗑️ Deleted ${file.name} from Drive source`);
  console.log("✅ Upload workflow completed successfully");
}

run().catch(err => {
  console.error("❌ Upload failed:", err.message);
  process.exit(1);
});
