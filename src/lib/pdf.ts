import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker, OEM, PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface ExtractionProgress {
  stage: string
  /** Overall progress from 0 to 1. */
  progress: number
}

export interface ExtractedResume {
  text: string
  pages: number
  usedOcr: boolean
}

interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

const MAX_BYTES = 20 * 1024 * 1024
const MAX_PAGES = 20

function isTextItem(item: unknown): item is TextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item
}

/** Retain visual line breaks instead of flattening a resume into a single sentence. */
function reconstructLines(items: unknown[]): string {
  const lines: string[] = []
  let line = ''
  let previous: TextItem | undefined

  for (const item of items) {
    if (!isTextItem(item)) continue
    if (previous && Math.abs(previous.transform[5] - item.transform[5]) > Math.max(3, item.height * 0.45)) {
      if (line.trim()) lines.push(line.trim())
      line = ''
      previous = undefined
    }

    if (previous && line && item.str && !/\s$/.test(line) && !/^\s/.test(item.str)) {
      const gap = item.transform[4] - (previous.transform[4] + previous.width)
      if (gap > Math.max(1.5, item.height * 0.12)) line += ' '
    }
    line += item.str

    if (item.hasEOL) {
      if (line.trim()) lines.push(line.trim())
      line = ''
      previous = undefined
    } else {
      previous = item
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines.join('\n').replace(/\u0000/g, '').trim()
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('이력서 읽기를 취소했습니다.', 'AbortError')
}

function readableCharacterCount(text: string) {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length
}

/**
 * Extract embedded text when available; OCR image-based pages locally in a worker.
 * The PDF, rendered page images and recognized text are never sent to a server.
 */
export async function extractResume(
  file: File,
  onProgress: (progress: ExtractionProgress) => void,
  signal?: AbortSignal,
): Promise<ExtractedResume> {
  assertNotAborted(signal)
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('PDF 형식의 이력서를 선택해 주세요.')
  }
  if (file.size === 0) throw new Error('빈 파일은 읽을 수 없습니다.')
  if (file.size > MAX_BYTES) throw new Error('20MB 이하의 PDF 파일을 선택해 주세요.')

  onProgress({ stage: 'PDF 파일을 확인하고 있어요', progress: 0 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  assertNotAborted(signal)
  const signature = new TextDecoder().decode(bytes.subarray(0, Math.min(1024, bytes.length)))
  if (!signature.includes('%PDF-')) throw new Error('올바른 PDF 파일이 아닙니다. 파일을 확인해 주세요.')

  const assetBase = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.origin).href
  const loadingTask = getDocument({
    data: bytes,
    cMapUrl: `${assetBase}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}pdfjs/standard_fonts/`,
    wasmUrl: `${assetBase}pdfjs/wasm/`,
  })
  let pdf: PDFDocumentProxy | undefined
  let worker: Worker | undefined
  let rendering: RenderTask | undefined
  let currentPage = 1
  let totalPages = 1
  let usedOcr = false
  let rejectCancellation!: (error: DOMException) => void
  const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject })
  // Terminating a Tesseract worker does not settle its in-flight recognize promise.
  // Race cancellation explicitly so closing an upload always returns promptly.
  void cancellation.catch(() => undefined)
  const wait = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, cancellation])
  let rejectOcrFailure!: (error: Error) => void
  const ocrFailure = new Promise<never>((_resolve, reject) => { rejectOcrFailure = reject })
  void ocrFailure.catch(() => undefined)

  const abort = () => {
    rejectCancellation(new DOMException('이력서 읽기를 취소했습니다.', 'AbortError'))
    rendering?.cancel()
    void loadingTask.destroy().catch(() => undefined)
    if (worker) void worker.terminate().catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  try {
    pdf = await wait(loadingTask.promise)
    assertNotAborted(signal)
    if (pdf.numPages > MAX_PAGES) throw new Error('20페이지 이하의 이력서 PDF를 선택해 주세요.')
    totalPages = pdf.numPages
    const pages: string[] = []

    for (currentPage = 1; currentPage <= totalPages; currentPage += 1) {
      assertNotAborted(signal)
      const page = await wait(pdf.getPage(currentPage))
      onProgress({
        stage: `이력서 텍스트를 읽고 있어요 (${currentPage}/${totalPages})`,
        progress: (currentPage - 1) / totalPages,
      })
      const content = await wait(page.getTextContent())
      let text = reconstructLines(content.items)

      // A scanned PDF can contain a tiny selectable footer; do not treat that as a text page.
      if (readableCharacterCount(text) < 30) {
        usedOcr = true
        onProgress({
          stage: `스캔한 페이지의 글자를 인식하고 있어요 (${currentPage}/${totalPages})`,
          progress: (currentPage - 1) / totalPages,
        })
        if (!worker) {
          const initialization = createWorker(['kor', 'eng'], OEM.LSTM_ONLY, {
            workerPath: `${assetBase}worker.min.js`,
            corePath: `${assetBase}core`,
            langPath: `${assetBase}lang`,
            workerBlobURL: false,
            gzip: true,
            errorHandler() {
              rejectOcrFailure(new Error('OCR을 실행하지 못했어요. 페이지를 새로고침한 뒤 다시 시도하거나 이력서 내용을 직접 붙여 넣어 주세요.'))
            },
            logger(message) {
              if (signal?.aborted) return
              const fraction = message.status === 'recognizing text' ? message.progress : 0
              onProgress({
                stage: message.status === 'recognizing text'
                  ? `글자를 인식하고 있어요 (${currentPage}/${totalPages})`
                  : `한국어·영어 OCR을 준비하고 있어요 (${currentPage}/${totalPages})`,
                progress: Math.min(0.99, (currentPage - 1 + fraction) / totalPages),
              })
            },
          })
          // If cancellation wins while the worker initializes, clean it up when ready.
          void initialization.then((readyWorker) => {
            if (signal?.aborted) void readyWorker.terminate().catch(() => undefined)
          }).catch(() => undefined)
          worker = await wait(Promise.race([initialization, ocrFailure]))
          assertNotAborted(signal)
          await wait(Promise.race([worker.setParameters({
            // Automatic layout detection can discard short Korean headings/lines.
            // A single text block keeps those resume details in the editable output.
            tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
            preserve_interword_spaces: '1',
            user_defined_dpi: '180',
          }), ocrFailure]))
        }
        assertNotAborted(signal)
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(2.5, 2800 / Math.max(baseViewport.width, baseViewport.height))
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('브라우저에서 PDF 이미지를 처리할 수 없습니다.')
        try {
          rendering = page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' })
          await wait(rendering.promise)
          rendering = undefined
          assertNotAborted(signal)
          const result = await wait(Promise.race([worker.recognize(canvas), ocrFailure]))
          text = result.data.text.replace(/\u0000/g, '').trim()
        } finally {
          rendering = undefined
          canvas.width = 0
          canvas.height = 0
        }
      }
      pages.push(text)
      page.cleanup()
      onProgress({ stage: `${currentPage}/${totalPages}페이지 인식 완료`, progress: currentPage / totalPages })
    }

    const text = pages.filter(Boolean).join('\n\n').trim()
    if (readableCharacterCount(text) < 5) {
      throw new Error('읽을 수 있는 글자를 찾지 못했어요. 더 선명한 PDF를 올리거나 이력서 내용을 직접 붙여 넣어 주세요.')
    }
    onProgress({ stage: '이력서를 모두 읽었어요', progress: 1 })
    return { text, pages: totalPages, usedOcr }
  } catch (error) {
    assertNotAborted(signal)
    const name = error instanceof Error ? error.name : ''
    if (name === 'PasswordException') throw new Error('암호가 걸린 PDF입니다. 암호를 해제한 파일을 올려 주세요.')
    if (name === 'InvalidPDFException') throw new Error('PDF 파일이 손상되었거나 읽을 수 없는 형식입니다.')
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    if (worker) await worker.terminate().catch(() => undefined)
    await loadingTask.destroy().catch(() => undefined)
  }
}
