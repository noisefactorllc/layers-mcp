/**
 * Hand-rolled, per-command MCP tool descriptions for the Layers agent.
 *
 * The live Layers schema map (`/js/agent/schemas.js`) carries shape but no
 * prose, so MCP clients browsing the tool catalog need something more useful
 * than "LayersAgent.foo". These strings show up in `tools/list` results
 * verbatim.
 *
 * Conventions:
 *   - 1-2 sentences. Imperative voice ("Add…", "Return…").
 *   - Mention the category in brackets at the end (e.g. "[layer]") so a
 *     client doing a flat alphabetical list still groups visually.
 *   - For unknown commands (newly added in the layers repo but not yet
 *     described here), fall back to a category-only stub via `categoryHint`.
 *
 * Authoritative command list: `public/js/agent/index.js` in the layers repo.
 */

type Cat =
  | 'state'      // read-only inspection
  | 'effects'   // effect catalog browsing
  | 'job'        // job lifecycle (getJob/waitForJob/cancelJob)
  | 'layer'      // layer creation/mutation/order
  | 'effect-params' // child effect on a layer
  | 'image'     // canvas/layer bytes, thumbnails
  | 'export'    // exportImage/exportVideo
  | 'selection' // selection geometry & ops
  | 'mask'      // layer masks
  | 'drawing'   // brush/shape/fill on drawing layers
  | 'project'   // open/save/new/delete
  | 'history'   // undo/redo
  | 'settings'  // app settings, zoom, playback
  | 'canvas'    // resize/crop the canvas or image
  | 'auto'      // automatic image corrections
  | 'font'      // listInstalledFonts/installFontBundle
  | 'diag'      // _ping/_echo/_sleep test commands

