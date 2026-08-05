import sharp from "sharp";
import path from "node:path";

const SRC = "C:/Users/micha/OneDrive/Documents/PropertyTools/Design/CloseBoss/Avatars";
const OUT = process.argv[2] || "C:/Users/micha/AppData/Local/Temp/claude/C--Users-micha-OneDrive-Documents-PropertyTools-Propertytoolsai/8419a77a-0835-4235-9012-2284651f7551/scratchpad/avatars";

// Map persona id -> source sheet file. Sheets are 1536x1024, same template.
const MAP = {
  max: "Max - The Captain of Your AI Real Estate Team.png",
  emma: "Emma.png",
  chris: "Chris.png",
  ruby: "Ruby.png",
  grace: "Grace.png",
  oliver: "Oliver.png",
};

// Crop rect for the TOP "CLOSE UP" headshot. The close-up sits top-right on
// every sheet, but the face is centered on some and left-shifted on others, so
// each id gets its own `left`; `top`/size are shared.
const SIZE = 222;
const TOP = 46;
const LEFT = { max: 1289, emma: 1289, chris: 1289, ruby: 1244, grace: 1244, oliver: 1266 };

import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

for (const [id, file] of Object.entries(MAP)) {
  const out = path.join(OUT, `${id}.png`);
  await sharp(path.join(SRC, file))
    .extract({ left: LEFT[id], top: TOP, width: SIZE, height: SIZE })
    .resize(512, 512, { fit: "cover" })
    .png()
    .toFile(out);
  console.log("wrote", out);
}
