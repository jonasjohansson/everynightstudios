# Every Night Cap Prototyper

Vanilla-JS tool for prototyping embroidered cap mockups from Every Night Studios.

## Run

    python3 -m http.server 8000

Open http://localhost:8000

## Scrape caps (one-off)

    node scripts/scrape.mjs

## Calibrate text anchors (one-off, after scrape)

    open calibrate.html

## Tests

    node --test
