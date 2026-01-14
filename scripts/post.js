import { google } from "googleapis";
import fetch from "node-fetch";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

function extractNumber(filename) {
  const match = filename.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

async function listFiles() {
  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  return res.data.files;
}

function pickNextFile(files) {
  files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  return files[0];
}

function driveDirectUrl(fileId) {
  return `https://drive.google.com/uc?id=${fileId}&export=download`;
}

async function postToInstagram(imageUrl) {
  const mediaRes = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: "Auto posted",
        access_token: process.env.IG_TOKEN,
      }),
    }
  );

  const media = await mediaRes.json();
  if (!media.id) throw new Error("Media creation failed");

  await fetch(
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
}

async function moveFile(fileId) {
  await drive.files.update({
    fileId,
    addParents: process.env.POSTED_FOLDER_ID,
    removeParents: process.env.SOURCE_FOLDER_ID,
  });
}

(async () => {
  const files = await listFiles();
  if (!files.length) {
    console.log("No files to post");
    return;
  }

  const file = pickNextFile(files);
  console.log("Posting:", file.name);

  const imageUrl = driveDirectUrl(file.id);
  await postToInstagram(imageUrl);
  await moveFile(file.id);

  console.log("Posted and moved:", file.name);
})();
