#!/usr/bin/env python3
"""Turn raw character scans (static GLB, any size) into light, rigged game characters.

usage: process_people.py <in_dir> <out_dir>

For every <in_dir>/*.glb it writes
    <out_dir>/<id>.glb       hero model (the player, ~90k triangles, 2K texture)
    <out_dir>/<id>_lod.glb   crowd model (~12k triangles, 512 texture)
and finally <out_dir>/people.json listing every character found in <out_dir>.

Input assumptions: one mesh with ONE material, standing upright (+Y up), arms out in a T / A pose, roughly 1.4-2.1 m tall.
The model is re-centred (feet at y=0, torso at x=z=0), turned to face +Z, rigged with an 18-bone skeleton using
height-proportional landmarks and capsule weights. Walking is animated in code (src/walker.js), no animation clips needed.
A file that cannot be processed is skipped with a warning (the build never fails because of one character).
"""
import sys, io, os, json, struct, re, traceback
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import read_glb
import gltfscene as GS


def pad4(b, c=b'\x00'):
    return b + c * ((4 - len(b) % 4) % 4)


def normalise(pos, nor):
    """feet on y=0, torso centred on x=z=0, facing +Z, sensible height. returns pos, nor, H"""
    pos = pos.copy(); nor = nor.copy()
    pos[:, 1] -= pos[:, 1].min()
    H = pos[:, 1].max()
    if H < 1.45 or H > 1.95:
        k = 1.75 / H; pos *= k; H = 1.75
    torso = (pos[:, 1] > 0.30 * H) & (pos[:, 1] < 0.62 * H) & (np.abs(pos[:, 0]) < 0.14 * H)
    cx = (pos[:, 0].min() + pos[:, 0].max()) / 2
    cz = np.median(pos[torso, 2]) if torso.sum() > 50 else np.median(pos[:, 2])
    pos[:, 0] -= cx; pos[:, 2] -= cz
    # facing: feet / toes stick out further to the front
    feet = pos[:, 1] < 0.04 * H
    if feet.sum() > 20:
        zf = pos[feet, 2]
        if np.percentile(zf, 98) + np.percentile(zf, 2) < 0:        # more mass behind the origin -> toes point to -Z
            pos[:, 0] *= -1; pos[:, 2] *= -1; nor[:, 0] *= -1; nor[:, 2] *= -1
    return pos, nor, H


def cluster(pos, nor, uv, idx, cell_body, head_y, seams=True, extra=None):
    n = len(pos)
    ed = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]]])
    g = coo_matrix((np.ones(len(ed)), (ed[:, 0], ed[:, 1])), shape=(n, n))
    _, island = connected_components(g, directed=False)
    cell = np.where(pos[:, 1] > head_y, cell_body * 0.55, cell_body)
    ip = np.floor(pos / cell[:, None]).astype(np.int64)
    uvq = np.floor(uv / 0.03).astype(np.int64)          # never merge vertices that sample far-apart texels
    keys = np.column_stack([ip, uvq, island.astype(np.int64)]) if seams else ip
    _, inv = np.unique(keys, axis=0, return_inverse=True)
    inv = inv.reshape(-1); m = inv.max() + 1
    cnt = np.bincount(inv, minlength=m).astype(np.float64)

    def avg(a):
        out = np.zeros((m, a.shape[1]))
        for k in range(a.shape[1]):
            out[:, k] = np.bincount(inv, weights=a[:, k].astype(np.float64), minlength=m)
        return out / cnt[:, None]
    P, N, UV = avg(pos), avg(nor), avg(uv)
    X = avg(extra) if extra is not None else None
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
    T = inv[idx]
    ok = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
    T = T[ok]
    _, first = np.unique(np.sort(T, axis=1), axis=0, return_index=True)
    T = T[np.sort(first)]
    used = np.unique(T)
    remap = -np.ones(m, dtype=np.int64); remap[used] = np.arange(len(used))
    return (P[used], N[used], UV[used], remap[T]) if extra is None else (P[used], N[used], X[used], remap[T])


