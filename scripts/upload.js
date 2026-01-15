import fs from "fs";
import path from "path";
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });
const MEDIA_DIR = "media";

function extractNumber(name) {
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : Infinity;
}

(async () => {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

  const res = await drive.files.list({
    q: `'${process.env.SOURCE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id,name)",
  });

  if (!res.data.files.length) {
    console.log("No files found");
    return;
  }

  res.data.files.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  const file = res.data.files[0];

  console.log("Uploading:", file.name);

  const dest = path.join(MEDIA_DIR, file.name);
  const stream = fs.createWriteStream(dest);

  await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "stream" },
    res =>
      new Promise((resolve, reject) => {
        res.data.pipe(stream);
        stream.on("finish", resolve);
        stream.on("error", reject);
      })
  );

  console.log("Uploaded to media/");
})();
