import { cp, mkdir, readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Keep OCR and PDF support entirely on this origin. Resumes never leave the browser.
const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(projectRoot, 'public', 'ocr')

async function packageRoot(name) {
  let directory = dirname(require.resolve(name))
  while (directory !== dirname(directory)) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (metadata.name === name) return directory
    } catch {
      // A package entry point can be nested several levels below its manifest.
    }
    directory = dirname(directory)
  }
  throw new Error(`Cannot locate installed package: ${name}`)
}

await mkdir(destination, { recursive: true })

const tesseractRoot = await packageRoot('tesseract.js')
await cp(join(tesseractRoot, 'dist', 'worker.min.js'), join(destination, 'worker.min.js'))

const coreRoot = await packageRoot('tesseract.js-core')
const coreFiles = (await readdir(coreRoot)).filter((name) => /^tesseract-core.*\.(wasm|js)$/.test(name))
if (coreFiles.length === 0) throw new Error('No Tesseract WebAssembly assets found')
await mkdir(join(destination, 'core'), { recursive: true })
for (const name of coreFiles) {
  await cp(join(coreRoot, name), join(destination, 'core', name))
}

await mkdir(join(destination, 'lang'), { recursive: true })
for (const language of ['kor', 'eng']) {
  const languageRoot = await packageRoot(`@tesseract.js-data/${language}`)
  await cp(
    join(languageRoot, '4.0.0_best_int', `${language}.traineddata.gz`),
    join(destination, 'lang', `${language}.traineddata.gz`),
  )
}

const pdfRoot = await packageRoot('pdfjs-dist')
await mkdir(join(destination, 'pdfjs'), { recursive: true })
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(join(pdfRoot, directory), join(destination, 'pdfjs', directory), { recursive: true })
}

console.log('Prepared local Korean/English OCR and PDF assets in public/ocr')
