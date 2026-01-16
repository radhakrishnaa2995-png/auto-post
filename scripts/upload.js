import fs from "fs-extra";
import path from "path";
import { google } from "googleapis";

const MEDIA_DIR = "media";
const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;
const POSTED_FOLDER_ID = process.env.POSTED_FOLDER_ID;
const SERVICE_KEY = JSON.parse(process.env.GOOGLE_SERVICE_KEY);

// Google Drive auth
const auth = new google.auth.JWT(
  SERVICE_KEY.client_email,
  null,
  SERVICE_KEY.private_key,
  ["https://www.googleapis.com/auth/drive"]
);

const drive = google.drive({ version: "v3", auth });

// 1️⃣ Delete old GitHub Pages media
async function cleanMediaFolder() {
  await fs.ensureDir(MEDIA_DIR);
  const files = await fs.readdir(MEDIA_DIR);
  for (const file of files) {
    if (file !== ".gitkeep") {
      await fs.remove(path.join(MEDIA_DIR, file));
    }
  }
  console.log("🧹 Old GitHub Pages media deleted");
}

// 2️⃣ Extract number from filename
function extractNumber(name) {
  const match = name.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

// 3️⃣ Get SMALLEST numbered file
async function getNextSequentialFile() {
  const res = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and mimeType contains 'video/' and trashed = false`,
    fields: "files(id, name)"
  });

  if (!res.data.files.length) {
    throw new Error("No videos left in source folder");
  }

  const sorted = res.data.files
    .map(f => ({ ...f, num: extractNumber(f.name) }))
    .filter(f => Number.isFinite(f.num))
    .sort((a, b) => a.num - b.num);

  if (!sorted.length) {
    throw new Error("No valid numbered clips found");
  }

  return sorted[0]; // smallest number
}

// 4️⃣ Download selected file
async function downloadFile(file) {
  const dest = path.join(MEDIA_DIR, file.name);

  const response = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(dest);
    response.data.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  console.log(`⬇️ Downloaded ${file.name}`);
}

// 5️⃣ Move file to POSTED folder (remove from SOURCE)
async function moveToPosted(file) {
  await drive.files.update({
    fileId: file.id,
    addParents: POSTED_FOLDER_ID,
    removeParents: SOURCE_FOLDER_ID,
    fields: "id, parents"
  });

  console.log(`📁 Moved ${file.name} to POSTED folder`);
}

// MAIN
(async () => {
  await cleanMediaFolder();
  const file = await getNextSequentialFile();
  await downloadFile(file);
  await moveToPosted(file);
})();
