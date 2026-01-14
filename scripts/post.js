import { google } from "googleapis";
import fetch from "node-fetch";

/* ================= GOOGLE DRIVE AUTH ================= */

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

/* ================= CAPTION ================= */

const CAPTION = `DEVON KE DEV MAHADEV 🙏🏻 
.
.
.
#mahadev #harharmahadev #mahadeva #bholenath #jaibholenath #shiv #shiva #shivshakti #shivshankar #shivbhakt #shivshambhu #mahakaal #mahakaleshwar #shambhu #amarnath #kedarnathtemple #bholebaba #bambambhole #omnamahshivaya #devokedevmahadev #viralreels #instagood #reelitfeelit #instagram`;

/* ================= HELPERS ================= */

function extractNumber(filename) {
  const match = filename.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

function isVideo(filename) {
  return /\.(mp4|mov|mkv|avi)$/i.test(filename);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ================= DRIVE FUNCTIONS ================= */

async function listFiles() {
  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id, name)",
  });
  return res.data.files || [];
}

function pickNextFile(files) {
  files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  return files[0];
}

function driveDirectUrl(fileId) {
  return `https://drive.google.com/uc?id=${fileId}&export=download`;
}

async function moveFile(fileId) {
  await drive.files.update({
    fileId,
    addParents: process.env.POSTED_FOLDER_ID,
    removeParents: process.env.SOURCE_FOLDER_ID,
  });
}

/* ================= INSTAGRAM POST ================= */

async function postToInstagram(file, mediaUrl) {
  const reel = isVideo(file.name);

  console.log("Posting type:", reel ? "REEL (video)" : "IMAGE");

  const mediaPayload = {
    caption: CAPTION,
    access_token: process.env.IG_TOKEN,
  };

  if (reel) {
    mediaPayload.video_url = mediaUrl;
    mediaPayload.media_type = "REELS";
  } else {
    mediaPayload.image_url = mediaUrl;
  }

  /* ---- CREATE MEDIA ---- */

  const mediaRes = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mediaPayload),
    }
  );

  const media = await mediaRes.json();
  console.log("Media creation response:", media);

  if (!media.id) {
    throw new Error("Media creation failed: " + JSON.stringify(media));
  }

  /* ---- WAIT FOR VIDEO PROCESSING (IMPORTANT) ---- */

  if (reel) {
    console.log("⏳ Waiting for Instagram to process reel...");
    await sleep(60_000); // 60 seconds
  }

  /* ---- PUBLISH MEDIA ---- */

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
    throw new Error("Publish failed: " + JSON.stringify(publish));
  }
}

/* ================= MAIN ================= */

(async () => {
  try {
    const files = await listFiles();

    if (!files.length) {
      console.log("No files to post");
      return;
    }

    const file = pickNextFile(files);
    console.log("Selected file:", file.name);

    const mediaUrl = driveDirectUrl(file.id);

    await postToInstagram(file, mediaUrl);
    await moveFile(file.id);

    console.log("✅ Posted and moved:", file.name);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    process.exit(1);
  }
})();

