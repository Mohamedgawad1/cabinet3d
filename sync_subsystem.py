# -*- coding: utf-8 -*-
r"""
Cabinet 3D  ->  SmartCloud subsystem sync
=========================================

Refreshes the SUBSYSTEM column of data/cables.js straight from the SmartCloud
task grid (vTasks_TestsPlanned - the same view the Switchboard dashboard uses),
then commits + pushes to GitHub so https://mohamedgawad1.github.io/cabinet3d/
shows the new names within a minute.

Why a desktop script?  The published page is static and SmartCloud needs your
SSO login, so the browser can never call it directly.  This script does the
authenticated pull here and only the finished JSON travels to GitHub.

How it authenticates
    Nothing new. It attaches to the Chrome window that Start_SmartCloud.bat
    already opened with --remote-debugging-port=9222 (the window you sign in
    to once and leave open).  If that window is closed, the script falls back
    to the newest local pull in sc_pull\data\ and tells you how old it is.

Usage
    python sync_subsystem.py                 # live if the browser is open, else cache
    python sync_subsystem.py --live          # force live (fails if no browser)
    python sync_subsystem.py --cached        # never touch the browser
    python sync_subsystem.py --dry-run       # report only, write nothing
    python sync_subsystem.py --no-push       # update the file, skip git

What it writes
    data/cables.js   -> only the "subsystem" cell of each row (+ assets[].refName
                        when the old value was a cut-off prefix of the new one).
    Everything else in the file is left byte-for-byte alone, and the file is
    only rewritten when a value actually changes.
"""

import argparse
import collections
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data', 'cables.js')
WS = r'C:\Users\mylap\OneDrive\Desktop\dashboard'
SC_DATA = os.path.join(WS, 'sc_pull', 'data')
TOK_FILE = os.path.join(WS, 'github_token.txt')
REPO = 'https://github.com/Mohamedgawad1/cabinet3d.git'
LIVE_URL = 'https://mohamedgawad1.github.io/cabinet3d/'

SWITCHBOARD = 'https://wly04-sc.intergraphsmartcloud.com/ISC/Tools/vDashboardsUsers/Switchboard.htm'
MARK = SWITCHBOARD + '#cabinet3d-sync'
CDP = 'http://127.0.0.1:9222'
CPP_CID = 1021
PAGE = 4000

# Same restriction the ITR live sync uses: CPP AGI, PS5 location, pre-commissioning.
FIELDS = ['TaskName', 'AssetTag', 'ProcessBreakdown', 'ProcessBreakdownIdentifier',
          'TaskState', 'TaskType', 'TaskDiscipline', 'ApprovedDate']
RESTRICTIONS = [
    {'FieldName': 'ResponsibleCompanyID', 'Term': '=', 'ValueCollection': [CPP_CID]},
    {'FieldName': 'PhysicalLocationUp1Summary', 'Term': 'like', 'ValueCollection': ['PS5 -']},
    {'FieldName': 'TaskCategorySummary', 'Term': 'like', 'ValueCollection': ['PCOM - Precommissioning']},
]

# Copied from sc_pull\itr_online_sync.py - the platform's own grid reader.
GET_JS = r"""((P) => {
    return new Promise((res) => {
        let done = false;
        const t = setTimeout(() => { if (!done) { done = true; res({timeout: true}); } }, P.to);
        dalc.Get(P.v, P.f, P.r || [], {Distinct:false, FirstRecordOrdinal: P.off, NumberOfRecords:P.n}, "Flat",
            (ok) => {
                if (done) return; done = true; clearTimeout(t);
                let rows = [];
                const vals = (ok && ok.Values) || [];
                rows = JSON.parse(JSON.stringify(vals || []));
                res({rows: rows, n: rows.length});
            },
            (err) => { if (!done) { done = true; clearTimeout(t); res({err: String((err && err.message) || err)}); } }, false);
    });
})"""

CACHE_CANDIDATES = [
    os.path.join(SC_DATA, 'itr_ps5_rows.json'),
    os.path.join(SC_DATA, 'cpp_agi_tasks_full.json'),
]


def log(msg):
    print(msg, flush=True)


def cdp_alive():
    import urllib.request
    try:
        with urllib.request.urlopen(CDP + '/json/version', timeout=3) as r:
            return json.loads(r.read().decode()).get('Browser', '')
    except Exception:
        return ''


