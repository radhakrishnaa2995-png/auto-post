import { google } from "googleapis";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* ---------------- ENV CHECK ---------------- */

const REQUIRED_ENVS = [
  "GOOGLE_SERVICE_KEY",
  "SOURCE_FOLDER_ID",
  "POSTED_FOLDER_ID",
  "IG_TOKEN",
  "IG_USER_ID",
  "GH_USERNAME",
  "GH_REPO"
];

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

/* ---------------- GOOGLE DRIVE ---------------- */

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

async function listFiles() {
  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  return res.data.files || [];
}

function extractNumber(name) {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999999;
}

function pickNextFile(files) {
  return files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name))[0];
}

/* ---------------- DOWNLOAD ---------------- */

async function downloadFile(fileId, fileName) {
  const destDir = "media";
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir);

  const destPath = path.join(destDir, fileName);
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(destPath);
    res.data.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return destPath;
}

/* ---------------- GITHUB PAGES URL ---------------- */

function getPagesUrl(fileName) {
  return `https://${process.env.GH_USERNAME}.github.io/${process.env.GH_REPO}/media/${fileName}`;
}

async function waitForPages(url, retries = 10) {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(url);
    if (r.status === 200) return true;
    console.log("⏳ Waiting for GitHub Pages...");
    await new Promise(r => setTimeout(r, 15000));
  }
  throw new Error("GitHub Pages did not serve the file in time");
}

/* ---------------- INSTAGRAM ---------------- */

async function postReel(videoUrl) {
  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: `DEVON KE DEV MAHADEV 🙏🏻

#mahadev #harharmahadev #mahadeva #bholenath #shiv #shiva
#mahakaal #omnamahshivaya #viralreels`,
        access_token: process.env.IG_TOKEN,
      }),
    }
  );

  const media = await createRes.json();
  if (!media.id) throw new Error("Media creation failed");

  await new Promise(r => setTimeout(r, 30000)); // IMPORTANT

  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: media.id,
        access_token: process.env.IG_TOKEN,
      }),
    }
  );

  const publish = await publishRes.json();
  if (!publish.id) throw new Error("Publish failed");
}

/* ---------------- MOVE FILE ---------------- */

async function moveFile(fileId) {
  await drive.files.update({
    fileId,
    addParents: process.env.POSTED_FOLDER_ID,
    removeParents: process.env.SOURCE_FOLDER_ID,
  });
}

/* ---------------- MAIN ---------------- */

(async () => {
  const files = await listFiles();
  if (!files.length) {
    console.log("No files to post");
    return;
  }

  const file = pickNextFile(files);
  console.log("Selected:", file.name);

  await downloadFile(file.id, file.name);

  const publicUrl = getPagesUrl(file.name);
  console.log("Public media URL:", publicUrl);

  await waitForPages(publicUrl);
  await postReel(publicUrl);
  await moveFile(file.id);

  console.log("✅ Successfully posted:", file.name);
})();
