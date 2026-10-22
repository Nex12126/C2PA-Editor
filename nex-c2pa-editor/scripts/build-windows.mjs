import { execSync } from 'node:child_process'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = await import('../package.json', { with: { type: 'json' } })
const outputDir = join(tmpdir(), `NexMetaEditor-${process.pid}`)
const outputFile = `Nexs-Meta-Editor-${packageJson.default.version}-portable.exe`
const shell = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : '/bin/sh'

try {
  execSync('npm run build && npm run build:icon', { cwd: projectRoot, shell, stdio: 'inherit' })
  execSync(`npx electron-builder --win portable --x64 "--config.directories.output=${outputDir}"`, {
    cwd: projectRoot,
    shell,
    stdio: 'inherit',
  })

  const artifactsDir = join(projectRoot, 'artifacts')
  await mkdir(artifactsDir, { recursive: true })
  await copyFile(join(outputDir, outputFile), join(artifactsDir, outputFile))
  console.log(`Portable app created: ${join(artifactsDir, outputFile)}`)
} finally {
  await rm(outputDir, { recursive: true, force: true })
}