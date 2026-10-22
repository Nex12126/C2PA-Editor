import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = 'src/assets/swarm-logo.webp'
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(sizes.map((size) => sharp(source)
  .resize(size, size, { fit: 'cover' })
  .png({ compressionLevel: 9 })
  .toBuffer()))

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)

let offset = header.length + images.length * 16
const entries = images.map((image, index) => {
  const size = sizes[index]
  const entry = Buffer.alloc(16)
  entry[0] = size === 256 ? 0 : size
  entry[1] = size === 256 ? 0 : size
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(image.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += image.length
  return entry
})

await mkdir('build', { recursive: true })
await writeFile('build/icon.ico', Buffer.concat([header, ...entries, ...images]))