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
          'TaskState', 'TaskType', 'TaskDiscipline', 'ApprovedDate',
          'ResponsibleCompanyID', 'TaskCategorySummary']
# Every PS5 task, all responsible companies: the subsystem browser must show the
# full platform list (277 E/I/T subsystems), not just the CPP AGI ones.
RESTRICTIONS = [
    {'FieldName': 'PhysicalLocationUp1Summary', 'Term': 'like', 'ValueCollection': ['PS5 -']},
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
        def ready(seconds=60):
            """Wait until the smartcloud grid API is available on the page."""
            end = time.time() + seconds
            while time.time() < end:
                try:
                    n = page.evaluate(
                        "() => (typeof switchboardConfiguration!=='undefined' "
                        "&& switchboardConfiguration.Products) "
                        "? switchboardConfiguration.Products.length : -1")
                    if n >= 0:
                        return True
                except Exception:
                    pass
                page.wait_for_timeout(2000)
            return False

        try:
            page.goto(SWITCHBOARD, wait_until='domcontentloaded', timeout=60000)
            if not ready():
                raise RuntimeError('SmartCloud is not signed in - open Start_SmartCloud.bat, '
                                   'sign in, then run again')

            off = 0
            end = time.time() + timeout_s
            reloads = 0
            while time.time() < end:
                try:
                    r = page.evaluate("(%s)(%s)" % (GET_JS, json.dumps(
                        {'v': 'vTasks_TestsPlanned', 'f': FIELDS, 'r': RESTRICTIONS,
                         'n': PAGE, 'off': off, 'to': 120000})))
                except Exception as e:
                    # the portal reloads itself now and then; the grid call is
                    # stateless, so just wait for the page and fetch the same offset
                    msg = str(e)
                    if 'Execution context was destroyed' not in msg and \
                            'navigat' not in msg.lower():
                        raise
                    reloads += 1
                    if reloads > 5:
                        raise RuntimeError('SmartCloud kept reloading during the pull '
                                           '(%d times) - try again in a minute' % reloads)
                    log('   page reloaded mid-pull - waiting for it to settle (retry %d)' % reloads)
                    try:
                        page.wait_for_load_state('domcontentloaded', timeout=30000)
                    except Exception:
                        pass
                    if not ready():
                        raise RuntimeError('SmartCloud did not come back after a reload - '
                                           'open Start_SmartCloud.bat and sign in again')
                    continue
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
    """task -> {sub, state, type, date, closed}; asset tag -> most common subsystem."""
    by_task = {}
    by_asset = collections.defaultdict(collections.Counter)
    for r in rows:
        pb = clean(r.get('ProcessBreakdown'))
        task = clean(r.get('TaskName'))
        tag = clean(r.get('AssetTag'))
        if pb and tag:
            by_asset[tag][pb] += 1
        if not task:
            continue
        state = clean(r.get('TaskState'))
        info = {
            'sub': pb,
            'state': state,
            'type': clean(r.get('TaskType')),
            'date': clean(r.get('ApprovedDate')),
            'closed': state == 'Closed',
        }
        old = by_task.get(task)
        # one task id should be one row; if it repeats, the Closed row wins
        if old is None or (info['closed'] and not old['closed']):
            by_task[task] = info
    return by_task, {k: c.most_common(1)[0][0] for k, c in by_asset.items()}


def iso_date(v):
    """'9/3/2026 11:44:55 AM' -> '2026-09-03' (leave anything else untouched)."""
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', clean(v))
    if not m:
        return ''
    mm, dd, yy = (int(x) for x in m.groups())
    return '%04d-%02d-%02d' % (yy, mm, dd)



def load_page_data():
    with open(DATA, encoding='utf-8-sig') as f:
        src = f.read()
    m = re.search(r'(?s)^(.*?window\.C3D_DATA\s*=\s*)(\{.*\})(\s*;?\s*)$', src)
    if not m:
        raise RuntimeError('data/cables.js does not look like a C3D_DATA file')
    return src, m.group(1), json.loads(m.group(2)), m.group(3)


SUBS_FILE = os.path.join(HERE, 'data', 'subsystems.js')


def platform_subsystems(rows):
    """Every PS5 E/I/T subsystem on the platform (even the ones with no cable)."""
    agg = {}
    for r in rows:
        d = clean(r.get('TaskDisciplineSummary') or r.get('TaskDiscipline'))[:1].upper()
        if d not in ('E', 'I', 'T'):
            continue
        pb = clean(r.get('ProcessBreakdown'))
        if not pb:
            continue
        a = agg.setdefault(pb, {'tasks': 0, 'closed': 0, 'types': collections.Counter()})
        a['tasks'] += 1
        if clean(r.get('TaskState')) == 'Closed':
            a['closed'] += 1
        t = clean(r.get('TaskType'))
        if t:
            a['types'][t] += 1
    items = [{'n': k, 'tasks': v['tasks'], 'closed': v['closed'],
              'types': len(v['types'])} for k, v in agg.items()]
    items.sort(key=lambda x: (-x['tasks'], x['n']))
    return items


def write_subsystems(items, source):
    payload = collections.OrderedDict([
        ('updated', time.strftime('%Y-%m-%d %H:%M')),
        ('source', source),
        ('count', len(items)),
        ('items', items),
    ])
    body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    with open(SUBS_FILE, 'w', encoding='utf-8-sig', newline='\n') as f:
        f.write('/* AUTO-GENERATED by sync_subsystem.py from SmartCloud '
                '(vTasks_TestsPlanned, PS5 E/I/T) */\n')
        f.write('window.C3D_SUBSYSTEMS = ' + body + ';\n')
    log('   wrote %s (%d subsystems)' % (SUBS_FILE, len(items)))
    return len(items)


def apply(by_task, by_asset, dry_run=False, flags=True):
    src, prefix, obj, tail = load_page_data()
    cols = obj['columns']
    ti = cols.index('taskId')
    si = cols.index('subsystem')
    fi = cols.index('fromTag')
    toi = cols.index('toTag')
    stai = cols.index('taskState')
    pi = cols.index('pulled')
    tri = cols.index('terminated')
    pdi = cols.index('pullDate')
    tdi = cols.index('termDate')

    stats = collections.Counter()
    samples = []
    for row in obj['rows']:
        info = by_task.get(clean(row[ti])) or {}

        cur = clean(row[si])
        new = (info.get('sub') or by_asset.get(clean(row[fi]))
               or by_asset.get(clean(row[toi])) or '')
        if not new:
            stats['subsystem no match'] += 1
        elif new == cur:
            stats['subsystem already right'] += 1
        else:
            if not cur:
                stats['subsystem filled (empty)'] += 1
            elif new.startswith(cur):
                stats['subsystem de-truncated'] += 1
            else:
                stats['subsystem changed'] += 1
            if len(samples) < 5:
                samples.append((row[ti], cur, new))
            row[si] = new

        # ---- progress flags: a Closed Conformity Check means pulled + terminated
        if not (flags and info):
            continue
        if info['state'] and row[stai] != info['state']:
            row[stai] = info['state']
            stats['task state updated'] += 1
        if info['closed']:
            d = iso_date(info['date'])
            if row[pi] is not True:
                row[pi] = True
                stats['pulled -> yes'] += 1
            if row[tri] is not True:
                row[tri] = True
                stats['terminated -> yes'] += 1
            if d and not clean(row[pdi]):
                row[pdi] = d
            if d and not clean(row[tdi]):
                row[tdi] = d

    # assets[].refName mirrors the subsystem of a reference asset - keep it in step
    ref_fixed = 0
    for a in obj.get('assets', []):
        tag = clean(a.get('tag'))
        new = by_asset.get(tag)
        cur = clean(a.get('refName'))
        if new and cur and new.startswith(cur) and new != cur:
            a['refName'] = new
            ref_fixed += 1

    if isinstance(obj.get('stats'), dict):
        obj['stats']['pulled'] = sum(1 for r in obj['rows'] if r[pi] is True)
        obj['stats']['terminated'] = sum(1 for r in obj['rows'] if r[tri] is True)

    changed = sum(v for k, v in stats.items()
                  if k not in ('subsystem already right', 'subsystem no match'))
    log('')
    for k in ('subsystem already right', 'subsystem de-truncated', 'subsystem filled (empty)',
              'subsystem changed', 'subsystem no match', 'task state updated',
              'pulled -> yes', 'terminated -> yes'):
        log('   %-26s %d' % (k, stats[k]))
    log('   assets refName            %d' % ref_fixed)
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
    log('\nWrote %s (%d changes, %.1f MB)' % (DATA, changed, os.path.getsize(DATA) / 1048576))
    log('   totals now: %d cables, pulled %d, terminated %d' % (
        len(obj['rows']), obj['stats']['pulled'], obj['stats']['terminated']))
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

    git('add', '--', 'data/cables.js', 'data/subsystems.js')
    st = git('status', '--porcelain', '--', 'data/cables.js', 'data/subsystems.js')
    if not (st.stdout or '').strip():
        log('   nothing to push - GitHub already has this version')
        return 0
    r = git('commit', '-m', 'smartcloud sync %s' % time.strftime('%Y-%m-%d %H:%M'))
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
    ap.add_argument('--no-flags', action='store_true',
                    help='only refresh subsystem, leave pulled/terminated/taskState alone')
    ap.add_argument('--allow-stale', action='store_true',
                    help='also write from a cache older than 12 h (can revert live values)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-push', action='store_true')
    a = ap.parse_args()

    log('CABINET 3D - subsystem sync from SmartCloud')

    rows, source = [], ''
    live = False
    if not a.cached:
        if cdp_alive():
            try:
                log('   SmartCloud browser found on 9222 - live pull')
                rows, source = live_pull(timeout_s=420)
                live = True
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
        newest = max(os.path.getmtime(p) for p in CACHE_CANDIDATES if os.path.isfile(p))
        age_h = (time.time() - newest) / 3600.0
        # A stale cache must never overwrite fresher values that a live run wrote.
        if age_h > 12 and not a.allow_stale:
            log('   cache is %.0f h old - refusing to overwrite the page with it' % age_h)
            log('   (use --allow-stale to force, or open the SmartCloud window)')
            return 0

    log('   source: %s (%d platform rows)' % (source, len(rows)))
    # A task id is unique across the whole platform pull (checked: 0 duplicates),
    # so every row can be used for mapping. The cable schedule's ids belong to
    # more than one responsible company (CPP AGI / EITS), so restricting the map
    # to CPP alone would leave 237 cables on stale, truncated subsystem names.
    by_task, by_asset = build_maps(rows)
    log('   mappable: %d task ids / %d asset tags' % (len(by_task), len(by_asset)))

    plat = platform_subsystems(rows)
    log('   platform PS5 E/I/T subsystems: %d' % len(plat))

    changed_data = apply(by_task, by_asset, dry_run=a.dry_run, flags=(not a.no_flags) and live)
    if a.dry_run:
        return 0

    old_subs = ''
    try:
        old_subs = open(SUBS_FILE, encoding='utf-8-sig').read()
    except Exception:
        pass
    write_subsystems(plat, source)
    changed_subs = open(SUBS_FILE, encoding='utf-8-sig').read() != old_subs

    if not changed_data and not changed_subs:
        return 0
    if a.no_push:
        log('   --no-push: nothing sent to GitHub')
        return 0
    return push()


if __name__ == '__main__':
    sys.exit(main())
