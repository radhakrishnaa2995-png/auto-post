import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const {
  IG_TOKEN,
  IG_USER_ID,
  GH_USERNAME,
  GH_REPO,
} = process.env;

// ---------- VALIDATION ----------
function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

[
  "IG_TOKEN",
  "IG_USER_ID",
  "GH_USERNAME",
  "GH_REPO",
].forEach(requireEnv);

// ---------- CONSTANTS ----------
const MEDIA_DIR = "media";
const MAX_IG_WAIT_ATTEMPTS = 20; // 20 × 15s = 5 minutes
const WAIT_INTERVAL_MS = 15000;

// ---------- HELPERS ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForGitHubPages(url) {
  console.log("⏳ Waiting for GitHub Pages to serve media...");

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        console.log("✅ GitHub Pages media is live");
        return;
      }
    } catch (_) {}

    console.log("⌛ Still waiting...");
    await sleep(5000);
  }

  throw new Error("GitHub Pages did not serve the file in time");
}

async function waitForInstagramProcessing(containerId) {
  console.log("⏳ Waiting for Instagram to finish processing...");

  for (let i = 0; i < MAX_IG_WAIT_ATTEMPTS; i++) {
    await sleep(WAIT_INTERVAL_MS);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${IG_TOKEN}`
    );
    const json = await res.json();

    console.log("📦 Instagram status:", json.status_code);

    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR") {
      throw new Error("Instagram reported processing ERROR");
    }
  }

  throw new Error("Instagram processing timeout");
}

// ---------- MAIN ----------
async function main() {
  // 1️⃣ Pick first video in media/
  const files = fs.readdirSync(MEDIA_DIR)
    .filter(f => f.endsWith(".mp4"));

  if (files.length === 0) {
    console.log("ℹ️ No media files found. Exiting.");
    return;
  }

  const video = files[0];
  console.log("🎬 Selected:", video);

  // 2️⃣ Public GitHub Pages URL
  const publicUrl = `https://${GH_USERNAME}.github.io/${GH_REPO}/media/${video}`;
  console.log("🌍 Public media URL:", publicUrl);

  // 3️⃣ Ensure GitHub Pages serves the file
  await waitForGitHubPages(publicUrl);

  // 4️⃣ Create Instagram media container
  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: publicUrl,
        caption: "Posted automatically 🚀",
        access_token: IG_TOKEN,
      }),
    }
  );

  const media = await createRes.json();
  console.log("📤 Media creation response:", media);

  if (!media.id) {
    throw new Error("Failed to create media container");
  }

  // 5️⃣ Wait for Instagram processing (MANDATORY)
  await waitForInstagramProcessing(media.id);

  // 6️⃣ Publish reel
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: media.id,
        access_token: IG_TOKEN,
      }),
    }
  );

  const publish = await publishRes.json();
  console.log("✅ Publish response:", publish);

  if (!publish.id) {
    throw new Error("Publish failed");
  }

  console.log("🎉 Reel published successfully!");
}

main().catch(err => {
  console.error("❌ ERROR:", err.message);
  process.exit(1);
});
