import fs from "fs";
import path from "path";
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const drive = google.drive({ version: "v3", auth });

const SOURCE_FOLDER_ID = process.env.SOURCE_FOLDER_ID;

async function listFiles() {
  const res = await drive.files.list({
    q: `'${SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  return res.data.files || [];
}

function extractNumber(name) {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

async function downloadFile(file) {
  const mediaDir = path.join(process.cwd(), "media");
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir);

  const destPath = path.join(mediaDir, file.name);
  const dest = fs.createWriteStream(destPath);

  const res = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    res.data
      .on("end", resolve)
      .on("error", reject)
      .pipe(dest);
  });

  console.log(`✅ Downloaded to media/${file.name}`);
}

(async () => {
  const files = await listFiles();
  if (!files.length) throw new Error("No files found in Drive folder");

  files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  const file = files[0];

  console.log("Uploading:", file.name);
  await downloadFile(file);
})();
