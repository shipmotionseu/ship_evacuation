# Repository Guidelines

## Project Structure & Module Organization
- Entry point is `index.html`, which wires UI controls and loads scripts.
- Primary simulation logic lives in `src/script.js` (use this for feature work); `src/script2.js` and `src/script_org.js` are alternate/reference versions.
- Three.js is vendored under `three.js-master/` (module build + addons); Plotly, jQuery, FileSaver, and JSZip load from CDNs in `index.html`.
- Assets/config: custom deck geometry is loaded via user-supplied JSON at runtime; no compiled assets or build artifacts are checked in.

## Build, Test, and Development Commands
- No build step; serve the repo root to satisfy ES module import paths. Example: `python -m http.server 8000` then open `http://localhost:8000/index.html`.
- For manual regression, run the simulation from `index.html`, toggle deck modes (Simple/Test6/Custom JSON), and exercise START/Plot/Save buttons.

## Coding Style & Naming Conventions
- JavaScript is ES module–based; prefer `const`/`let`, arrow functions for callbacks, and CamelCase for classes (`Human`) and camelCase for variables/functions (`directMovement`, `createPersons`).
- Indent with 2–4 spaces consistently (existing files use spaces; avoid tabs). Keep imports at top and group related helpers together.
- Use descriptive names for geometry-related data (`compartmentsMeshes`, `MusteringBB`); avoid adding new globals unless necessary.
- Keep DOM IDs in sync with `index.html`; if adding controls, wire listeners near existing setup blocks.

## Testing Guidelines
- No automated tests are present. Add small, focused tests if you introduce logic-heavy utilities (e.g., geometry parsing helpers).
- Manual checks: verify persons spawn correctly per mode, compartments drag without breaking collision, doors/interfaces in JSON steer agents through the expected exit, and exports enable after completion.
- When adjusting camera or sizing logic, confirm the scene fits the viewport and controls (Orbit vs Drag) toggle correctly with Ctrl/Cmd.

## Commit & Pull Request Guidelines
- Git history uses short, imperative summaries (e.g., “add high dpi plots”, “change size of plot”); follow the same style.
- Include PR descriptions with: scope, user-visible behavior changes, manual test notes (scenarios run), and any JSON samples used.
- Link to related issues/tasks when available; attach screenshots/GIFs for UI/visual changes.
- Keep commits scoped: isolate refactors from feature changes, and avoid mixing vendor updates with logic edits.

## JSON Geometry Tips (when adding features)
- Maintain the documented schema (`deck`, `compartments`, `interfaces`); validate inputs and guard against missing attributes.
- Keep coordinate transforms consistent (`x - deck_length/2`, `y - deck_width/2`), and clean up added meshes to avoid leaks (`disposeMeshes` helpers).