def skeleton(pos, H):
    """joint rest positions from height-proportional landmarks + the measured hand tips"""
    s = H / 1.8
    J = {}

    def add(name, parent, p):
        J[name] = dict(parent=parent, p=np.array(p, float))
    add('Hips', None, (0, 0.95 * s, 0)); add('Spine', 'Hips', (0, 1.00 * s, 0)); add('Chest', 'Spine', (0, 1.22 * s, 0))
    add('Neck', 'Chest', (0, 1.46 * s, 0.01 * s)); add('Head', 'Neck', (0, 1.56 * s, 0.02 * s))
    arm_down = None; tips = {}
    for side, sx in (('L', 1), ('R', -1)):
        side_pts = pos[pos[:, 0] * sx > 0]
        xm = np.abs(side_pts[:, 0]).max()
        tip_pts = side_pts[np.abs(side_pts[:, 0]) > 0.97 * xm]
        tip = np.array([sx * xm, tip_pts[:, 1].mean(), tip_pts[:, 2].mean()])
        sh = np.array([sx * 0.105 * H, 0.767 * H, 0.0])
        tips[side] = tip
        add('UpperArm' + side, 'Chest', sh)
        add('ForeArm' + side, 'UpperArm' + side, sh + 0.37 * (tip - sh))
        add('Hand' + side, 'ForeArm' + side, sh + 0.73 * (tip - sh))
        add('Thigh' + side, 'Hips', (0.0528 * H * sx, 0.511 * H, 0))
        add('Shin' + side, 'Thigh' + side, (0.0528 * H * sx, 0.278 * H, 0))
        add('Foot' + side, 'Shin' + side, (0.056 * H * sx, 0.056 * H, 0.005 * H))
        th = np.arctan2(tip[1] - sh[1], abs(tip[0] - sh[0]))          # arm angle below horizontal is negative
        d = -np.pi / 2 - th if th < 0 else -np.pi / 2 - th
        arm_down = abs(d) if arm_down is None else (arm_down + abs(d)) / 2
    arm_down = float(np.clip(arm_down - 0.10, 0.0, 1.5))
    return J, tips, arm_down


def weights(P, J, tips, H):
    s = H / 1.8
    names = list(J.keys()); ix = {k: i for i, k in enumerate(names)}

    def cap(a, b, r, side=0):
        return (np.array(a, float), np.array(b, float), r * s, side)
    z = 0.0
    C = {
        'Hips': cap((0, 0.90, z), (0, 1.00, z), 0.19),
        'Spine': cap((0, 1.00, z), (0, 1.22, z), 0.19),
        'Chest': cap((0, 1.22, z), (0, 1.44, z), 0.20),
        'Neck': cap((0, 1.46, z), (0, 1.56, z), 0.06),
        'Head': cap((0, 1.58, z), (0, 1.76, z), 0.14),
    }
    for sd, sx in (('L', 1), ('R', -1)):
        C['UpperArm' + sd] = cap(J['UpperArm' + sd]['p'] / s, J['ForeArm' + sd]['p'] / s, 0.052, sx)
        C['ForeArm' + sd] = cap(J['ForeArm' + sd]['p'] / s, J['Hand' + sd]['p'] / s, 0.047, sx)
        C['Hand' + sd] = cap(J['Hand' + sd]['p'] / s, tips[sd] / s, 0.045, sx)
        C['Thigh' + sd] = cap(J['Thigh' + sd]['p'] / s, J['Shin' + sd]['p'] / s, 0.105, sx)
        C['Shin' + sd] = cap(J['Shin' + sd]['p'] / s, J['Foot' + sd]['p'] / s, 0.075, sx)
        C['Foot' + sd] = cap(J['Foot' + sd]['p'] / s, (J['Foot' + sd]['p'][0] / s, 0.03, 0.13), 0.085, sx)
    # capsules are authored for a 1.8 m figure (points in 1.8 m units, radii pre-scaled); P is scaled by s here
    def seg_dist(p, a, b):
        ab = b - a; t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
    K = 70.0 / s
    S = np.full((len(P), len(names)), -1e9)
    for name, (a, b, r, side) in C.items():
        sc = -K * (seg_dist(P, a * s, b * s) - r)
        arm = name.startswith(('UpperArm', 'ForeArm', 'Hand'))
        if side > 0: sc = np.where(P[:, 0] > (0.03 * s if arm else -0.02 * s), sc, -1e9)
        if side < 0: sc = np.where(P[:, 0] < (-0.03 * s if arm else 0.02 * s), sc, -1e9)
        S[:, ix[name]] = sc
    S -= S.max(axis=1, keepdims=True)
    W = np.exp(S)
    top = np.argsort(-W, axis=1)[:, :4]
    Wt = np.take_along_axis(W, top, axis=1); Wt /= Wt.sum(axis=1, keepdims=True)
    Wt[Wt < 0.02] = 0; Wt /= Wt.sum(axis=1, keepdims=True)
    return names, top, Wt


