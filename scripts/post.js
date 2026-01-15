import { google } from "googleapis";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* ---------------- GOOGLE DRIVE AUTH ---------------- */

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

/* ---------------- CONSTANTS ---------------- */

const MEDIA_DIR = "media";

const CAPTION = `DEVON KE DEV MAHADEV 🙏🏻 
.
.
.
#mahadev #harharmahadev #mahadeva #bholenath #jaibholenath #shiv #shiva #shivshakti 
#shivshankar #shivbhakt #shivshambhu #mahakaal #mahakaleshwar #shambhu #amarnath 
#kedarnathtemple #bholebaba #bambambhole #omnamahshivaya #devokedevmahadev 
#viralreels #instagood #reelitfeelit #instagram`;

/* ---------------- HELPERS ---------------- */

function extractNumber(filename) {
  const match = filename.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

function isVideo(filename) {
  return /\.(mp4|mov|mkv|avi)$/i.test(filename);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------------- DRIVE FUNCTIONS ---------------- */

async function listFiles() {
  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
  });

  return res.data.files || [];
}

function pickNextFile(files) {
  files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  return files[0];
}

async function downloadFromDrive(file) {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR);
  }

  const filePath = path.join(MEDIA_DIR, file.name);

  const res = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(filePath);
    res.data.pipe(dest);
    dest.on("finish", resolve);
    dest.on("error", reject);
  });

  return filePath;
}

async function moveFile(fileId) {
  await drive.files.update({
    fileId,
    addParents: process.env.POSTED_FOLDER_ID,
    removeParents: process.env.SOURCE_FOLDER_ID,
  });
}

/* ---------------- INSTAGRAM POST ---------------- */

async function postToInstagram(file) {
  const publicUrl = `https://${process.env.GITHUB_USERNAME}.github.io/${process.env.GITHUB_REPO}/${MEDIA_DIR}/${encodeURIComponent(file.name)}`;

  console.log("Public media URL:", publicUrl);

  const isReel = isVideo(file.name);

  const mediaPayload = {
    caption: CAPTION,
    access_token: process.env.IG_TOKEN,
  };

  if (isReel) {
    mediaPayload.video_url = publicUrl;
    mediaPayload.media_type = "REELS";
  } else {
    mediaPayload.image_url = publicUrl;
  }

  const mediaRes = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mediaPayload),
    }
  );

  const media = await mediaRes.json();
  console.log("Media creation:", media);

  if (!media.id) {
    throw new Error("Media creation failed");
  }

  // ⏳ Instagram needs time to process videos
  if (isReel) {
    console.log("⏳ Waiting for Instagram to process reel...");
    await sleep(60000); // 60 seconds
  }

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
  console.log("Publish response:", publish);

  if (!publish.id) {
    throw new Error("Publish failed");
  }
}

/* ---------------- MAIN ---------------- */

(async () => {
  try {
    const files = await listFiles();

    if (!files.length) {
      console.log("No files to post");
      return;
    }

    const file = pickNextFile(files);
    console.log("Selected file:", file.name);

    await downloadFromDrive(file);

    console.log("Waiting for GitHub Pages to serve file...");
    await sleep(90000); // wait for Pages cache

    await postToInstagram(file);
    await moveFile(file.id);

    console.log("✅ Posted and moved:", file.name);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    process.exit(1);
  }
})();
