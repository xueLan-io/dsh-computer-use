import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ComputerUseError } from '../../src/core/errors.ts'

test('ComputerUseError.toJSON() has a stable shape', () => {
  const err = new ComputerUseError('PROTECTED_WINDOW', 'Operation on a protected DSH window is forbidden', 'DENY')
  const json = err.toJSON()
  assert.deepEqual(json, {
    ok: false,
    code: 'PROTECTED_WINDOW',
    recovery: 'DENY',
    message: 'Operation on a protected DSH window is forbidden',
  })
})

test('ComputerUseError defaults recovery to NONE', () => {
  const err = new ComputerUseError('WINDOW_NOT_FOUND', 'window not found')
  assert.equal(err.recovery, 'NONE')
  assert.equal(err.name, 'ComputerUseError')
  assert.ok(err instanceof Error)
})

test('ComputerUseError preserves the machine-readable code', () => {
  const err = new ComputerUseError('OBSOLETE_OBSERVATION', 'observation expired', 'REQUIRES_REFRESH')
  assert.equal(err.code, 'OBSOLETE_OBSERVATION')
})
