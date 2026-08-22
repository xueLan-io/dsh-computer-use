import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveWindowId,
  parseWindowId,
  extractLegacyHwnd,
} from '../../src/core/identity.ts'

test('resolveWindowId wraps a numeric HWND into a win:hWnd id', () => {
  assert.equal(resolveWindowId(0x123456), 'win:hWnd:0000000000123456')
  assert.equal(resolveWindowId(123), 'win:hWnd:000000000000007b')
})

test('resolveWindowId passes existing strings through', () => {
  assert.equal(resolveWindowId('win:hWnd:0000000000123456'), 'win:hWnd:0000000000123456')
  assert.equal(resolveWindowId('mac:window:processId:seq'), 'mac:window:processId:seq')
})

test('resolveWindowId rejects negative/float numeric ids', () => {
  assert.throws(() => resolveWindowId(-1), TypeError)
  assert.throws(() => resolveWindowId(1.5), TypeError)
})

test('extractLegacyHwnd recovers the HWND from a Windows id', () => {
  assert.equal(extractLegacyHwnd('win:hWnd:0000000000123456'), 0x123456)
  assert.equal(extractLegacyHwnd('win:hWnd:7b'), 0x7b)
})

test('extractLegacyHwnd returns undefined for non-Windows ids', () => {
  assert.equal(extractLegacyHwnd('mac:window:1:2'), undefined)
  assert.equal(extractLegacyHwnd('x11:xid:0x03400007'), undefined)
  assert.equal(extractLegacyHwnd('garbage'), undefined)
})

test('parseWindowId splits platform and raw payload', () => {
  assert.deepEqual(parseWindowId('win:hWnd:0000000000123456'), { platform: 'win', raw: 'hWnd:0000000000123456' })
  assert.deepEqual(parseWindowId('x11:xid:0x03400007'), { platform: 'x11', raw: 'xid:0x03400007' })
  assert.equal(parseWindowId('nocolon'), null)
})
