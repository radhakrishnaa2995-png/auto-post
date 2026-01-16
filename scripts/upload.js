import fs from "fs";
import path from "path";
import { google } from "googleapis";

const MEDIA_DIR = "media";
const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;
const SERVICE_ACCOUNT = JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT);

const auth = new google.auth.JWT(
  SERVICE_ACCOUNT.client_email,
  null,
  SERVICE_ACCOUNT.private_key,
  ["https://www.googleapis.com/auth/drive"]
);

const drive = google.drive({ version: "v3", auth });

async function run() {
  // 1️⃣ Delete old GitHub Pages media
  if (fs.existsSync(MEDIA_DIR)) {
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  console.log("🧹 Old GitHub Pages media deleted");

  // 2️⃣ List files in Drive source folder
  const listRes = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and mimeType contains 'video/'`,
    fields: "files(id, name)",
  });

  if (!listRes.data.files.length) {
    throw new Error("No video files found in source folder");
  }

  // 3️⃣ Pick next sequential clip
  const file = listRes.data.files
    .sort((a, b) =>
      parseInt(a.name.match(/\d+/)) - parseInt(b.name.match(/\d+/))
    )[0];

  console.log(`🎯 Selected: ${file.name}`);

  // 4️⃣ Download file
  const destPath = path.join(MEDIA_DIR, file.name);
  const dest = fs.createWriteStream(destPath);

  const downloadRes = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    downloadRes.data.pipe(dest);
    dest.on("finish", resolve);
    dest.on("error", reject);
  });

  console.log(`⬇️ Downloaded ${file.name}`);

  // 5️⃣ DELETE file from Drive source folder (this WILL work)
  await drive.files.delete({ fileId: file.id });
  console.log(`🗑️ Deleted ${file.name} from Drive source folder`);

  console.log("✅ Upload workflow completed successfully");
}

run().catch(err => {
  console.error("❌ Upload failed:", err.message);
  process.exit(1);
});
