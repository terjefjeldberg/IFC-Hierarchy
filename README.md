# IFC Hierarchy Widget

Standalone StreamBIM widget for exploring IFC hierarchy from IFC files that are loaded directly into the widget.

## What it does

- Builds the model tree only from IFC files that the user uploads in the widget
- Supports loading one or more IFC files and merging them into one tree view
- Focuses the clicked StreamBIM object in the tree when the object exists in the loaded IFC files
- Keeps the tree clean if a clicked StreamBIM object is not found in the loaded IFC files
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
2. Click `Load IFC files`
3. Select one or more IFC files
4. Explore the merged hierarchy in the model tree

## Important limitation

The widget only knows the exact IFC hierarchy for the IFC files that are currently loaded into it. If a clicked StreamBIM object belongs to another source, the widget will not inject a synthetic fallback hierarchy into the tree.
