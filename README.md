# Cabinet 3D — Cable Routing & Termination

Interactive 3D cable-routing viewer (Three.js r147). Fully static: no build step,
no server code, no external CDNs — every asset is in this repository.

**Live:** <https://mohamedgawad1.github.io/cabinet3d/> (hosted on GitHub Pages, `main` branch root)

## Run locally

    python -m http.server 8000
    # then open http://localhost:8000/

Opening `index.html` directly from disk also works, but a local server is cleaner
for the `data/*.js` files.

## Files

| path | what it is |
|------|------------|
| `index.html` | the whole UI + 3D scene logic |
| `lib/` | Three.js r147 and the post-processing modules (bloom) |
| `data/cables.js` | 3 919 cables, 2 170 assets — generated from `Cable_Routing_Termination_Tracker.xlsx` (`Cables Master`) |
| `data/geo.js` | cable-route geometry |
| `js/devices.js` | parametric 3D builders for every equipment family |
| `js/pics.js` | device silhouettes |
| `sync_subsystem.py` | refresh the **SUBSYSTEM** column from SmartCloud and republish |
| `Sync Cabinet3D.bat` | double-click wrapper for the sync |
| `_auto_sync.bat` | silent wrapper used by the scheduled task |

## Keeping SUBSYSTEM in sync with SmartCloud

The published page is static and SmartCloud sits behind your SSO, so the browser
can never read it directly. `sync_subsystem.py` does the authenticated read on
this PC and only the finished JSON is pushed to GitHub.

* It attaches to the Chrome window opened by `Start_SmartCloud.bat`
  (`--remote-debugging-port=9222`), reads `vTasks_TestsPlanned` with the same
  filters the ITR live sync uses (CPP AGI · PS5 · pre-commissioning), and maps
  `TaskName → ProcessBreakdown` (the subsystem).
* If that window is closed it falls back to the newest local pull in
  `..\..\OneDrive\Desktop\dashboard\sc_pull\data\` and says how old it is.
* It rewrites only the `subsystem` cell of each row (and truncation-repair for
  `assets[].refName`), commits and pushes; GitHub Pages goes live in ~40 s.

    python sync_subsystem.py              # live if the browser is open, else cache
    python sync_subsystem.py --live       # demand a live read
    python sync_subsystem.py --cached     # never touch the browser
    python sync_subsystem.py --dry-run    # report only
    python sync_subsystem.py --no-push    # write the file, skip git

A Windows scheduled task **“Cabinet3D SmartCloud Sync”** runs it every 30 minutes
and appends to `sync_log.txt`.

## Publishing

Static files on `main`; Settings → Pages → *Deploy from a branch* → `main` / `/`.
`.nojekyll` is present so the folder is served verbatim.
