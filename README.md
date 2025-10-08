# ScribblerToo – Pressure + iPad

A minimal HTML5 canvas drawing app that implements the **ScribblerToo** rules and supports **pen pressure** (Pointer Events / Apple Pencil).

## Features
- 1500×1500 canvas (CSS scaled for responsiveness)
- Pressure-sensitive lines (Apple Pencil, Surface pen, etc.)
- Automatically draws 1px connection lines from your current endpoint to **random points** of **nearby previous paths** (within 100px)
- Undo / Redo / Clear / Save PNG
- Works on iPad Safari (prevents scroll while drawing)

## Quick Start (Local)
```bash
python3 -m http.server 8080
# Then open:
# http://localhost:8080/Code7_test_draw.html
```

## GitHub Pages (Free Hosting)
1. Push these files to your repo (root).
2. On GitHub: **Settings → Pages → Build and deployment**  
   - Source: *Deploy from a branch*  
   - Branch: `main` (or `master`), Folder: `/ (root)`  
3. Visit:
   ```
   https://<your-username>.github.io/<your-repo>/
   ```
   (It will redirect to `Code7_test_draw.html` automatically.)

## File List
- `index.html` – convenience redirect to the app
- `Code7_test_draw.html` – the app (single file)
- `.nojekyll` – disables Jekyll processing on GitHub Pages
- `.gitignore` – ignores OS/editor clutter
- `LICENSE` – MIT

## License
MIT © 2025