# --------------------------------------------------------------------------- #
#  live pull
# --------------------------------------------------------------------------- #
def live_pull(timeout_s=180):
    """Read the PS5 pre-commissioning grid through the user's open Chrome."""
    from playwright.sync_api import sync_playwright

    rows, page = [], None
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = None
        for p in ctx.pages:
            if p.url.startswith(MARK) or p.url.startswith(SWITCHBOARD):
                page = p
                break
        created = False
        if page is None:
            page = ctx.new_page()
            created = True
        try:
            page.goto(SWITCHBOARD, wait_until='domcontentloaded', timeout=60000)
            end = time.time() + 60
            while time.time() < end:
                n = page.evaluate(
                    "() => (typeof switchboardConfiguration!=='undefined' "
                    "&& switchboardConfiguration.Products) "
                    "? switchboardConfiguration.Products.length : -1")
                if n >= 0:
                    break
                page.wait_for_timeout(2000)
            else:
                raise RuntimeError('SmartCloud is not signed in - open Start_SmartCloud.bat, '
                                   'sign in, then run again')

            off = 0
            end = time.time() + timeout_s
            while time.time() < end:
                r = page.evaluate("(%s)(%s)" % (GET_JS, json.dumps(
                    {'v': 'vTasks_TestsPlanned', 'f': FIELDS, 'r': RESTRICTIONS,
                     'n': PAGE, 'off': off, 'to': 120000})))
                if r.get('timeout'):
                    log('   pull timeout at offset %d - using %d rows' % (off, len(rows)))
                    break
                if r.get('err'):
                    raise RuntimeError('platform error: %s' % r['err'][:160])
                batch = r.get('rows', [])
                rows.extend(batch)
                log('   pulled offset=%-6d got=%-5d total=%d' % (off, len(batch), len(rows)))
                if len(batch) < PAGE:
                    break
                off += PAGE
            return rows, 'live'
        finally:
            if created:
                try:
                    page.close()
                except Exception:
                    pass


# --------------------------------------------------------------------------- #
#  cached pull
# --------------------------------------------------------------------------- #
def cached_pull():
    best, best_mtime = None, 0
    for p in CACHE_CANDIDATES:
        if os.path.isfile(p) and os.path.getmtime(p) > best_mtime:
            best, best_mtime = p, os.path.getmtime(p)
    if not best:
        raise RuntimeError('no local SmartCloud pull found in %s - open '
                           'Start_SmartCloud.bat once so the sync can fill it' % SC_DATA)
    with open(best, encoding='utf-8') as f:
        d = json.load(f)
    rows = d.get('rows') if isinstance(d, dict) else d
    stamp = time.strftime('%Y-%m-%d %H:%M', time.localtime(best_mtime))
    age_h = (time.time() - best_mtime) / 3600.0
    log('   cached source: %s (%s, %.0f h old)' % (os.path.basename(best), stamp, age_h))
    if age_h > 24:
        log('   NOTE: this cache is old. Open the SmartCloud window (Start_SmartCloud.bat)')
        log('         once so the next run reads today\'s values from the platform.')
    return rows, 'cache ' + stamp


