#!/usr/bin/env python3
"""Convert raw prop GLBs (cars, trees, weapons ...) from <in_dir> to light, normalised, plain-PBR GLBs in <out_dir>.
usage: convert_props.py <in_dir> <out_dir>
Rules are chosen by file name (contains: charger / m3 / bmw / tree_animate / grass / ak47 / pistol). Unknown files are skipped.
"""
import sys, os, re, io, json, traceback
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gltfscene as G


def decimate(p, cell):
    """vertex clustering inside UV islands (keeps texture mapping). p: dict pos nor uv idx"""
    pos, nor, uv, idx = p['pos'], p['nor'], p['uv'], p['idx']
    n = len(pos)
    ed = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]]])
    g = coo_matrix((np.ones(len(ed)), (ed[:, 0], ed[:, 1])), shape=(n, n))
    _, island = connected_components(g, directed=False)
    ip = np.floor(pos / cell).astype(np.int64)
    uvq = np.floor(uv / 0.04).astype(np.int64)
    keys = np.column_stack([ip, uvq, island.astype(np.int64)])
    _, inv = np.unique(keys, axis=0, return_inverse=True)
    inv = inv.reshape(-1); m = inv.max() + 1
    cnt = np.bincount(inv, minlength=m).astype(np.float64)

    def avg(a):
        out = np.zeros((m, a.shape[1]))
        for k in range(a.shape[1]): out[:, k] = np.bincount(inv, weights=a[:, k].astype(np.float64), minlength=m)
        return out / cnt[:, None]
    P, N, UV = avg(pos), avg(nor), avg(uv)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    T = inv[idx]
    ok = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
    T = T[ok]
    _, first = np.unique(np.sort(T, axis=1), axis=0, return_index=True)
    T = T[np.sort(first)]
    used = np.unique(T); remap = -np.ones(m, np.int64); remap[used] = np.arange(len(used))
    return dict(pos=P[used].astype(np.float32), nor=N[used].astype(np.float32), uv=UV[used].astype(np.float32), idx=remap[T], mat=p['mat'], node=p.get('node', ''))


def reduce_to(prims, target_tris):
    total = sum(len(p['idx']) for p in prims)
    if total <= target_tris: return prims
    allp = np.concatenate([p['pos'] for p in prims]); size = np.linalg.norm(allp.max(0) - allp.min(0))
    lo, hi = size / 4000, size / 20
    best = None
    for _ in range(9):
        mid = (lo * hi) ** 0.5
        out = [decimate(p, mid) if len(p['idx']) > 400 else p for p in prims]
        t = sum(len(p['idx']) for p in out)
        if t > target_tris: lo = mid
        else: hi = mid; best = out
    return best if best is not None else out


def transform(prims, M):
    for p in prims:
        p['pos'] = (np.c_[p['pos'], np.ones(len(p['pos']))] @ M.T)[:, :3].astype(np.float32)
        R = np.linalg.inv(M[:3, :3]).T
        nn = p['nor'] @ R.T; p['nor'] = (nn / np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)).astype(np.float32)
        if np.linalg.det(M[:3, :3]) < 0: p['idx'] = p['idx'][:, ::-1]


def bbox(prims):
    a = np.concatenate([p['pos'] for p in prims]); return a.min(0), a.max(0)


def normalise_vehicle(prims, length, out_front=(0, 0, -1)):
    """longest horizontal axis -> Z, centred, wheels on y=0, scaled to `length` metres. returns the rotation applied"""
    lo, hi = bbox(prims); ext = hi - lo
    # find the up axis: the vehicle's height is the smallest extent among the three here (cars are longer and wider than tall)
    ax = np.argsort(ext)  # small..large
    long_axis = ax[2]
    M = np.eye(4)
    if long_axis == 0:   # x is longest: rotate so x -> z
        M[:3, :3] = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]
    transform(prims, M)
    lo, hi = bbox(prims); s = length / (hi[2] - lo[2])
    c = (lo + hi) / 2
    T = np.eye(4); T[:3, :3] *= s; T[:3, 3] = [-c[0] * s, -lo[1] * s, -c[2] * s]
    transform(prims, T)


def split_trees(prims):
    """tree_animate: several trees in one file along X -> list of prim lists (each re-centred at its trunk base)"""
    bark = [p for p in prims if 'bark' in p['node'].lower() or 'trunk' in p['node'].lower()] or prims[:1]
    xs = np.concatenate([p['pos'][:, 0] for p in bark]); xs_sorted = np.sort(xs)
    gaps = np.where(np.diff(xs_sorted) > (xs_sorted[-1] - xs_sorted[0]) * 0.06)[0]
    cuts = [xs_sorted[g] + (xs_sorted[g + 1] - xs_sorted[g]) / 2 for g in gaps]
    cents = []; edges = [-1e9] + cuts + [1e9]
    for a, b in zip(edges[:-1], edges[1:]):
        m = (xs >= a) & (xs < b)
        if m.sum() > 50: cents.append((xs[m].mean()))
    return cents


