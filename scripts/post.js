import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { google } from "googleapis";

/* ---------------- ENV VALIDATION ---------------- */

const REQUIRED_ENV = [
  "IG_USER_ID",
  "IG_TOKEN",
  "GH_USERNAME",
  "GH_REPO",
  "GOOGLE_SERVICE_KEY",
  "SOURCE_FOLDER_ID",
  "POSTED_FOLDER_ID",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

/* ---------------- CONSTANTS ---------------- */

const MEDIA_DIR = path.join(process.cwd(), "media");

const CAPTION = `DEVON KE DEV MAHADEV 🙏🏻

#mahadev #harharmahadev #mahadeva #bholenath #jaibholenath
#shiv #shiva #shivshakti #shivshankar #shivbhakt #shivshambhu
#mahakaal #mahakaleshwar #shambhu #amarnath #kedarnathtemple
#bholebaba #bambambhole #omnamahshivaya #devokedevmahadev
#viralreels #instagood #reelitfeelit #instagram`;

/* ---------------- GOOGLE DRIVE ---------------- */

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

/* ---------------- HELPERS ---------------- */

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getMediaFile() {
  const files = fs.readdirSync(MEDIA_DIR).filter(f => f.endsWith(".mp4"));
  if (!files.length) {
    console.log("ℹ️ No media file found on GitHub Pages");
    process.exit(0);
  }
  return files[0];
}

function publicUrl(filename) {
  return `https://${process.env.GH_USERNAME}.github.io/${process.env.GH_REPO}/media/${filename}`;
}

/* ---------------- INSTAGRAM ---------------- */

async function waitForProcessing(containerId) {
  for (let i = 0; i < 20; i++) {
    await sleep(15000);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${process.env.IG_TOKEN}`
    );
    const json = await res.json();

    console.log("📦 IG status:", json.status_code);

    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR") {
      throw new Error("Instagram processing error");
    }
  }

  throw new Error("Instagram processing timeout");
}

async function postReel(videoUrl) {
  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: CAPTION,
        access_token: process.env.IG_TOKEN,
      }),
    }
  );

  const media = await createRes.json();
  if (!media.id) {
    throw new Error("Media creation failed: " + JSON.stringify(media));
  }

  console.log("🎬 Media created:", media.id);

  await waitForProcessing(media.id);

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
  if (!publish.id) {
    throw new Error("Publish failed: " + JSON.stringify(publish));
  }

  console.log("✅ Reel published");
}

/* ---------------- MOVE DRIVE FILE ---------------- */

async function moveDriveFile(filename) {
  const res = await drive.files.list({
    q: `name='${filename}' and '${process.env.SOURCE_FOLDER_ID}' in parents`,
    fields: "files(id)",
  });

  if (!res.data.files.length) {
    console.log("ℹ️ Drive file already moved");
    return;
  }

  await drive.files.update({
    fileId: res.data.files[0].id,
    addParents: process.env.POSTED_FOLDER_ID,
    removeParents: process.env.SOURCE_FOLDER_ID,
  });

  console.log("📁 Drive file moved to POSTED");
}

/* ---------------- MAIN ---------------- */

(async () => {
  try {
    const filename = getMediaFile();
    const url = publicUrl(filename);

    console.log("🌍 Posting:", url);

    await postReel(url);
    await moveDriveFile(filename);

    console.log("🎉 DONE — system ready for next clip");
  } catch (err) {
    console.error("❌ POST ERROR:", err.message);
    process.exit(1);
  }
})();
