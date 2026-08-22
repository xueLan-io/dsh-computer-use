import { test } from 'node:test'
import assert from 'node:assert/strict'
import { point, validateElementIndex, type RectLike } from '../../src/core/point.ts'
import { ComputerUseError } from '../../src/core/errors.ts'

const rect: RectLike = { left: 100, top: 50, right: 500, bottom: 350, width: 400, height: 300 }

test('point maps window-relative coordinates to screen space', () => {
  assert.deepEqual(point(rect, 0, 0), { x: 100, y: 50 })
  assert.deepEqual(point(rect, 399, 299), { x: 499, y: 349 })
})

test('point treats auto/screenshot/window as window-relative', () => {
  assert.deepEqual(point(rect, 10, 20, 'screenshot'), { x: 110, y: 70 })
  assert.deepEqual(point(rect, 10, 20, 'window'), { x: 110, y: 70 })
  assert.deepEqual(point(rect, 10, 20, 'auto'), { x: 110, y: 70 })
})

test('point passes screen coordinates through unchanged', () => {
  assert.deepEqual(point(rect, 120, 60, 'screen'), { x: 120, y: 60 })
})

test('point rejects out-of-bounds window-relative coordinates', () => {
  assert.throws(() => point(rect, -1, 0), (e: unknown) => e instanceof ComputerUseError && e.code === 'COORDINATE_OUT_OF_BOUNDS')
  assert.throws(() => point(rect, 400, 0), (e: unknown) => e instanceof ComputerUseError && e.code === 'COORDINATE_OUT_OF_BOUNDS')
  assert.throws(() => point(rect, 0, 300), (e: unknown) => e instanceof ComputerUseError && e.code === 'COORDINATE_OUT_OF_BOUNDS')
})

test('point rejects out-of-bounds screen coordinates', () => {
  assert.throws(() => point(rect, 99, 50, 'screen'), (e: unknown) => e instanceof ComputerUseError && e.code === 'COORDINATE_OUT_OF_BOUNDS')
  assert.throws(() => point(rect, 100, 49, 'screen'), (e: unknown) => e instanceof ComputerUseError && e.code === 'COORDINATE_OUT_OF_BOUNDS')
})

test('point rejects non-integer coordinates', () => {
  assert.throws(() => point(rect, 1.5, 0), (e: unknown) => e instanceof ComputerUseError && e.code === 'COORDINATE_OUT_OF_BOUNDS')
})

test('validateElementIndex rejects negative numbers', () => {
  assert.throws(() => validateElementIndex(-1), (e: unknown) => e instanceof ComputerUseError && e.code === 'INVALID_ELEMENT_INDEX')
  assert.throws(() => validateElementIndex(1.5), (e: unknown) => e instanceof ComputerUseError && e.code === 'INVALID_ELEMENT_INDEX')
  assert.doesNotThrow(() => validateElementIndex(0))
})
