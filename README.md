# Waymark

Turn a GPX route into a personal map print or an image to share. Waymark is a browser-based studio built with React, TypeScript, Vite, Tailwind CSS, MapLibre GL JS, and pdf-lib.

## Features

- Import a GPX file or try the built-in Berlin example.
- Choose three poster layouts and four palettes, then customize colors, route thickness, markers, and map labels.
- Edit the title, location, date, and statistics. Switch between metric and imperial units.
- Drag and zoom the map to compose your artwork, or use **Fit route**.
- Export a print-ready PNG or PDF, or a PNG sized for sharing.

No account, API key, database, or application backend is required.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run check` | Check TypeScript |
| `npm test` | Run the unit tests |
| `npm run build` | Build the static website into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run test:browser` | Run the browser integration checks |

## Create a print or sharing image

1. Choose or drop a GPX file up to 20 MB, or start with the example route.
2. Use **Design** to choose the layout, palette, and map appearance.
3. Use **Details** to edit the captions and statistics.
4. Adjust the composition by dragging and zooming the map.
5. Choose **Print** or **Share** above the preview, select a size, and download.

**Print** supports A4, A3, 30 × 40 cm, and 50 × 70 cm, in portrait or landscape. PNG and PDF exports use 150 or 300 DPI. PDFs have the exact page dimensions and embedded fonts; PNGs include physical-resolution metadata. Print at actual size, with scaling set to 100%.

**Share** exports a PNG at the selected pixel dimensions:

| Format | Ratio | Pixels |
| --- | --- | --- |
| Instagram post | 3:4 | 1080 × 1440 |
| Square | 1:1 | 1080 × 1080 |
| Story | 9:16 | 1080 × 1920 |
| Wide | 16:9 | 1920 × 1080 |

Print settings are preserved when switching modes. Sharing images do not use print DPI or include physical-resolution metadata.

Map images are raster artwork rendered from vector tiles. PDF captions remain vector text where the font supports their characters; unsupported characters use browser-rendered fallback text. Long captions wrap or scale to fit. Previews and exports omit the map copyright line.

Large exports depend on available browser memory and graphics limits. If an export is too large, choose 150 DPI or a smaller paper size.

## Data and privacy

GPX files, edited settings, calculations, and exported artwork stay in your browser. The app has no accounts, analytics, or server uploads. Projects are held in memory and cleared on reload.

An internet connection is needed for the map. OpenFreeMap receives requests for the region being viewed. Fonts are served with the website.

GPX segments remain separate, so recording gaps do not add artificial connecting lines or distance. Statistics use elapsed time, including stops. Duration and pace require complete, ordered timestamps; missing values can be entered manually. Imported dates are initially formatted in UTC and can be edited.

## Tests

Unit tests cover GPX parsing and statistics, poster geometry and text fitting, map styles, and PNG resolution metadata. GitHub Actions runs the TypeScript check, unit tests, and production build on pushes and pull requests.

To run the browser checks, install Playwright's Chromium browser:

```sh
npx playwright install chromium
```

Start `npm run dev` in one terminal, then run `npm run test:browser` in another. The tests require internet access for real map tiles.

Set `QA_BASE_URL` to use a different server URL; the default is `http://127.0.0.1:5173`. Set `QA_BROWSER_CHANNEL` to `msedge` or `chrome` to use an installed Microsoft Edge or Google Chrome instead of Playwright's Chromium.

The browser suite covers file validation and import, editing, map styling, responsive layouts down to 320 px, and PNG/PDF downloads. It writes screenshots, exports, and reports to the ignored `test-results/` directory.

## Project structure

- `src/components/`: editor controls, information dialog, and interactive poster preview.
- `src/lib/`: GPX parsing, map styles, shared preview/export layout, presets, and export generation.
- `src/styles/global.css`: Tailwind theme, fonts, and shared styles.
- `public/`: favicon and locally served print fonts.
- `tests/fixtures/`: synthetic GPX files for automated tests.
- `scripts/browser-qa.mjs`: browser integration checks.
- `.github/workflows/ci.yml`: automated TypeScript, unit-test, and build checks.

## Deployment

Run `npm run build` and deploy `dist/` to a static host. No server application is needed. For hosting under a subpath such as `/waymark/`, configure Vite's `base` to match that path before building.

## Resources

- [MapLibre GL JS](https://maplibre.org/)
- [OpenFreeMap](https://openfreemap.org/)
- [OpenMapTiles](https://openmaptiles.org/)
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- [Outfit fonts](https://github.com/Outfitio/Outfit-Fonts), licensed under the SIL Open Font License. The license is included in [public/fonts/OFL.txt](public/fonts/OFL.txt).