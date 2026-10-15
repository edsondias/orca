import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { getActiveWorktreeContext } from './helpers/markdown-editor-fixture'

const EMPTY_SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {}
})

async function openDrawing(
  page: Page,
  context: { rootPath: string; worktreeId: string },
  filePath: string
): Promise<void> {
  await page.evaluate(
    ({ filePath, relativePath, worktreeId }) => {
      window.__store!.getState().openFile({
        filePath,
        relativePath,
        worktreeId,
        language: 'excalidraw',
        mode: 'edit'
      })
    },
    {
      filePath,
      relativePath: path.relative(context.rootPath, filePath),
      worktreeId: context.worktreeId
    }
  )
}

async function drawRectangle(page: Page): Promise<void> {
  const canvas = page.locator('.excalidraw canvas.interactive')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Excalidraw canvas has no bounding box')
  }
  // Why: the corner and top edge hold overlay UI (menu button, toolbar, properties panel).
  await canvas.click({ position: { x: 600, y: 500 } })
  await page.keyboard.press('r')
  await page.mouse.move(box.x + 500, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 660, box.y + 400, { steps: 8 })
  await page.mouse.up()
}

// Why: parks the 400 ms commit debounce so only the unmount flush can save the draft.
async function holdCommitDebounce(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Why: the DOM-only view; `window` also carries Node's setTimeout type under this tsconfig.
    const timers: Pick<Window, 'setTimeout'> = window
    const originalSetTimeout = timers.setTimeout.bind(window)
    timers.setTimeout = (handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      originalSetTimeout(handler, timeout === 400 ? 60_000 : timeout, ...args)
  })
}

test.describe('Excalidraw editor', () => {
  let directory = ''

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    const context = await getActiveWorktreeContext(orcaPage)
    directory = path.join(context.rootPath, `excalidraw-e2e-${randomUUID()}`)
    await mkdir(directory, { recursive: true })
  })

  test.afterEach(async () => {
    if (!directory) {
      return
    }
    try {
      await rm(directory, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup must not hide the editor regression assertion.
    }
    directory = ''
  })

  test('draws a rectangle and saves standard scene JSON with Ctrl+S', async ({
    orcaPage
  }, testInfo) => {
    test.setTimeout(120_000)
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'scene.excalidraw')
    await writeFile(filePath, EMPTY_SCENE, 'utf8')
    await openDrawing(orcaPage, context, filePath)
    await drawRectangle(orcaPage)
    await orcaPage.keyboard.press('ControlOrMeta+S')
    await expect
      .poll(async () => {
        const saved: { type: string; elements: { type: string }[] } = JSON.parse(
          await readFile(filePath, 'utf8')
        )
        return [saved.type, saved.elements.map((element) => element.type)]
      })
      .toEqual(['excalidraw', ['rectangle']])
    await orcaPage.screenshot({ path: testInfo.outputPath('excalidraw-editor.png') })
  })

  test('keeps the last stroke when switching to Source right after drawing', async ({
    orcaPage
  }) => {
    test.setTimeout(120_000)
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'flush.excalidraw')
    await writeFile(filePath, EMPTY_SCENE, 'utf8')
    await openDrawing(orcaPage, context, filePath)
    await holdCommitDebounce(orcaPage)
    await drawRectangle(orcaPage)
    const readDraft = (): Promise<string> =>
      orcaPage.evaluate(() => {
        const state = window.__store!.getState()
        return state.editorDrafts[state.activeFileId ?? ''] ?? ''
      })
    // Why: proves the debounce is parked, so the poll below cannot be satisfied by it.
    expect(await readDraft()).not.toContain('"rectangle"')
    await orcaPage.getByRole('radio', { name: 'Source' }).click()
    await expect.poll(readDraft).toContain('"rectangle"')
    await expect(orcaPage.locator('.monaco-editor .view-lines')).toContainText('"rectangle"')
  })

  test('opens an empty file as a blank drawing', async ({ orcaPage }) => {
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'new.excalidraw')
    await writeFile(filePath, '', 'utf8')
    await openDrawing(orcaPage, context, filePath)
    await expect(orcaPage.locator('.excalidraw canvas.interactive')).toBeVisible({
      timeout: 30_000
    })
    await expect(orcaPage.getByText('This drawing could not be opened.')).toHaveCount(0)
  })

  test('shows an error for a file that is not a scene and leaves it untouched', async ({
    orcaPage
  }) => {
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'broken.excalidraw')
    const original = '{"type":"excalidrawlib","libraryItems":[]}'
    await writeFile(filePath, original, 'utf8')
    await openDrawing(orcaPage, context, filePath)
    const errorText = orcaPage.getByText('This drawing could not be opened.')
    await expect(errorText).toBeVisible()
    await errorText.click()
    await orcaPage.keyboard.press('ControlOrMeta+S')
    // Why: asserting the absence of a write, so a late async save gets its chance to land.
    await orcaPage.waitForTimeout(1000)
    expect(await readFile(filePath, 'utf8')).toBe(original)
    await expect(errorText).toBeVisible()
  })
})
