import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isElementRef, type ElementRef } from '../../src/core/observation-element.ts'

test('isElementRef validates a complete ref', () => {
  const ref: ElementRef = { elementId: 'e1', observationId: 'obs_1', checksum: 'abc' }
  assert.equal(isElementRef(ref), true)
})

test('isElementRef accepts the legacy elementIndex field', () => {
  const ref: ElementRef = { elementId: 'e1', observationId: 'obs_1', checksum: 'abc', elementIndex: 3 }
  assert.equal(isElementRef(ref), true)
})

test('isElementRef rejects incomplete or non-object values', () => {
  assert.equal(isElementRef(null), false)
  assert.equal(isElementRef(undefined), false)
  assert.equal(isElementRef({ observationId: 'obs_1', checksum: 'abc' }), false)
  assert.equal(isElementRef('string'), false)
})