def jpeg(b, size, q):
    im = Image.open(io.BytesIO(b)).convert('RGB').resize((size, size), Image.LANCZOS)
    o = io.BytesIO(); im.save(o, 'JPEG', quality=q, optimize=True); return o.getvalue()


def write_glb(path, P, N, UV, T, names, top, Wt, J, arm_down, tex, base_factor, credit, shell=None):
    chunks = []; views = []; accs = []

    def add_view(data, target=None):
        data = pad4(data); off = sum(len(c) for c in chunks); chunks.append(data)
        v = dict(buffer=0, byteOffset=off, byteLength=len(data))
        if target: v['target'] = target
        views.append(v); return len(views) - 1

    def add_acc(view, ct, count, typ, mn=None, mx=None):
        a = dict(bufferView=view, componentType=ct, count=count, type=typ)
        if mn is not None: a['min'] = mn; a['max'] = mx
        accs.append(a); return len(accs) - 1
    Pf, Nf, Uf = P.astype(np.float32), N.astype(np.float32), UV.astype(np.float32)
    a_pos = add_acc(add_view(Pf.tobytes(), 34962), 5126, len(Pf), 'VEC3', Pf.min(0).tolist(), Pf.max(0).tolist())
    a_nor = add_acc(add_view(Nf.tobytes(), 34962), 5126, len(Nf), 'VEC3')
    a_uv = add_acc(add_view(Uf.tobytes(), 34962), 5126, len(Uf), 'VEC2')
    a_jt = add_acc(add_view(top.astype(np.uint8).tobytes(), 34962), 5121, len(top), 'VEC4')
    a_wt = add_acc(add_view(Wt.astype(np.float32).tobytes(), 34962), 5126, len(Wt), 'VEC4')
    if len(P) < 65535:
        a_idx = add_acc(add_view(T.astype(np.uint16).tobytes(), 34963), 5123, T.size, 'SCALAR')
    else:
        a_idx = add_acc(add_view(T.astype(np.uint32).tobytes(), 34963), 5125, T.size, 'SCALAR')
    ibm = np.zeros((len(names), 16), np.float32)
    for k, name in enumerate(names):
        M = np.eye(4); M[:3, 3] = -J[name]['p']; ibm[k] = M.T.reshape(16)
    a_ibm = add_acc(add_view(ibm.tobytes()), 5126, len(names), 'MAT4')
    shell_prim = None
    if shell is not None:
        sP, sN, sC, sT, stop, sWt = shell
        sa = dict(POSITION=add_acc(add_view(sP.astype(np.float32).tobytes(), 34962), 5126, len(sP), 'VEC3', sP.min(0).tolist(), sP.max(0).tolist()),
                  NORMAL=add_acc(add_view(sN.astype(np.float32).tobytes(), 34962), 5126, len(sN), 'VEC3'),
                  COLOR_0=add_acc(add_view(sC.astype(np.float32).tobytes(), 34962), 5126, len(sC), 'VEC3'),
                  JOINTS_0=add_acc(add_view(stop.astype(np.uint8).tobytes(), 34962), 5121, len(stop), 'VEC4'),
                  WEIGHTS_0=add_acc(add_view(sWt.astype(np.float32).tobytes(), 34962), 5126, len(sWt), 'VEC4'))
        shell_prim = dict(attributes=sa, indices=add_acc(add_view(sT.astype(np.uint16).tobytes(), 34963), 5123, sT.size, 'SCALAR'), material=1)
    images = []; textures = []
    mat = dict(name='skin', doubleSided=True, pbrMetallicRoughness=dict(metallicFactor=0.0, roughnessFactor=0.9, baseColorFactor=base_factor))
    for key, data in tex:
        images.append(dict(bufferView=add_view(data), mimeType='image/jpeg')); textures.append(dict(source=len(images) - 1, sampler=0))
        ti = len(textures) - 1
        if key == 'base':
            mat['pbrMetallicRoughness']['baseColorTexture'] = dict(index=ti); mat['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 1]
        elif key == 'mr':
            mat['pbrMetallicRoughness']['metallicRoughnessTexture'] = dict(index=ti); mat['pbrMetallicRoughness']['metallicFactor'] = 1.0; mat['pbrMetallicRoughness']['roughnessFactor'] = 1.0
        elif key == 'normal':
            mat['normalTexture'] = dict(index=ti)
    nodes = []
    for name in names:
        par = J[name]['parent']
        local = J[name]['p'] - (J[par]['p'] if par else 0)
        nodes.append(dict(name=name, translation=[float(x) for x in local], children=[]))
    ix = {k: i for i, k in enumerate(names)}
    for name in names:
        if J[name]['parent']: nodes[ix[J[name]['parent']]]['children'].append(ix[name])
    for nd in nodes:
        if not nd['children']: del nd['children']
    nodes.append(dict(name='body', mesh=0, skin=0, extras=dict(rig=dict(armDown=arm_down, height=float(P[:, 1].max())))))
    gltf = dict(
        asset=dict(version='2.0', generator='process_people.py', copyright=credit),
        scene=0, scenes=[dict(nodes=[0, len(nodes) - 1])], nodes=nodes,
        skins=[dict(joints=list(range(len(names))), inverseBindMatrices=a_ibm, skeleton=0)],
        meshes=[dict(name='body', primitives=[dict(attributes=dict(POSITION=a_pos, NORMAL=a_nor, TEXCOORD_0=a_uv, JOINTS_0=a_jt, WEIGHTS_0=a_wt), indices=a_idx, material=0)] + ([shell_prim] if shell_prim else []))],
        materials=[mat, dict(name='shell', doubleSided=True, pbrMetallicRoughness=dict(metallicFactor=0.0, roughnessFactor=0.95))], textures=textures, samplers=[dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)],
        images=images, accessors=accs, bufferViews=views)
    binb = b''.join(chunks)
    gltf['buffers'] = [dict(byteLength=len(binb))]
    if not textures: del gltf['textures'], gltf['images'], gltf['samplers']
    jb = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(binb), 0x004E4942) + binb
    open(path, 'wb').write(out)
    return len(out)


