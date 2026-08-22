import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowsCapabilities, CAPABILITY_UNAVAILABLE } from '../../src/core/capability.ts'

test('windowsCapabilities advertises the full capability set', () => {
  const caps = windowsCapabilities()
  for (const key of [
    'windowEnumeration',
    'windowCapture',
    'accessibilityTree',
    'foregroundInput',
    'backgroundInput',
    'semanticClick',
    'clipboard',
    'clipboardRestore',
    'overlay',
    'launchApp',
  ] as const) {
    assert.equal(caps[key], true)
  }
})

test('CAPABILITY_UNAVAILABLE is a stable error code', () => {
  assert.equal(CAPABILITY_UNAVAILABLE, 'CAPABILITY_UNAVAILABLE')
})
