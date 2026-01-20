import fetch from "node-fetch";
import fs from "fs";

const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;

const MEDIA_DIR = "media";

const CAPTION = `DEVON KE DEV MAHADEV 🙏🏻
.
.
.
#mahadev #harharmahadev #mahadeva #bholenath #jaibholenath #shiv #shiva #shivshakti #shivshankar #shivbhakt #shivshambhu #mahakaal #mahakaleshwar #shambhu #amarnath #kedarnathtemple #bholebaba #bambambhole #omnamahshivaya #devokedevmahadev #viralreels #instagood #reelitfeelit #instagram

⚠️ Disclaimer:
No copyright infringement intended.
All rights reserved to the respected owner.
This video is only for entertainment purpose.
I don't own this video.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ✅ PICK LOWEST NUMBERED CLIP
function getNextMediaFile() {
  const files = fs
    .readdirSync(MEDIA_DIR)
    .filter((f) => f.endsWith(".mp4"))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || 0);
      const nb = parseInt(b.match(/\d+/)?.[0] || 0);
      return na - nb; // ascending
    });

  if (!files.length) {
    throw new Error("No media file found in media folder");
  }

  return files[0]; // ✅ IMPORTANT FIX
}

async function createContainer(videoUrl) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: CAPTION,
        access_token: IG_TOKEN,
      }),
    }
  );

  const data = await res.json();
  if (!data.id) throw new Error("Failed to create media container");
  return data.id;
}

async function waitForProcessing(containerId) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${IG_TOKEN}`
    );
    const data = await res.json();

    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error("Instagram processing error");
    }

    await sleep(15000);
  }

  throw new Error("Instagram processing timeout");
}

async function publish(containerId) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: IG_TOKEN,
      }),
    }
  );

  const data = await res.json();
  if (!data.id) throw new Error("Publish failed");
}

async function main() {
  const file = getNextMediaFile();

  const videoUrl = `https://${process.env.GH_USERNAME}.github.io/${process.env.GH_REPO}/media/${file}`;

  console.log("🎬 Posting:", file);
  console.log("🔗 Video URL:", videoUrl);

  const containerId = await createContainer(videoUrl);
  console.log("📦 Container created:", containerId);

  await waitForProcessing(containerId);
  console.log("⏳ Processing finished");

  await publish(containerId);
  console.log("✅ Reel posted successfully");
}

main().catch((err) => {
  console.error("❌ Post failed:", err.message);
  process.exit(1);
});
