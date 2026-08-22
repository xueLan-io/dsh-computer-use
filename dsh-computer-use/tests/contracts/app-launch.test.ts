import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkLaunchApp } from '../../src/core/app-launch.ts'
import { ComputerUseError } from '../../src/core/errors.ts'

function blocked(input: string): void {
  assert.throws(() => checkLaunchApp(input), (e: unknown) => e instanceof ComputerUseError && e.code === 'UNSAFE_APP', `expected ${JSON.stringify(input)} to be blocked`)
}

test('launch hardening blocks Windows backslash paths (review: split("/") bypass)', () => {
  blocked('C:\\Windows\\System32\\cmd.exe')
  blocked('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  blocked('C:\\Windows\\System32\\cmd')
  blocked('C:\\Windows\\System32\\taskmgr.exe')
  blocked('\\\\server\\share\\cmd.exe')
  blocked('C:/Windows/System32/cmd.exe')
})

test('launch hardening blocks Unix shells and interpreters', () => {
  blocked('/bin/bash')
  blocked('/usr/bin/python3')
  blocked('bash')
  blocked('osascript')
  blocked('sh')
  blocked('node')
})

test('launch hardening blocks macOS app names', () => {
  blocked('Terminal')
  blocked('Terminal.app')
  blocked('iTerm')
})

test('launch hardening rejects path traversal and control characters', () => {
  blocked('/tmp/../../etc/passwd')
  blocked('a..\\b')
  blocked('evil\u0000.exe')
  blocked('evil\u001b.png')
})

test('launch hardening rejects empty applications', () => {
  blocked('')
  blocked('   ')
})

test('launch hardening rejects control characters in arguments', () => {
  assert.throws(
    () => checkLaunchApp('calc.exe', ['--flag\u0000inject']),
    (e: unknown) => e instanceof ComputerUseError && e.code === 'UNSAFE_APP',
  )
})

test('launch hardening allows safe applications with string args', () => {
  const result = checkLaunchApp('C:\\Program Files\\Mozilla Firefox\\firefox.exe', ['--new-window', 42])
  assert.equal(result.app, 'C:\\Program Files\\Mozilla Firefox\\firefox.exe')
  assert.deepEqual(result.args, ['--new-window', '42'])
})

test('launch hardening case-insensitive on basenames', () => {
  blocked('C:\\WINDOWS\\SYSTEM32\\CMD.EXE')
  blocked('C:\\Windows\\System32\\PowerShell.EXE')
})