def process(src, out_dir, cid):
    jj, _b = GS.load(src)
    if len(jj['meshes']) != 1 or len(jj['meshes'][0]['primitives']) != 1 or 'skins' in jj:
        return process_multi(src, out_dir, cid)
    j, pos, nor, uv, idx, imgs = read_glb(src)
    prims = j['meshes'][0]['primitives']
    if len(prims) != 1 or len(j['meshes']) != 1:
        raise RuntimeError('needs exactly one mesh with one material (found %d meshes / %d primitives)' % (len(j['meshes']), len(prims)))
    pos, nor, H = normalise(pos, nor)
    print('  %s: %d verts %d tris, height %.2f m' % (cid, len(pos), len(idx), H))
    mat = j['materials'][prims[0].get('material', 0)] if j.get('materials') else {}
    pbr = mat.get('pbrMetallicRoughness', {})
    texs = j.get('textures', [])

    def img_of(t):
        return imgs[texs[t['index']]['source']] if t and 'index' in t else None
    base, mr, nrm = img_of(pbr.get('baseColorTexture')), img_of(pbr.get('metallicRoughnessTexture')), img_of(mat.get('normalTexture'))
    base_factor = pbr.get('baseColorFactor', [0.8, 0.8, 0.8, 1.0])
    credit = 'Character: %s (processed). Check the licence of your source files.' % cid
    s = H / 1.8
    J, tips, arm_down = skeleton(pos, H)
    base_arr = vcol = None
    if base:
        base_arr = np.asarray(Image.open(io.BytesIO(base)).convert('RGB').resize((1024, 1024), Image.BILINEAR), dtype=np.float32) / 255.0
        px = np.clip((uv[:, 0] % 1.0) * 1024, 0, 1023).astype(int); py = np.clip((uv[:, 1] % 1.0) * 1024, 0, 1023).astype(int)
        vcol = base_arr[py, px]
    for variant, cell, sizes in (('', 0.0080, (2048, 1024, 1024)), ('_lod', 0.0210, (512, None, None))):
        P, N, UV, T = cluster(pos, nor, uv, idx, cell * s, 1.52 * s)
        names, top, Wt = weights(P, J, tips, H)
        tex = []
        if base: tex.append(('base', jpeg(base, sizes[0], 84 if not variant else 78)))
        if sizes[1] and nrm: tex.append(('normal', jpeg(nrm, sizes[1], 86)))
        if sizes[2] and mr: tex.append(('mr', jpeg(mr, sizes[2], 80)))
        shell = None
        if base_arr is not None:
            sP, sN, sC, sT = cluster(pos, nor, uv, idx, (0.030 if not variant else 0.045) * s, 1.52 * s, seams=False, extra=vcol)
            sP = sP - sN * (0.010 if not variant else 0.016) * s
            sn, stop, sWt = weights(sP, J, tips, H)
            shell = (sP, sN, np.clip(sC, 0, 1) ** 2.2, sT, stop, sWt)
        size = write_glb(os.path.join(out_dir, cid + variant + '.glb'), P, N, UV, T, names, top, Wt, J, arm_down, tex, base_factor, credit, shell)
        print('    %s%s: %d verts %d tris -> %.2f MB' % (cid, variant, len(P), len(T), size / 1e6))