def main(in_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for f in sorted(os.listdir(in_dir)):
        if not f.lower().endswith('.glb'): continue
        low = f.lower()
        try:
            if 'charger' in low or 'police' in low and 'zombie' not in low:
                j, binb, mats, prims = G.read_prims(os.path.join(in_dir, f))
                normalise_vehicle(prims, 5.07)
                sz = G.write(os.path.join(out_dir, 'car_police.glb'), reduce_to(prims, 36000), mats, j, binb, 1024, dict(kind='car', length=5.07, name='Police Dodge Charger'))
                print('car_police.glb %.1f MB' % (sz / 1e6))
            elif 'm3' in low or 'bmw' in low:
                j, binb, mats, prims = G.read_prims(os.path.join(in_dir, f), skip_skinned=False)
                # transmissive / glass -> blended plastic glass
                ext = j.get('extensionsUsed') or []
                for k, m in enumerate(j.get('materials', [])):
                    if (m.get('extensions') or {}).get('KHR_materials_transmission') or 'glass' in (m.get('name', '').lower()) or 'window' in m.get('name', '').lower():
                        mats[k]['alpha'] = 'BLEND'; mats[k]['color'] = [0.08, 0.1, 0.12, 0.35]; mats[k]['tex'] = None
                normalise_vehicle(prims, 4.84)
                sz = G.write(os.path.join(out_dir, 'car_m3.glb'), reduce_to(prims, 60000), mats, j, binb, 1024, dict(kind='car', length=4.84, name='BMW M3 CS Touring'))
                print('car_m3.glb %.1f MB' % (sz / 1e6))
            elif 'ak47' in low or 'ak_47' in low or 'ak-47' in low:
                j, binb, mats, prims = G.read_prims(os.path.join(in_dir, f))
                lo, hi = bbox(prims); ext = hi - lo
                normalise_vehicle(prims, 0.88)         # long axis -> Z, then length 0.88 m (re-centred, y>=0)
                sz = G.write(os.path.join(out_dir, 'gun_ak47.glb'), prims, mats, j, binb, 1024, dict(kind='gun', length=0.88))
                print('gun_ak47.glb %.1f MB' % (sz / 1e6))
            elif 'pistol' in low:
                j, binb, mats, prims = G.read_prims(os.path.join(in_dir, f))
                normalise_vehicle(prims, 0.21)
                sz = G.write(os.path.join(out_dir, 'gun_pistol.glb'), prims, mats, j, binb, 1024, dict(kind='gun', length=0.21))
                print('gun_pistol.glb %.1f MB' % (sz / 1e6))
            elif 'tree_animate' in low:
                j, binb, mats, prims = G.read_prims(os.path.join(in_dir, f))
                cents = split_trees(prims)
                lo, hi = bbox(prims)
                print('trees found:', len(cents), 'x centres', np.round(cents, 1))
                # assign every triangle (by centroid x) to its nearest trunk centre
                cents = np.array(cents)
                for ti, cx in enumerate(cents):
                    part = []
                    for p in prims:
                        cen = p['pos'][p['idx']].mean(axis=1)[:, 0]
                        near = np.argmin(np.abs(cen[:, None] - cents[None, :]), axis=1) == ti
                        if near.sum() == 0: continue
                        T = p['idx'][near]; used = np.unique(T); rm = -np.ones(len(p['pos']), np.int64); rm[used] = np.arange(len(used))
                        part.append(dict(pos=p['pos'][used].copy(), nor=p['nor'][used], uv=p['uv'][used], idx=rm[T], mat=p['mat'], node=p['node']))
                    l2, h2 = bbox(part)
                    s = 8.5 / (h2[1] - l2[1])
                    M = np.eye(4); M[:3, :3] *= s; M[:3, 3] = [-cx * s, -l2[1] * s, -((l2[2] + h2[2]) / 2) * s]
                    transform(part, M)
                    sz = G.write(os.path.join(out_dir, 'tree_%d.glb' % (ti + 1)), part, mats, j, binb, 1024, dict(kind='tree', height=8.5))
                    print('tree_%d.glb %.1f MB %d tris' % (ti + 1, sz / 1e6, sum(len(p['idx']) for p in part)))
            elif 'grass' in low:
                j, binb, mats, prims = G.read_prims(os.path.join(in_dir, f))
                # grass: only the diffuse texture is needed (cards are built in code)
                m = mats[prims[0]['mat']]
                data = G.image_bytes(j, binb, m['tex'])
                from PIL import Image
                im = Image.open(io.BytesIO(data)).convert('RGBA'); im.thumbnail((512, 512))
                im.save(os.path.join(out_dir, 'grass.png'), optimize=True)
                print('grass.png', im.size)
            else:
                print('skip', f)
        except Exception as e:
            print('WARNING failed', f, e); traceback.print_exc()


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
