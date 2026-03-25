# IFC Hierarchy Widget

Standalone StreamBIM widget for exploring IFC-style hierarchy with lazy loading.

## What it does

- Renders `Project -> Site -> Building -> Storey -> Element`
- Uses lazy expansion instead of loading the whole model up front
- Tries real containment endpoints first through `makeApiRequest(...)`
- Falls back clearly when the project/widget API does not expose scoped hierarchy
- Click on an element attempts `highlightObject(...)` and `gotoObject(...)`

## Files

- `index.html`: Widget shell and inline styling
- `hierarchy-api.js`: StreamBIM adapter and endpoint probing
- `hierarchy-store.js`: Tree state and lazy child loading
- `hierarchy-view.js`: Renderer and UI bindings
- `streambim-widget-api.min.js`: Local widget API bundle

## Deploy

GitHub Pages deploy is handled by `.github/workflows/deploy-pages.yml`.

## Important limitation

This widget only shows a true IFC tree if the StreamBIM project exposes containment data. If scoped containment endpoints are missing, the widget will say so instead of inventing a fake hierarchy.