# --------------------------------------------------------------------------- #
#  mapping + file rewrite
# --------------------------------------------------------------------------- #
def clean(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()


def build_maps(rows):
    by_task = {}
    by_asset = collections.defaultdict(collections.Counter)
    for r in rows:
        pb = clean(r.get('ProcessBreakdown'))
        if not pb:
            continue
        task = clean(r.get('TaskName'))
        if task:
            by_task.setdefault(task, pb)
        tag = clean(r.get('AssetTag'))
        if tag:
            by_asset[tag][pb] += 1
    return by_task, {k: c.most_common(1)[0][0] for k, c in by_asset.items()}


def load_page_data():
    with open(DATA, encoding='utf-8-sig') as f:
        src = f.read()
    m = re.search(r'(?s)^(.*?window\.C3D_DATA\s*=\s*)(\{.*\})(\s*;?\s*)$', src)
    if not m:
        raise RuntimeError('data/cables.js does not look like a C3D_DATA file')
    return src, m.group(1), json.loads(m.group(2)), m.group(3)


def apply(by_task, by_asset, dry_run=False):
    src, prefix, obj, tail = load_page_data()
    cols = obj['columns']
    ti = cols.index('taskId')
    si = cols.index('subsystem')
    fi = cols.index('fromTag')
    toi = cols.index('toTag')

    stats = collections.Counter()
    samples = []
    for row in obj['rows']:
        cur = clean(row[si])
        new = (by_task.get(clean(row[ti])) or by_asset.get(clean(row[fi]))
               or by_asset.get(clean(row[toi])) or '')
        if not new:
            stats['no match'] += 1
            continue
        if new == cur:
            stats['already correct'] += 1
            continue
        if not cur:
            stats['filled (was empty)'] += 1
        elif new.startswith(cur):
            stats['de-truncated'] += 1
        else:
            stats['changed'] += 1
        if len(samples) < 5:
            samples.append((row[ti], cur, new))
        row[si] = new

    # assets[].refName mirrors the subsystem of a reference asset - keep it in step
    ref_fixed = 0
    for a in obj.get('assets', []):
        tag = clean(a.get('tag'))
        new = by_asset.get(tag)
        cur = clean(a.get('refName'))
        if new and cur and new.startswith(cur) and new != cur:
            a['refName'] = new
            ref_fixed += 1

    changed = stats['de-truncated'] + stats['filled (was empty)'] + stats['changed']
    log('')
    for k in ('already correct', 'de-truncated', 'filled (was empty)', 'changed', 'no match'):
        log('   %-18s %d' % (k, stats[k]))
    log('   assets refName     %d' % ref_fixed)
    for t, o, n in samples:
        log('   e.g. %s: %r -> %r' % (t, o, n))

    if not changed and not ref_fixed:
        log('\nNothing to update - the page already matches SmartCloud.')
        return False
    if dry_run:
        log('\n--dry-run: file NOT written')
        return False

    body = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    with open(DATA, 'w', encoding='utf-8-sig', newline='\n') as f:
        f.write(prefix + body + (tail or ';\n'))
    log('\nWrote %s (%d cells updated, %.1f MB)' % (DATA, changed, os.path.getsize(DATA) / 1048576))
    return True


# --------------------------------------------------------------------------- #
#  publish
# --------------------------------------------------------------------------- #
def git(*args, **kw):
    return subprocess.run(['git', '-C', HERE] + list(args), capture_output=True,
                          text=True, timeout=kw.get('timeout', 600))


def push():
    tok = ''
    try:
        with open(TOK_FILE, encoding='utf-8') as f:
            tok = f.read().strip()
    except Exception:
        pass
    if not tok:
        log(' !! no GitHub token (%s) - commit kept locally, push skipped' % TOK_FILE)
        return 1

    git('add', '--', 'data/cables.js')
    st = git('status', '--porcelain', '--', 'data/cables.js')
    if not (st.stdout or '').strip():
        log('   nothing to push - GitHub already has this version')
        return 0
    r = git('commit', '-m', 'smartcloud sync: subsystem %s' % time.strftime('%Y-%m-%d %H:%M'))
    log('   commit: %s' % ((r.stdout or r.stderr or '').strip().splitlines() or ['?'])[-1])

    url = REPO.replace('https://', 'https://Mohamedgawad1:%s@' % tok)
    for attempt in range(3):
        r = git('push', url, 'HEAD:main', timeout=900)
        if r.returncode == 0:
            log('   pushed -> GitHub Pages is rebuilding (~40 s)')
            log('   live: %s' % LIVE_URL)
            return 0
        err = (r.stderr or '') + (r.stdout or '')
        if 'fetch first' in err or 'rejected' in err or 'non-fast-forward' in err:
            log('   remote moved - rebasing')
            git('pull', '--rebase', url, 'main', timeout=900)
            continue
        log(' !! push failed: %s' % ' | '.join(err.strip().splitlines()[-3:])[:300])
        return 1
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--live', action='store_true', help='require the SmartCloud browser')
    ap.add_argument('--cached', action='store_true', help='use the newest local pull only')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-push', action='store_true')
    a = ap.parse_args()

    log('CABINET 3D - subsystem sync from SmartCloud')

    rows, source = [], ''
    if not a.cached:
        if cdp_alive():
            try:
                log('   SmartCloud browser found on 9222 - live pull')
                rows, source = live_pull()
            except Exception as e:
                if a.live:
                    log(' !! live pull failed: %s' % str(e)[:300])
                    return 2
                log(' !! live pull failed (%s) - falling back to cache' % str(e)[:160])
        elif a.live:
            log(' !! nothing listening on 9222 - run START SHARE / Start_SmartCloud.bat first')
            return 2
        else:
            log('   SmartCloud browser is closed - using the newest local pull')

    if not rows:
        rows, source = cached_pull()

    log('   source: %s (%d platform rows)' % (source, len(rows)))
    by_task, by_asset = build_maps(rows)
    log('   mappable: %d task ids / %d asset tags' % (len(by_task), len(by_asset)))

    if not apply(by_task, by_asset, dry_run=a.dry_run):
        return 0
    if a.no_push:
        log('   --no-push: nothing sent to GitHub')
        return 0
    return push()


if __name__ == '__main__':
    sys.exit(main())
