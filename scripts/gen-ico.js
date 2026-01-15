const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function genIco() {
  const input = path.resolve(process.cwd(), 'logo.png');
  const out = path.resolve(process.cwd(), 'build', 'logo.ico');
  if (!fs.existsSync(input)) {
    console.error('logo.png not found');
    process.exit(1);
  }
  await fs.promises.mkdir(path.dirname(out), { recursive: true });

  // produce a 256x256 PNG buffer
  const pngBuf = await sharp(input)
    .resize(256, 256, { fit: 'cover' })
    .png()
    .toBuffer();

  // ICO header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(1, 4); // count

  // Directory entry (16 bytes)
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // width (0 = 256)
  entry.writeUInt8(0, 1); // height (0 = 256)
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(pngBuf.length, 8); // bytes in resource
  entry.writeUInt32LE(header.length + entry.length, 12); // image offset

  const icoBuf = Buffer.concat([header, entry, pngBuf]);
  await fs.promises.writeFile(out, icoBuf);
  console.log('Wrote', out);
}

genIco().catch(err => { console.error(err); process.exit(1); });