def write_multi(path, parts, names, J, arm_down, credit, height):
    """parts: dict(P,N,UV,T,top,Wt, imgs{base,normal,mr}(jpeg bytes), color, alpha, cutoff, double, shell=(...)|None)"""
    chunks = []; views = []; accs = []; images = []; textures = []; mats = []

    def add_view(data, target=None):
        data = pad4(data); off = sum(len(c) for c in chunks); chunks.append(data)
        v = dict(buffer=0, byteOffset=off, byteLength=len(data))
        if target: v['target'] = target
        views.append(v); return len(views) - 1

    def add_acc(view, ct, count, typ, mn=None, mx=None):
        a = dict(bufferView=view, componentType=ct, count=count, type=typ)
        if mn is not None: a['min'] = mn; a['max'] = mx
        accs.append(a); return len(accs) - 1

    def add_tex(data, mime):
        images.append(dict(bufferView=add_view(data), mimeType=mime)); textures.append(dict(source=len(images) - 1, sampler=0)); return len(textures) - 1
    ibm = np.zeros((len(names), 16), np.float32)
    for k, name in enumerate(names):
        M = np.eye(4); M[:3, 3] = -J[name]['p']; ibm[k] = M.T.reshape(16)
    a_ibm = add_acc(add_view(ibm.tobytes()), 5126, len(names), 'MAT4')
    prims = []
    shell_mat = len(parts)                      # shared 'shell' material goes last
    for k, pt in enumerate(parts):
        P, N, U, T = pt['P'].astype(np.float32), pt['N'].astype(np.float32), pt['UV'].astype(np.float32), pt['T']
        if len(T):
            at = dict(POSITION=add_acc(add_view(P.tobytes(), 34962), 5126, len(P), 'VEC3', P.min(0).tolist(), P.max(0).tolist()),
                      NORMAL=add_acc(add_view(N.tobytes(), 34962), 5126, len(N), 'VEC3'),
                      TEXCOORD_0=add_acc(add_view(U.tobytes(), 34962), 5126, len(U), 'VEC2'),
                      JOINTS_0=add_acc(add_view(pt['top'].astype(np.uint8).tobytes(), 34962), 5121, len(P), 'VEC4'),
                      WEIGHTS_0=add_acc(add_view(pt['Wt'].astype(np.float32).tobytes(), 34962), 5126, len(P), 'VEC4'))
            ia = add_acc(add_view(T.astype(np.uint16 if len(P) < 65535 else np.uint32).tobytes(), 34963), 5123 if len(P) < 65535 else 5125, T.size, 'SCALAR')
            prims.append(dict(attributes=at, indices=ia, material=k))
        m = dict(name=pt.get('name') or 'm%d' % k, doubleSided=True, pbrMetallicRoughness=dict(metallicFactor=0.0, roughnessFactor=0.9, baseColorFactor=pt['color']))
        im = pt['imgs']
        if 'base' in im and len(T):
            m['pbrMetallicRoughness']['baseColorTexture'] = dict(index=add_tex(*im['base'])); m['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, pt['color'][3]]
        if 'normal' in im and len(T): m['normalTexture'] = dict(index=add_tex(*im['normal']))
        if pt['alpha'] == 'MASK': m['alphaMode'] = 'MASK'; m['alphaCutoff'] = pt['cutoff']
        elif pt['alpha'] == 'BLEND': m['alphaMode'] = 'BLEND'
        mats.append(m)
        sh = pt.get('shell')
        if sh is not None:
            sP, sN, sC, sT, stop, sWt = sh
            sa = dict(POSITION=add_acc(add_view(sP.astype(np.float32).tobytes(), 34962), 5126, len(sP), 'VEC3', sP.min(0).tolist(), sP.max(0).tolist()),
                      NORMAL=add_acc(add_view(sN.astype(np.float32).tobytes(), 34962), 5126, len(sN), 'VEC3'),
                      COLOR_0=add_acc(add_view(sC.astype(np.float32).tobytes(), 34962), 5126, len(sC), 'VEC3'),
                      JOINTS_0=add_acc(add_view(stop.astype(np.uint8).tobytes(), 34962), 5121, len(stop), 'VEC4'),
                      WEIGHTS_0=add_acc(add_view(sWt.astype(np.float32).tobytes(), 34962), 5126, len(sWt), 'VEC4'))
            prims.append(dict(attributes=sa, indices=add_acc(add_view(sT.astype(np.uint16 if len(sP) < 65535 else np.uint32).tobytes(), 34963, ), 5123 if len(sP) < 65535 else 5125, sT.size, 'SCALAR'), material=shell_mat))
    mats.append(dict(name='shell', doubleSided=True, pbrMetallicRoughness=dict(metallicFactor=0.0, roughnessFactor=0.95)))
    nodes = []
    for name in names:
        par = J[name]['parent']; local = J[name]['p'] - (J[par]['p'] if par else 0)
        nodes.append(dict(name=name, translation=[float(x) for x in local], children=[]))
    ix = {k: i for i, k in enumerate(names)}
    for name in names:
        if J[name]['parent']: nodes[ix[J[name]['parent']]]['children'].append(ix[name])
    for nd in nodes:
        if not nd['children']: del nd['children']
    nodes.append(dict(name='body', mesh=0, skin=0, extras=dict(rig=dict(armDown=arm_down, height=float(height)))))
    gltf = dict(asset=dict(version='2.0', generator='process_people.py', copyright=credit), scene=0, scenes=[dict(nodes=[0, len(nodes) - 1])], nodes=nodes,
                skins=[dict(joints=list(range(len(names))), inverseBindMatrices=a_ibm, skeleton=0)], meshes=[dict(name='body', primitives=prims)], materials=mats,
                accessors=accs, bufferViews=views)
    if textures: gltf['textures'] = textures; gltf['images'] = images; gltf['samplers'] = [dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)]
    binb = b''.join(chunks); gltf['buffers'] = [dict(byteLength=len(binb))]
    jb = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(binb), 0x004E4942) + binb
    open(path, 'wb').write(out)
    return len(out)


