import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brandProtected } from '../../src/core/protection.ts'

const win = (title: string, className: string, processPath: string) => ({ title, className, processPath })

test('brandProtected matches DSH process-path segments', () => {
  assert.equal(brandProtected(win('Chat', 'Chrome_WidgetWin_1', 'C:\\Program Files\\DSH\\dsh.exe')), true)
  assert.equal(brandProtected(win('Chat', 'Chrome_WidgetWin_1', '/opt/deepseek/deepseek')), true)
  assert.equal(brandProtected(win('Chat', 'Chrome_WidgetWin_1', 'C:\\tools\\harness\\harness.exe')), true)
})

test('brandProtected matches DSH brand in title', () => {
  assert.equal(brandProtected(win('DeepSeek Chat', 'Chrome_WidgetWin_1', 'C:\\app\\chrome.exe')), true)
  assert.equal(brandProtected(win('DSH Harness', 'Chrome_WidgetWin_1', 'C:\\app\\chrome.exe')), true)
})

test('brandProtected protects segments prefixed with dsh- (baseline behavior)', () => {
  // A folder literally named 'dsh-stuff' is treated as DSH via the startsWith('dsh-') rule.
  assert.equal(brandProtected(win('Notes', 'Notepad', 'C:\\dsh-stuff\\notes.exe')), true)
})

test('brandProtected does not match a folder merely containing dsh (e.g. mysandsh)', () => {
  assert.equal(brandProtected(win('Sandbox', 'SandboxHost', 'C:\\mysandsh\\app.exe')), false)
})

test('brandProtected does not match an unrelated app', () => {
  assert.equal(brandProtected(win('Visual Studio Code', 'Chrome_WidgetWin_1', 'C:\\Program Files\\Microsoft VS Code\\Code.exe')), false)
})

test('brandProtected matches class names', () => {
  assert.equal(brandProtected(win('Random', 'dsh Window', 'C:\\app\\x.exe')), true)
  assert.equal(brandProtected(win('Random', 'deepseek tool', 'C:\\app\\x.exe')), true)
})

test('brandProtected does not match a class that merely contains dsh', () => {
  // (dsh|deepseek|harness) requires a whole-word match.
  assert.equal(brandProtected(win('Random', 'dshWidget', 'C:\\app\\x.exe')), false)
})
