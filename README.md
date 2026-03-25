# IFC Hierarchy Widget

Standalone StreamBIM widget for exploring IFC hierarchy with lazy loading and picked-object focus.

## What it does

- Renders true IFC tree data when `hierarchy-index.json` is present
- Falls back to StreamBIM widget/API probing when no IFC index is available
- Focuses the clicked StreamBIM object in the tree
- Uses the IFC file hierarchy for GUID lookup instead of guessing from payload fields when an index exists
- Click on an element in the tree attempts `highlightObject(...)` and `gotoObject(...)`

## Files

- `index.html`: Widget shell and inline styling
- `hierarchy-api.js`: StreamBIM adapter, IFC index loading, and endpoint probing
- `hierarchy-store.js`: Tree state and lazy child loading
- `hierarchy-view.js`: Renderer and UI bindings
- `hierarchy-index.json`: Prebuilt IFC hierarchy index used by the widget when present
- `scripts/build-ifc-index.js`: Builds `hierarchy-index.json` from an IFC file
- `streambim-widget-api.min.js`: Local widget API bundle

## Current IFC index

The repo currently includes an index built from:
- `SE-TRV_ROAD_4x3.ifc`

Example verified GUID path from that file:
- `3oF2ohaM90mumLPvHsPPyl`
- `IfcProject > IfcSite > IfcGeomodel > IfcGeotechnicalStratum`

## Rebuild the IFC index

```bash
node scripts/build-ifc-index.js /path/to/file.ifc ./hierarchy-index.json
```

## Deploy

GitHub Pages deploy is handled by `.github/workflows/deploy-pages.yml` and includes `hierarchy-index.json` in the published site.

## Important limitation

The widget can only use the exact IFC hierarchy for the files that have been indexed into `hierarchy-index.json`. If the selected object belongs to another IFC source that is not in the index, the widget falls back to StreamBIM-exposed hierarchy data when available.