def _img(data, size, q, alpha=False):
    im = Image.open(io.BytesIO(data))
    im = im.convert('RGBA' if alpha else 'RGB')
    w, h = im.size
    if max(w, h) > size: k = size / max(w, h); im = im.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
    o = io.BytesIO()
    if alpha: im.save(o, 'PNG', optimize=True); return o.getvalue(), 'image/png'
    im.save(o, 'JPEG', quality=q, optimize=True); return o.getvalue(), 'image/jpeg'


def blend_ok(m):
    return False


def process_multi(src, out_dir, cid):
    """characters made of several meshes / materials (clothes, hair, eyes ...): skinned or static, bind pose is baked and re-rigged"""
    j, binb, mats, prims = GS.read_prims(src, skip_skinned=False, raw_skinned=True)
    if not prims: raise RuntimeError('no triangles found')
    allpos = np.concatenate([q['pos'] for q in prims]).astype(np.float64); allnor = np.concatenate([q['nor'] for q in prims]).astype(np.float64)
    pos, nor, H = normalise(allpos, allnor)
    off = np.cumsum([0] + [len(q['pos']) for q in prims])
    print('  %s: %d parts, %d verts %d tris, height %.2f m' % (cid, len(prims), len(pos), sum(len(q['idx']) for q in prims), H))
    s = H / 1.8
    J, tips, arm_down = skeleton(pos, H)
    credit = 'Character: %s (processed). Check the licence of your source files.' % cid
    for variant, cell, tsize in (('', 0.0080, 1024), ('_lod', 0.0210, 384)):
        parts = []
        for k, q in enumerate(prims):
            P0, N0, UV0, T0 = pos[off[k]:off[k + 1]], nor[off[k]:off[k + 1]], q['uv'].astype(np.float64), q['idx']
            if len(T0) < 40: continue
            m = mats[q['mat']] if q['mat'] < len(mats) else dict(name='', alpha='OPAQUE', cutoff=0.5, color=[0.8, 0.8, 0.8, 1], tex=None, normal=None)
            blend = m['alpha'] != 'OPAQUE'
            if variant and m['alpha'] == 'BLEND' and len(T0) < 400: continue          # drop tiny see-through bits (lashes) from the crowd model
            nm = (m.get('name') or '').lower()
            if variant and re.search(r'teeth|tongue|cornea|nail|lash|brow|eyeball|gum', nm): continue       # crowd model: no tiny anatomy
            if len(T0) > 600:
                c = cell
                for _ in range(5):
                    P, N, UV, T = cluster(P0, N0, UV0, T0, c * s, 1.52 * s)
                    if not variant or len(T) <= (11000 if re.search(r'skin|body', nm) else 5500): break
                    c *= 1.6                                   # crowd model: keep every part within a triangle budget
                if variant and len(T) > (11000 if re.search(r'skin|body', nm) else 5500) and not blend_ok(m):
                    P, N, UV, T = P[:0], N[:0], UV[:0], T[:0]       # too heavy: only the coarse coloured shell is kept
            else: P, N, UV, T = P0, N0, UV0, T0
            names, top, Wt = weights(P, J, tips, H) if len(P) else (list(J.keys()), np.zeros((0, 4), int), np.zeros((0, 4)))
            imgs = {}
            if m['tex'] is not None:
                d = GS.image_bytes(j, binb, m['tex'])
                if d: imgs['base'] = _img(d, tsize, 84 if not variant else 76, alpha=blend)
            if m.get('normal') is not None and not variant:
                d = GS.image_bytes(j, binb, m['normal'])
                if d: imgs['normal'] = _img(d, 512, 86)
            shell = None
            if not imgs.get('base') and len(T) == 0 and len(T0) > 600:
                # untextured part over the crowd budget: coarse shell coloured with the material colour
                vc = np.tile(np.array(m['color'][:3], np.float32), (len(P0), 1))
                sP, sN, sC, sT = cluster(P0, N0, UV0, T0, 0.045 * s, 1.52 * s, seams=False, extra=vc)
                sP = sP + sN * 0.008 * s                                      # shell-only part (clothes): sit just outside the skin
                sn, stop, sWt = weights(sP, J, tips, H)
                shell = (sP, sN, np.clip(sC, 0, 1), sT, stop, sWt)
            elif imgs.get('base') and (not blend or len(T) == 0) and len(T0) > 600:
                ba = np.asarray(Image.open(io.BytesIO(GS.image_bytes(j, binb, m['tex']))).convert('RGB').resize((512, 512), Image.BILINEAR), dtype=np.float32) / 255.0
                u = q['uv']; vc = ba[np.clip((u[:, 1] % 1.0) * 512, 0, 511).astype(int), np.clip((u[:, 0] % 1.0) * 512, 0, 511).astype(int)]
                sP, sN, sC, sT = cluster(P0, N0, UV0, T0, (0.030 if not variant else 0.045) * s, 1.52 * s, seams=False, extra=vc)
                if len(T): sP = sP - sN * (0.010 if not variant else 0.016) * s       # (shell-only parts keep their surface)
                sn, stop, sWt = weights(sP, J, tips, H)
                shell = (sP, sN, np.clip(sC, 0, 1) ** 2.2, sT, stop, sWt)
            parts.append(dict(P=P, N=N, UV=UV, T=T, top=top, Wt=Wt, imgs=imgs, color=[float(x) for x in m['color']], alpha=m['alpha'], cutoff=m['cutoff'], name=m.get('name', ''), shell=shell))
        size = write_multi(os.path.join(out_dir, cid + variant + '.glb'), parts, names, J, arm_down, credit, pos[:, 1].max())
        print('    %s%s: %d tris -> %.2f MB' % (cid, variant, sum(len(p['T']) for p in parts), size / 1e6))


def manifest(out_dir):
    items = []
    for f in sorted(os.listdir(out_dir)):
        if f.endswith('.glb') and not f.endswith('_lod.glb'):
            cid = f[:-4]
            if os.path.exists(os.path.join(out_dir, cid + '_lod.glb')):
                items.append(dict(id=cid, name=re.sub(r'[_\-]+', ' ', cid).strip().title(), hero=cid + '.glb', lod=cid + '_lod.glb'))
    json.dump(dict(people=items), open(os.path.join(out_dir, 'people.json'), 'w'), indent=1)
    print('people.json:', [i['id'] for i in items])


if __name__ == '__main__':
    in_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    if os.path.isdir(in_dir):
        for f in sorted(os.listdir(in_dir)):
            if not f.lower().endswith('.glb'):
                if not f.startswith('.') and f.lower() != 'readme.md': print('  skipping %s (only .glb files are supported)' % f)
                continue
            cid = re.sub(r'[^a-z0-9]+', '_', f[:-4].lower()).strip('_')
            try:
                process(os.path.join(in_dir, f), out_dir, cid)
            except Exception as e:
                print('  WARNING: skipped %s: %s' % (f, e)); traceback.print_exc()
    manifest(out_dir)
