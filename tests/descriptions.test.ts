// tests/descriptions.test.ts
//
// Pure unit tests for describeCommand — the hand-rolled per-command MCP tool
// descriptions. No browser/network. Verifies known commands get a prose blurb
// with a bracketed category label, that the effect-params category maps to the
// 'effect' label, and that unknown commands fall back to the documented stub.
import { describe, it, expect } from 'vitest'
import { describeCommand } from '../src/tools/descriptions.js'

describe('describeCommand known commands', () => {
  it('returns the blurb with a trailing bracketed category', () => {
    const d = describeCommand('getState')
    expect(d).toContain('snapshot of the editor state')
    expect(d.endsWith('[state]')).toBe(true)
  })

  it('maps the effect-params category to the [effect] label', () => {
    expect(describeCommand('addChildEffect').endsWith('[effect]')).toBe(true)
    expect(describeCommand('setLayerEffectParams').endsWith('[effect]')).toBe(true)
  })

  it('labels export commands under [export]', () => {
    expect(describeCommand('exportImage').endsWith('[export]')).toBe(true)
    expect(describeCommand('exportVideo').endsWith('[export]')).toBe(true)
  })

  it('every described command ends with a known bracketed label', () => {
    // A representative spread across categories. Each must be a real blurb
    // (not the fallback) terminated by `[label]`.
    const sample = [
      'getState', 'searchEffects', 'waitForJob', 'addLayer', 'addChildEffect',
      'getThumbnail', 'exportImage', 'selectAll', 'addLayerMask', 'paintStroke',
      'newProject', 'undo', 'setZoom', 'resizeCanvas', 'autoLevels',
      'listInstalledFonts', '_ping'
    ]
    const knownLabels = new Set([
      'state', 'effects', 'job', 'layer', 'effect', 'image', 'export',
      'selection', 'mask', 'drawing', 'project', 'history', 'settings',
      'canvas', 'auto', 'font', 'diag'
    ])
    for (const name of sample) {
      const d = describeCommand(name)
      expect(d, name).not.toContain('see https://')
      const m = d.match(/\[([a-z-]+)\]$/)
      expect(m, name).not.toBeNull()
      expect(knownLabels.has(m![1]), `${name} -> ${m![1]}`).toBe(true)
    }
  })
})

describe('describeCommand fallback', () => {
  it('returns the reference-doc stub for an unknown command', () => {
    expect(describeCommand('brandNewCommandNotYetDescribed')).toBe(
      'LayersAgent.brandNewCommandNotYetDescribed — ' +
        'see https://layers.noisefactor.io for command reference.'
    )
  })
})
