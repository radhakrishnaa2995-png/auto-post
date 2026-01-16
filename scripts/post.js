import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { execSync } from "child_process";

/* ---------------- CONFIG ---------------- */

const MEDIA_DIR = path.join(process.cwd(), "media");

const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
const GH_USERNAME = process.env.GH_USERNAME;
const GH_REPO = process.env.GH_REPO;

/* ---------------- VALIDATION ---------------- */

const REQUIRED_ENV = {
  IG_USER_ID,
  IG_TOKEN,
  GH_USERNAME,
  GH_REPO,
};

for (const [key, value] of Object.entries(REQUIRED_ENV)) {
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

/* ---------------- CAPTION ---------------- */

const CAPTION = `DEVON KE DEV MAHADEV 🙏🏻

#mahadev #harharmahadev #mahadeva #bholenath #jaibholenath
#shiv #shiva #shivshakti #shivshankar #shivbhakt #shivshambhu
#mahakaal #mahakaleshwar #shambhu #amarnath #kedarnathtemple
#bholebaba #bambambhole #omnamahshivaya #devokedevmahadev
#viralreels #instagood #reelitfeelit #instagram`;

/* ---------------- HELPERS ---------------- */

function getNextMediaFile() {
  const files = fs
    .readdirSync(MEDIA_DIR)
    .filter(f => f.endsWith(".mp4"))
    .sort();

  if (files.length === 0) {
    console.log("❌ No media files found");
    process.exit(0);
  }

  return files[0]; // ONLY ONE FILE
}

function githubPagesUrl(filename) {
  return `https://${GH_USERNAME}.github.io/${GH_REPO}/media/${filename}`;
}

async function waitForUrl(url, retries = 20) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return;
    console.log("⏳ Waiting for GitHub Pages...");
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("GitHub Pages did not serve the file in time");
}

/* ---------------- INSTAGRAM ---------------- */

async function postReel(videoUrl) {
  const createRes = await fetch(
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

  const creation = await createRes.json();
  if (!creation.id) {
    throw new Error(`Media creation failed: ${JSON.stringify(creation)}`);
  }

  console.log("🎬 Media created:", creation.id);

  // Instagram needs processing time
  await new Promise(r => setTimeout(r, 20000));

  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creation.id,
        access_token: IG_TOKEN,
      }),
    }
  );

  const publish = await publishRes.json();
  if (!publish.id) {
    throw new Error(`Publish failed: ${JSON.stringify(publish)}`);
  }

  console.log("✅ Reel published:", publish.id);
}

/* ---------------- CLEANUP ---------------- */

function deleteMedia(filename) {
  fs.unlinkSync(path.join(MEDIA_DIR, filename));

  execSync("git config user.name 'actions-user'");
  execSync("git config user.email 'actions@github.com'");
  execSync("git add media");
  execSync(`git commit -m "Remove posted media ${filename}"`);
  execSync("git push");

  console.log("🧹 Deleted media from GitHub Pages:", filename);
}

/* ---------------- MAIN ---------------- */

(async () => {
  try {
    const filename = getNextMediaFile();
    console.log("📌 Selected:", filename);

    const publicUrl = githubPagesUrl(filename);
    console.log("🌍 Public URL:", publicUrl);

    await waitForUrl(publicUrl);
    await postReel(publicUrl);
    deleteMedia(filename);

    console.log("🎉 DONE — next file will post next run");
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    process.exit(1);
  }
})();
