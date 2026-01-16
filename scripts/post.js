import fs from "fs";
import path from "path";
import axios from "axios";

const MEDIA_DIR = path.join(process.cwd(), "media");

const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;

const CAPTION = `
DEVON KE DEV MAHADEV 🙏🏻

️

#mahadev #harharmahadev #mahadeva #bholenath #jaibholenath
#shiv #shiva #shivshakti #mahakaal #omnamahshivaya
#devokedevmahadev #reelitfeelit #viralreels
`;

function getMediaFile() {
  const files = fs.readdirSync(MEDIA_DIR).filter(f => f.endsWith(".mp4"));
  if (!files.length) throw new Error("❌ No media found");
  return files[0];
}

async function postReel(filename) {
  const mediaUrl = `https://${process.env.GH_USERNAME}.github.io/${process.env.GH_REPO}/media/${filename}`;

  console.log("🎥 Media URL:", mediaUrl);

  const create = await axios.post(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
    {
      video_url: mediaUrl,
      caption: CAPTION,
      media_type: "REELS",
      access_token: IG_TOKEN,
    }
  );

  const creationId = create.data.id;

  await new Promise(r => setTimeout(r, 20000));

  const publish = await axios.post(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
    {
      creation_id: creationId,
      access_token: IG_TOKEN,
    }
  );

  if (!publish.data.id) {
    throw new Error("❌ Publish failed");
  }

  console.log("✅ Reel posted successfully");
}

(async () => {
  try {
    const file = getMediaFile();
    await postReel(file);
  } catch (err) {
    console.error(err.response?.data || err);
    process.exit(1);
  }
})();
