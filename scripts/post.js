import fs from "fs";
import fetch from "node-fetch";

const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const GH_USERNAME = process.env.GH_USERNAME;
const GH_REPO = process.env.GH_REPO;

const MEDIA_DIR = "media";

const CAPTION = `DEVON KE DEV MAHADEV 🙏🏻

#mahadev #harharmahadev #mahadeva #bholenath
#shiv #shiva #shivshakti #mahakaal
#omnamahshivaya #devokedevmahadev
#viralreels #instagram`;

function getMediaFile() {
  const files = fs.readdirSync(MEDIA_DIR).filter(f => f.endsWith(".mp4"));
  if (!files.length) throw new Error("No media file found");
  return files[0];
}

async function postReel() {
  const file = getMediaFile();
  const mediaUrl = `https://${GH_USERNAME}.github.io/${GH_REPO}/media/${file}`;

  const create = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: mediaUrl,
        caption: CAPTION,
        access_token: IG_TOKEN
      })
    }
  ).then(r => r.json());

  if (!create.id) throw new Error("Media container creation failed");

  const publish = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: create.id,
        access_token: IG_TOKEN
      })
    }
  ).then(r => r.json());

  if (!publish.id) throw new Error("Publish failed");

  console.log("✅ Reel posted successfully");
}

postReel();
