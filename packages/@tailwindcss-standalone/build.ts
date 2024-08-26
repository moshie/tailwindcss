import { $, Glob } from 'bun'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let embedded = new Glob('../tailwindcss/**/*.{css,json}')

async function buildForPlatform(triple: string, outfile: string) {
  let files = Array.from(embedded.scanSync(__dirname))

  // We wrap this in a retry because occasionally the atomic rename fails for some reason
  for (let i = 0; i < 5; ++i) {
    try {
      return await $`bun build --compile --target=${triple} ./src/index.ts --outfile=${outfile} ${{ raw: files.join(' ') }}`
    } catch (err) {
      if (i < 5) continue

      throw new Error(`Failed to build for platform ${triple}`, { cause: err })
    }
  }
}

async function build(triple: string, file: string) {
  let start = process.hrtime.bigint()

  let outfile = path.resolve(__dirname, `dist/${file}`)

  await buildForPlatform(triple, outfile)

  await new Promise((resolve) => setTimeout(resolve, 100))

  let content = await readFile(outfile)
  let sum = createHash('sha256').update(content).digest('hex')

  let elapsed = process.hrtime.bigint() - start

  return {
    triple,
    file,
    sum,
    elapsed,
  }
}

await mkdir(path.resolve(__dirname, 'dist'), { recursive: true })

// Build platform binaries and checksum them
let results = await Promise.all([
  build('bun-linux-arm64', './tailwindcss-linux-arm64'),
  build('bun-linux-x64', './tailwindcss-linux-x64'),
  // build('linux-armv7', 'tailwindcss-linux-armv7'),
  build('bun-darwin-arm64', './tailwindcss-macos-arm64'),
  build('bun-darwin-x64', './tailwindcss-macos-x64'),
  build('bun-windows-x64', './tailwindcss-windows-x64.exe'),
  // buildForPlatform('win32-arm64', 'tailwindcss-windows-arm64'),
])

// Write the checksums to a file
let sumsFile = path.resolve(__dirname, 'dist/sha256sums.txt')
let sums = results.map(({ file, sum }) => `${sum}  ${file}`)

console.table(
  results.map(({ triple, sum, elapsed }) => ({
    triple,
    sum,
    elapsed: `${(Number(elapsed) / 1e6).toFixed(0)}ms`,
  })),
)

await writeFile(sumsFile, sums.join('\n') + '\n')