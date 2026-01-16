import fs from "fs";
import path from "path";
import { google } from "googleapis";
import axios from "axios";

const MEDIA_DIR = path.join(process.cwd(), "media");

const auth = new google.auth.JWT(
  JSON.parse(process.env.GOOGLE_SERVICE_KEY).client_email,
  null,
  JSON.parse(process.env.GOOGLE_SERVICE_KEY).private_key,
  ["https://www.googleapis.com/auth/drive"]
);

const drive = google.drive({ version: "v3", auth });

async function cleanMediaFolder() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

  const files = fs.readdirSync(MEDIA_DIR);
  for (const file of files) {
    if (file !== ".gitkeep") {
      fs.unlinkSync(path.join(MEDIA_DIR, file));
    }
  }
  console.log("🧹 Old media deleted");
}

async function getNextDriveFile() {
  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed=false`,
    orderBy: "createdTime",
    pageSize: 1,
    fields: "files(id,name)",
  });

  if (!res.data.files.length) {
    throw new Error("❌ No files in SOURCE folder");
  }

  return res.data.files[0];
}

async function downloadFile(file) {
  const destPath = path.join(MEDIA_DIR, file.name);
  const dest = fs.createWriteStream(destPath);

  const res = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    res.data.pipe(dest);
    dest.on("finish", resolve);
    dest.on("error", reject);
  });

  console.log(`⬇️ Downloaded ${file.name}`);
}

async function moveToPostedFolder(file) {
  await drive.files.update({
    fileId: file.id,
    addParents: process.env.POSTED_FOLDER_ID,
    removeParents: process.env.SOURCE_FOLDER_ID,
    fields: "id, parents",
  });

  console.log("📦 Moved file to POSTED folder");
}

(async () => {
  try {
    await cleanMediaFolder();
    const file = await getNextDriveFile();
    await downloadFile(file);
    await moveToPostedFolder(file);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
