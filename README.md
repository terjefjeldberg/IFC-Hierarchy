# IFC Hierarchy Widget

Standalone StreamBIM widget for exploring IFC hierarchy from StreamBIM model layers, with optional local IFC upload as fallback.

## What it does

- Builds the model tree primarily from IFC sources discovered in StreamBIM model layers
- Supports syncing one or more IFC-backed model layers and merging them into one tree view
- Focuses the clicked StreamBIM object in the tree when the object exists in the available IFC sources
- Keeps the tree clean if a clicked StreamBIM object is not found in the available IFC sources
- Click on an element in the tree attempts `highlightObject(...)` and `gotoObject(...)`

## Files

- `index.html`: Widget shell and inline styling
- `hierarchy-api.js`: IFC parsing, GUID lookup, and StreamBIM adapter logic
- `hierarchy-store.js`: Tree state and lazy child loading
- `hierarchy-view.js`: Renderer and UI bindings
- `scripts/build-ifc-index.js`: Optional utility for building a hierarchy index from an IFC file
- `streambim-widget-api.min.js`: Local widget API bundle

## Usage

1. Open the widget in StreamBIM
2. Click `Sync model layers` to load IFC-backed model layers from the current project
3. Use `Add local IFC` only if a needed source is not exposed as a downloadable model layer
4. Explore the merged hierarchy in the model tree

## Important limitation

The widget only knows the exact IFC hierarchy for IFC sources it has successfully indexed, either from StreamBIM model layers or optional local uploads. If a clicked StreamBIM object belongs to another source, the widget will not inject a synthetic fallback hierarchy into the tree.