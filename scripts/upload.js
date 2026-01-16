import fs from "fs";
import path from "path";
import { google } from "googleapis";

/* ---------------- ENV VALIDATION ---------------- */

const REQUIRED_ENV = [
  "GOOGLE_SERVICE_KEY",
  "SOURCE_FOLDER_ID",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

/* ---------------- GOOGLE DRIVE ---------------- */

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const drive = google.drive({ version: "v3", auth });

/* ---------------- CONSTANTS ---------------- */

const MEDIA_DIR = path.join(process.cwd(), "media");

/* ---------------- HELPERS ---------------- */

function extractNumber(name) {
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : Infinity;
}

/* ---------------- CLEAN GITHUB PAGES ---------------- */

function cleanMediaFolder() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

  const files = fs.readdirSync(MEDIA_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(MEDIA_DIR, file));
  }

  console.log("🧹 Cleared GitHub Pages media folder");
}

/* ---------------- DOWNLOAD FROM DRIVE ---------------- */

async function downloadNextFile() {
  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id,name)",
  });

  const files = res.data.files || [];
  if (!files.length) {
    console.log("ℹ️ No files in Drive source folder");
    process.exit(0);
  }

  files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  const file = files[0];

  console.log("⬇️ Downloading:", file.name);

  const destPath = path.join(MEDIA_DIR, file.name);
  const dest = fs.createWriteStream(destPath);

  const response = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    response.data
      .on("end", resolve)
      .on("error", reject)
      .pipe(dest);
  });

  console.log("✅ Uploaded to GitHub Pages:", file.name);
}

/* ---------------- MAIN ---------------- */

(async () => {
  try {
    cleanMediaFolder();
    await downloadNextFile();
  } catch (err) {
    console.error("❌ UPLOAD ERROR:", err.message);
    process.exit(1);
  }
})();
