Title: Live Content

Description: Fetched live

Source: https://raw.githubusercontent.com/processing/p5.js/main/package.json

---

{
  "name": "p5",
  "repository": "processing/p5.js",
  "type": "module",
  "scripts": {
    "build": "rolldown -c",
    "dev": "vite preview/",
    "dev:global": "concurrently -n build,server \"rolldown -c -w\" \"npx vite preview/global/\"",
    "docs": "documentation build ./src/**/*.js ./src/**/**/*.js --shallow -o ./docs/data.json && node ./utils/convert.mjs",
    "bench": "vitest bench",
    "bench:report": "vitest bench --reporter=verbose",
    "test": "vitest",
    "test:types": "tsc test/types/*.ts --noEmit --lib es2022,dom",
    "lint": "oxlint .",
    "lint:fix": "oxlint --fix .",
    "generate-types": "npm run docs && node utils/typescript.mjs"
  },
  "lint-staged": {
    "src/**/*.js": "oxlint",
    "test/**/*.js": "oxlint",
    "utils/**/*.{js,mjs}": "oxlint"
  },
  "version": "2.3.1",
  "dependencies": {
    "@davepagurek/bezier-path": "^0.0.7",
    "@japont/unicode-range": "^1.0.0",
    "acorn": "^8.15.0",
    "acorn-walk": "^8.3.4",
    "colorjs.io": "^0.6.0",
    "escodegen": "^2.1.0",
    "esrap": "^2.3.0",
    "gifenc": "^1.0.3",
    "libtess": "^1.2.2",
    "omggif": "^1.0.10",
    "pako": "^2.1.0",
    "tl-util": "npm:@limzykenneth/tl-util@0.0.1",
    "zimmerframe": "^1.1.4",
    "zod": "^4.2.1"
  },
  "devDependenci

