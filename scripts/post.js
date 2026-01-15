import { google } from "googleapis";
import fetch from "node-fetch";
import fs from "fs";

/* ---------- GOOGLE DRIVE AUTH ---------- */

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

/* ---------- HELPERS ---------- */

function extractNumber(name) {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1]) : Infinity;
}

function isVideo(name) {
  return /\.(mp4|mov|mkv)$/i.test(name);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ---------- DRIVE ---------- */

async function listFiles() {
  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id,name)",
  });
  return res.data.files || [];
}

async function downloadFile(file) {
  const dest = `videos/${file.name}`;
  const res = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(dest);
    res.data.pipe(w);
    w.on("finish", resolve);
    w.on("error", reject);
  });

  return dest;
}

async function moveFile(fileId) {
  await drive.files.update({
    fileId,
    addParents: process.env.POSTED_FOLDER_ID,
    removeParents: process.env.SOURCE_FOLDER_ID,
  });
}

/* ---------- INSTAGRAM ---------- */

async function postToInstagram(fileName) {
  const url = `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io/${process.env.GITHUB_REPOSITORY}/videos/${fileName}`;

  const caption = `DEVON KE DEV MAHADEV 🙏🏻
.
.
.
#mahadev #harharmahadev #mahadeva #bholenath #shiv #shivshakti #mahakaal #omnamahshivaya #reels`;

  const media = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_url: url,
        media_type: "REELS",
        caption,
        access_token: process.env.IG_TOKEN,
      }),
    }
  ).then(r => r.json());

  if (!media.id) throw new Error(JSON.stringify(media));

  console.log("⏳ Waiting for Instagram processing...");
  await sleep(90000); // 90 sec

  const publish = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: media.id,
        access_token: process.env.IG_TOKEN,
      }),
    }
  ).then(r => r.json());

  if (!publish.id) throw new Error(JSON.stringify(publish));
}

/* ---------- MAIN ---------- */

(async () => {
  const files = await listFiles();
  if (!files.length) return console.log("No files");

  files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  const file = files[0];

  console.log("Posting:", file.name);

  await downloadFile(file);

  // commit video to GitHub Pages
  await fetch("https://api.github.com/repos/" + process.env.GITHUB_REPOSITORY + "/contents/videos/" + file.name, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Add ${file.name}`,
      content: fs.readFileSync(`videos/${file.name}`, "base64")
    })
  });

  await postToInstagram(file.name);
  await moveFile(file.id);

  console.log("✅ DONE:", file.name);
})();