const COMMANDS: Record<string, { cat: Cat; blurb: string }> = {
  // diagnostic / test
  _ping: { cat: 'diag', blurb: 'Diagnostic: round-trip test that returns { pong: true }.' },
  _echoNumber: { cat: 'diag', blurb: 'Diagnostic: echoes its `value` argument back. Used to exercise number-range validation.' },
  _echoEnum: { cat: 'diag', blurb: 'Diagnostic: echoes its `choice` argument back. Used to exercise enum validation.' },
  _echoNested: { cat: 'diag', blurb: 'Diagnostic: echoes its nested-object argument back. Used to exercise nested-shape validation.' },
  _sleep: { cat: 'diag', blurb: 'Diagnostic: resolves after `delayMs` ms. Used to exercise dispatcher serialization.' },

  // read-only state
  getState: { cat: 'state', blurb: 'Return a full snapshot of the editor state (project, canvas, layers, effects, masks, selection).' },
  getLayer: { cat: 'state', blurb: 'Return the snapshot of a single layer by id.' },
  getCanvasSize: { cat: 'state', blurb: 'Return the current canvas width and height in pixels.' },
  getSelection: { cat: 'state', blurb: 'Return the current pixel selection: bounding box plus pixel count.' },
  getProjectInfo: { cat: 'state', blurb: 'Return metadata for the currently open project (id, name, dimensions, last-saved time).' },
  listProjects: { cat: 'state', blurb: 'List all saved projects available to open.' },
  getSettings: { cat: 'settings', blurb: 'Return the current editor settings (theme, units, autosave, etc).' },
  getForegroundColor: { cat: 'state', blurb: 'Return the current foreground (brush/fill) color as an RGBA tuple.' },

  // effect catalog
  searchEffects: { cat: 'effects', blurb: 'Search the effect catalog. Filter by query string, namespace, or tags; limit results.' },
  listEffectCategories: { cat: 'effects', blurb: 'Return the list of effect category names.' },
  listCuratedEffects: { cat: 'effects', blurb: 'Return the curated/featured subset of the effect catalog.' },
  getEffectDefinition: { cat: 'effects', blurb: 'Return the parameter schema and metadata for a single effect by id.' },

  // jobs
  getJob: { cat: 'job', blurb: 'Return the current state of a job (status, progress, result if settled).' },
  waitForJob: { cat: 'job', blurb: 'Block until a job settles or the timeout elapses. Returns the final job state.' },
  cancelJob: { cat: 'job', blurb: 'Request cancellation of an in-flight job. Best-effort; encoder/extractor inner loops may not check the abort signal mid-frame.' },

  // layer creation & order
  addLayer: { cat: 'layer', blurb: 'Add a new layer. `kind` selects the type: effect, drawing, media (image/video bytes or URL), or text.' },
  deleteLayer: { cat: 'layer', blurb: 'Delete a layer by id.' },
  duplicateLayer: { cat: 'layer', blurb: 'Duplicate a layer in place above the original; returns the new layer id.' },
  reorderLayer: { cat: 'layer', blurb: 'Move a layer to a new z-order index.' },
  selectLayer: { cat: 'layer', blurb: 'Make a single layer the active selection.' },
  selectLayers: { cat: 'layer', blurb: 'Make a set of layers the active multi-selection.' },
  flattenImage: { cat: 'layer', blurb: 'Flatten all layers into a single rasterized layer.' },
  flattenLayers: { cat: 'layer', blurb: 'Flatten the specified subset of layers into a single layer.' },
  rasterizeLayer: { cat: 'layer', blurb: 'Convert a layer (text/effect/media) into a static raster image layer.' },
  flipLayer: { cat: 'layer', blurb: 'Flip a layer horizontally or vertically.' },

  // layer properties
  setLayerProps: { cat: 'layer', blurb: 'Update layer-level properties (name, opacity, blend mode, visible, locked).' },
  setLayerTransform: { cat: 'layer', blurb: 'Set a layer\'s transform (translate, scale, rotate).' },
  setLayerEffectParams: { cat: 'effect-params', blurb: 'Update an effect layer\'s parameters. `replace` swaps the whole param object; otherwise the patch is merged.' },

  // child effects on a layer
  addChildEffect: { cat: 'effect-params', blurb: 'Attach a child effect to a layer.' },
  removeChildEffect: { cat: 'effect-params', blurb: 'Detach a child effect from a layer.' },
  reorderChildEffect: { cat: 'effect-params', blurb: 'Change the order of a child effect within its parent layer.' },
  setChildEffectProps: { cat: 'effect-params', blurb: 'Update properties (name, enabled, opacity, blend) on a child effect.' },
  setChildEffectParams: { cat: 'effect-params', blurb: 'Update a child effect\'s parameters. `replace` swaps the whole param object; otherwise the patch is merged.' },

  // image bytes / thumbnails / export
  getCanvasImageBytes: { cat: 'image', blurb: 'Return the rendered canvas as image bytes (PNG/JPEG/WebP), optionally at a target size.' },
  getThumbnail: { cat: 'image', blurb: 'Return a small thumbnail of the rendered canvas, scaled to fit `maxDimension`.' },
  getLayerThumbnail: { cat: 'image', blurb: 'Return a thumbnail of a single layer\'s contribution, scaled to fit `maxDimension`.' },
  exportImage: { cat: 'export', blurb: 'Export the canvas to an image file (PNG/JPEG/WebP). MCP-side: intercepts the browser download and splices `result.filePath` into the envelope.' },
  pasteImageFromBytes: { cat: 'image', blurb: 'Paste an image (base64 or URL) into the canvas as a new media layer.' },

  // selection
  selectAll: { cat: 'selection', blurb: 'Select the entire canvas.' },
  selectNone: { cat: 'selection', blurb: 'Clear the pixel selection.' },
  selectInverse: { cat: 'selection', blurb: 'Invert the current pixel selection.' },
  setRectangleSelection: { cat: 'selection', blurb: 'Set a rectangular pixel selection.' },
  setOvalSelection: { cat: 'selection', blurb: 'Set an oval pixel selection inscribed in the given bounding box.' },
  setPolygonSelection: { cat: 'selection', blurb: 'Set a polygonal or lasso pixel selection from a list of points.' },
  setMagicWandSelection: { cat: 'selection', blurb: 'Select contiguous pixels matching the color at (x, y) within tolerance.' },
  selectColorRange: { cat: 'selection', blurb: 'Select all pixels matching the color at (x, y) within tolerance (non-contiguous).' },
  expandSelection: { cat: 'selection', blurb: 'Grow the selection by N pixels in all directions.' },
  contractSelection: { cat: 'selection', blurb: 'Shrink the selection by N pixels in all directions.' },
  featherSelection: { cat: 'selection', blurb: 'Soften the selection edge by feathering N pixels.' },
  smoothSelection: { cat: 'selection', blurb: 'Smooth jagged edges of the selection within an N-pixel radius.' },
  borderSelection: { cat: 'selection', blurb: 'Replace the selection with an N-pixel-wide band around its current edge.' },
  cropToSelection: { cat: 'canvas', blurb: 'Crop the canvas to the bounding box of the current selection.' },

  // masks
  addLayerMask: { cat: 'mask', blurb: 'Attach an empty (fully-revealing) layer mask to a layer.' },
  deleteLayerMask: { cat: 'mask', blurb: 'Remove the layer mask from a layer.' },
  addMaskFromSelection: { cat: 'mask', blurb: 'Convert the current pixel selection into a layer mask on the target layer.' },
  invertLayerMask: { cat: 'mask', blurb: 'Invert a layer\'s mask (reveal becomes hide and vice versa).' },
  setMaskEnabled: { cat: 'mask', blurb: 'Enable or disable a layer\'s mask without deleting it.' },
  featherMask: { cat: 'mask', blurb: 'Soften the layer mask\'s edge by feathering within the given radius.' },
  expandMask: { cat: 'mask', blurb: 'Grow the layer mask by N pixels in all directions.' },
  contractMask: { cat: 'mask', blurb: 'Shrink the layer mask by N pixels in all directions.' },
  smoothMask: { cat: 'mask', blurb: 'Smooth jagged edges of the layer mask within an N-pixel radius.' },

  // drawing
  paintStroke: { cat: 'drawing', blurb: 'Paint a brush stroke on a drawing layer along a list of points.' },
  drawShape: { cat: 'drawing', blurb: 'Draw a filled or stroked rectangle/ellipse on a drawing layer.' },
  fillRegion: { cat: 'drawing', blurb: 'Flood-fill contiguous matching pixels starting at (x, y) within tolerance.' },

  // project lifecycle
  newProject: { cat: 'project', blurb: 'Create a new project with the given dimensions and name. Discards the current project.' },
  openProject: { cat: 'project', blurb: 'Open a saved project by id. Discards the current project.' },
  saveProject: { cat: 'project', blurb: 'Save the current project under its current name (or assign one if unsaved).' },
  saveProjectAs: { cat: 'project', blurb: 'Save the current project under a new name; returns the new project id.' },
  deleteProject: { cat: 'project', blurb: 'Delete a saved project by id. Cannot delete the currently-open project.' },

  // history
  undo: { cat: 'history', blurb: 'Undo the last edit. No-op when there is nothing to undo.' },
  redo: { cat: 'history', blurb: 'Redo the last undone edit. No-op when there is nothing to redo.' },

  // settings / playback / zoom / color
  setForegroundColor: { cat: 'settings', blurb: 'Set the foreground (brush/fill) color from an RGBA tuple or hex string.' },
  setZoom: { cat: 'settings', blurb: 'Change the view zoom mode (in, out, fit, actual).' },
  play: { cat: 'settings', blurb: 'Resume animation playback for time-based effects.' },
  pause: { cat: 'settings', blurb: 'Pause animation playback for time-based effects.' },
  setSettings: { cat: 'settings', blurb: 'Update editor settings (theme, units, autosave, etc).' },

  // canvas size
  resizeImage: { cat: 'canvas', blurb: 'Resize the image and all layers to a new width/height, resampling pixels.' },
  resizeCanvas: { cat: 'canvas', blurb: 'Resize the canvas without resampling pixels; `anchor` selects the alignment edge.' },

  // auto corrections
  autoLevels: { cat: 'auto', blurb: 'Auto-stretch per-channel histograms to fill the full 0-255 range.' },
  autoContrast: { cat: 'auto', blurb: 'Auto-stretch the luminance histogram to fill the full range while preserving color balance.' },
  autoWhiteBalance: { cat: 'auto', blurb: 'Auto white-balance the image by neutralizing the average color cast.' },

  // fonts
  listInstalledFonts: { cat: 'font', blurb: 'List the fonts currently available to the text-layer renderer.' },
  installFontBundle: { cat: 'font', blurb: 'Install the bundled Google Fonts collection (~140 MB; pulled into IndexedDB). Returns once the install job completes; cached in the Chromium profile for subsequent runs.' },

  // export (video)
  exportVideo: { cat: 'export', blurb: 'Export the canvas as a video (MP4 via WebCodecs or a ZIP of PNG frames). MCP-side: blocks until the export job settles and splices `result.result.filePath` into the envelope.' }
}

const CATEGORY_LABEL: Record<Cat, string> = {
  state: 'state',
  effects: 'effects',
  job: 'job',
  layer: 'layer',
  'effect-params': 'effect',
  image: 'image',
  export: 'export',
  selection: 'selection',
  mask: 'mask',
  drawing: 'drawing',
  project: 'project',
  history: 'history',
  settings: 'settings',
  canvas: 'canvas',
  auto: 'auto',
  font: 'font',
  diag: 'diag'
}

export function describeCommand(name: string): string {
  const entry = COMMANDS[name]
  if (entry) {
    return `${entry.blurb} [${CATEGORY_LABEL[entry.cat]}]`
  }
  // Fallback for commands added to LayersAgent but not yet described here.
  return `LayersAgent.${name} — see https://layers.noisefactor.io for command reference.`
}
