/**
 * Pack-time sanity checks for dsh-computer-use.
 *
 * Verifies the Windows package only ships Windows-native artifacts and that
 * the shared core/providers sources are present. Run via:
 *   node scripts/package-check.mjs
 */
import { execFileSync } from 'node:child_process'

let dry
if (process.platform === 'win32') {
  const cmd = process.env.ComSpec ?? 'cmd.exe'
  dry = execFileSync(cmd, ['/d', '/s', '/c', 'npm pack --dry-run --json'], { encoding: 'utf8' })
} else {
  dry = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
}
const files = JSON.parse(dry)[0]?.files ?? []

const forbiddenPatterns = [
  /(^|\/)lib\/providers\//,
  /(^|\/)lib\/types\/providers\//,
  /(^|\/)src\/providers\/(macos|linux)\//,
  /(^|\/)packages\//,
  /providers\/(macos|linux)\/.*\.(mm|c|gyp)$/,
]
const forbidden = files.filter((f) => forbiddenPatterns.some((re) => re.test(f.path)))
if (forbidden.length > 0) {
  console.error('Windows package must not include macOS/Linux sources or compiled output:')
  for (const f of forbidden) console.error('  -', f.path)
  process.exit(1)
}

const required = [
  'lib/index.js',
  'lib/runtime.js',
  'lib/tools.js',
  'native/index.mjs',
  'native/binding.gyp',
]
for (const path of required) {
  if (!files.some((f) => f.path === path || f.path.endsWith('/' + path))) {
    console.error(`Missing required packed file: ${path}`)
    process.exit(1)
  }
}

console.log(`package-check OK: ${files.length} files in package`)
