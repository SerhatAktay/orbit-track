# OrbiT

Interactive circular track viewer for small circular genomes (mitochondria first). Local and browser-only: no upload, no server logic.

## Run

```
npm start        # serves on http://localhost:8765
npm test
```

ES modules need http, so opening `index.html` via `file://` will not work.

## Use

Drop files on the canvas (or **Open files…**):

- **bigWig** (`.bw`). Files named `x.plus.bw` + `x.minus.bw` (also `pos/neg`, `fwd/rev`, `fw/rv`) merge into one mirrored strand track with two colours.
- **Annotation** (`.bed`, `.gtf`, `.gff`, `.gff3`, `.gb`/`.gbk`/`.gbff`). GenBank joins that cross the origin are kept as one feature. Overlaps get separate lanes, arrows show strand, names are drawn when they fit.
- **Demo** loads human mtDNA genes (the D-loop wraps the origin).

| Action | Effect |
| --- | --- |
| Scroll | zoom at cursor |
| Drag | rotate |
| Double-click (Shift) | zoom in (out) |
| Click a feature | zoom to it |
| `R` | reset view |
| Hover | position, feature, or signal value |

Per track: visibility, colour, order (drag the `⠿` handle, or use ↑/↓), ring thickness, y-scale (auto or fixed min/max), bin count (0 = match screen resolution). Export the view as SVG, PNG (3×), or **HTML** (one self-contained file with the view inlined, easy to share).

**Save session / Load session** stores the view and per-track settings as JSON (not the data). Load it, then open the same data files; tracks are matched by name, in either order.

Chromosome names `chrM`, `MT` and `M` are treated as the same. With several chromosomes in a bigWig, a selector appears.

## Rebuild the bigWig reader

`npm run vendor` re-bundles `@gmod/bbi` into `vendor/bbi.bundle.js`.
