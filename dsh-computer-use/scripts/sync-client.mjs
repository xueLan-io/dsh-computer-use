import { copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
copyFileSync(
  resolve(packageRoot, 'client', 'permission-panel.js'),
  resolve(packageRoot, 'lib', 'client.js'),
)
