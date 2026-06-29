// tests/registry-unit.test.ts
//
// Pure unit tests for normalizeSchema — the JSON-Schema shaping the registry
// applies to each LayersAgent command's live schema before exposing it as an
// MCP inputSchema. No browser/network. `buildToolRegistry` itself needs a live
// page (covered by registry.test.ts), but this shaping logic is pure.
import { describe, it, expect } from 'vitest'
import { normalizeSchema } from '../src/tools/registry.js'

describe('normalizeSchema non-object inputs', () => {
  it('returns an empty object schema for null/undefined/primitives', () => {
    for (const raw of [null, undefined, 42, 'x', true]) {
      const s = normalizeSchema(raw)
      expect(s.type).toBe('object')
      expect(s.properties).toEqual({})
      expect(s.additionalProperties).toBe(false)
      expect(s.required).toBeUndefined()
    }
  })

  it('returns an empty object schema for a non-object-typed schema', () => {
    const s = normalizeSchema({ type: 'string' })
    expect(s).toEqual({ type: 'object', properties: {}, additionalProperties: false })
  })

  it('treats an array as a non-object schema', () => {
    // typeof [] === 'object' but it has no `type: 'object'` — bottom branch.
    const s = normalizeSchema([1, 2, 3])
    expect(s.properties).toEqual({})
    expect(s.additionalProperties).toBe(false)
  })
})

describe('normalizeSchema object inputs', () => {
  it('preserves properties and required verbatim', () => {
    const raw = {
      type: 'object',
      properties: { x: { type: 'number' }, name: { type: 'string' } },
      required: ['x']
    }
    const s = normalizeSchema(raw)
    expect(s.type).toBe('object')
    expect(s.properties).toEqual(raw.properties)
    expect(s.required).toEqual(['x'])
    // additionalProperties defaults to false when the source omits it.
    expect(s.additionalProperties).toBe(false)
  })

  it('passes through an explicit additionalProperties: true', () => {
    const s = normalizeSchema({ type: 'object', properties: {}, additionalProperties: true })
    expect(s.additionalProperties).toBe(true)
  })

  it('drops a non-array required to undefined', () => {
    const s = normalizeSchema({ type: 'object', required: 'x' })
    expect(s.required).toBeUndefined()
  })

  it('coerces a missing properties to an empty object', () => {
    const s = normalizeSchema({ type: 'object' })
    expect(s.properties).toEqual({})
  })

  it('coerces a null properties to an empty object', () => {
    const s = normalizeSchema({ type: 'object', properties: null })
    expect(s.properties).toEqual({})
  })

  it('ignores a non-boolean additionalProperties and defaults to false', () => {
    const s = normalizeSchema({ type: 'object', additionalProperties: 'yes' })
    expect(s.additionalProperties).toBe(false)
  })
})
