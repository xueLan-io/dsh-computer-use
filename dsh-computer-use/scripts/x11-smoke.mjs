/**
 * X11 helper end-to-end smoke test against a headless Xvfb server.
 *
 * Verifies the real JSON-lines IPC contract between the X11Provider (Node)
 * and the native helper binary (no mocks). Requires Linux + Xvfb:
 *   xvfb-run-independent: Xvfb :99 > /dev/null 2>&1 &  (or install xvfb)
 *   node --experimental-strip-types scripts/x11-smoke.mjs
 *
 * The helper binary is discovered via DSH_COMPUTER_USE_X11_HELPER or the
 * default name on PATH.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CI = process.env.CI === 'true'
const DISPLAY = ':99'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let xvfb = null
async function startXvfb() {
  try {
    xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore' })
  } catch {
    xvfb = null
  }
  if (!xvfb) {
    const message = 'Xvfb is not available; install the xvfb package'
    if (CI) {
      console.error(message)
      process.exit(1)
    }
    console.log(`SKIP: ${message}`)
    process.exit(0)
  }
  await sleep(1000) // wait for the X socket
}

async function stopXvfb() {
  if (xvfb) xvfb.kill('SIGTERM')
}

const fails = []
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`ok - ${label}`)
  } else {
    console.error(`FAIL - ${label}${detail ? `: ${detail}` : ''}`)
    fails.push(label)
  }
}

function findHelper() {
  // Prefer the explicit env override.
  const explicit = process.env.DSH_COMPUTER_USE_X11_HELPER
  if (explicit) return explicit
  // Then the binary built next to this source tree.
  const built = join(process.cwd(), 'src', 'providers', 'linux', 'x11', 'dsh-computer-use-x11-helper')
  try {
    execFileSync('test', ['-x', built], { stdio: 'ignore' })
    return built
  } catch {
    /* fall through to PATH */
  }
  // Finally, a helper already installed on PATH.
  const name = 'dsh-computer-use-x11-helper'
  for (const dir of (process.env.PATH ?? '').split(':').filter(Boolean)) {
    const candidate = join(dir, name)
    try {
      execFileSync('test', ['-x', candidate], { stdio: 'ignore' })
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

async function main() {
  const helper = findHelper()
  if (!helper) {
    console.error('X11 helper binary not found; build it with: make -C src/providers/linux/x11')
    process.exit(1)
  }
  console.log(`using helper: ${helper}`)
  process.env.DSH_COMPUTER_USE_X11_HELPER = helper
  process.env.DISPLAY = DISPLAY

  await startXvfb()
  try {
    const { X11Provider } = await import('../src/providers/linux/x11/provider.ts')
    const provider = new X11Provider()

    // 1. Enumeration returns an array (possibly empty on a bare Xvfb).
    const windows = await provider.listWindows()
    check('listWindows returns an array', Array.isArray(windows))
    console.log(`    -> ${windows.length} window(s)`)

    // 2. A nonexistent window id must reject (never silently succeed).
    let rejected = false
    try {
      await provider.getWindow('x11:xid:0x00000001')
    } catch (error) {
      rejected = true
      check('getWindow rejects for a missing window', error instanceof Error)
    }
    if (!rejected) check('getWindow rejects for a missing window', false, 'unexpectedly resolved')

    // 3. Runtime info + capabilities are readable without native calls.
    const info = provider.runtimeInfo()
    check('runtimeInfo reports x11 provider', info.provider === 'x11')
    check('capabilities gate AT-SPI/clipboard off', provider.capabilities().accessibilityTree === false && provider.capabilities().clipboard === false)

    // 4. App launch parsing is host-side and must not crash the provider.
    const launched = await provider.launchApp({ app: 'true', args: [] })
    check('launchApp resolves and requires observation', launched.requiresObservation === true)

    await provider.dispose()
    check('dispose is clean', true)

  } finally {
    await stopXvfb()
  }

  if (fails.length) {
    console.error(`\n${fails.length} smoke check(s) failed`)
    process.exit(1)
  }
  console.log('\nX11 smoke: all checks passed')
}

await main()