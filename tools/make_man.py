#!/usr/bin/env python3
"""Decimate + auto-rig the static 'man' scan into a light skinned GLB (no animation clips: animated in code).
usage: make_man.py in.glb out.glb"""
import sys, io, json, struct
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
sys.path.insert(0, '/home/claude/tools')
from glbio import read_glb

src, dst = sys.argv[1], sys.argv[2]
j, pos, nor, uv, idx, imgs = read_glb(src)
print('in', pos.shape[0], 'verts', idx.shape[0], 'tris')

# ---------------------------------------------------------------- 1. UV-island aware vertex clustering
n = pos.shape[0]
ed = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]]])
g = coo_matrix((np.ones(len(ed)), (ed[:, 0], ed[:, 1])), shape=(n, n))
ncomp, island = connected_components(g, directed=False)
print('uv islands', ncomp)
CELL_BODY = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0105
CELL_HEAD = CELL_BODY * 0.55
cell = np.where(pos[:, 1] > 1.52, CELL_HEAD, CELL_BODY)
ip = np.floor(pos / cell[:, None]).astype(np.int64)
keys = np.column_stack([ip, island.astype(np.int64)])
_, inv = np.unique(keys, axis=0, return_inverse=True)
inv = inv.reshape(-1)
m = inv.max() + 1
cnt = np.bincount(inv, minlength=m).astype(np.float64)
def avg(a):
    out = np.zeros((m, a.shape[1]))
    for k in range(a.shape[1]): out[:, k] = np.bincount(inv, weights=a[:, k], minlength=m)
    return out / cnt[:, None]
P = avg(pos); N = avg(nor); UV = avg(uv)
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
T = inv[idx]
ok = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
T = T[ok]
srt = np.sort(T, axis=1)
_, first = np.unique(srt, axis=0, return_index=True)
T = T[np.sort(first)]
used = np.unique(T)
remap = -np.ones(m, dtype=np.int64); remap[used] = np.arange(len(used))
P, N, UV = P[used], N[used], UV[used]; T = remap[T]
print('out', len(P), 'verts', len(T), 'tris')

# ---------------------------------------------------------------- 2. skeleton + capsule auto weights
# joint rest positions (character faces +Z, left = +X)
J = {}
def add(name, parent, p): J[name] = dict(parent=parent, p=np.array(p, float))
add('Hips', None, (0, 0.95, -0.04)); add('Spine', 'Hips', (0, 1.00, -0.04)); add('Chest', 'Spine', (0, 1.22, -0.04))
add('Neck', 'Chest', (0, 1.46, -0.03)); add('Head', 'Neck', (0, 1.56, -0.02))
for s, sx in (('L', 1), ('R', -1)):
    add('UpperArm' + s, 'Chest', (0.20 * sx, 1.38, -0.04)); add('ForeArm' + s, 'UpperArm' + s, (0.335 * sx, 1.155, -0.04))
    add('Hand' + s, 'ForeArm' + s, (0.47 * sx, 0.93, -0.03))
    add('Thigh' + s, 'Hips', (0.095 * sx, 0.92, -0.04)); add('Shin' + s, 'Thigh' + s, (0.095 * sx, 0.50, -0.04))
    add('Foot' + s, 'Shin' + s, (0.10 * sx, 0.10, -0.03))
names = list(J.keys())
ix = {k: i for i, k in enumerate(names)}

# capsules: bone -> (p0, p1, radius, side-constraint)
def cap(a, b, r, side=0): return (np.array(a, float), np.array(b, float), r, side)
C = {
    'Hips': cap((0, 0.90, -0.04), (0, 1.00, -0.04), 0.19),
    'Spine': cap((0, 1.00, -0.04), (0, 1.22, -0.04), 0.19),
    'Chest': cap((0, 1.22, -0.04), (0, 1.44, -0.04), 0.20),
    'Neck': cap((0, 1.46, -0.03), (0, 1.56, -0.02), 0.06),
    'Head': cap((0, 1.58, -0.02), (0, 1.76, -0.02), 0.14),
}
for s, sx in (('L', 1), ('R', -1)):
    C['UpperArm' + s] = cap((0.20 * sx, 1.38, -0.04), (0.335 * sx, 1.155, -0.04), 0.052, sx)
    C['ForeArm' + s] = cap((0.335 * sx, 1.155, -0.04), (0.47 * sx, 0.93, -0.03), 0.047, sx)
    C['Hand' + s] = cap((0.47 * sx, 0.93, -0.03), (0.58 * sx, 0.79, 0.0), 0.045, sx)
    C['Thigh' + s] = cap((0.095 * sx, 0.92, -0.04), (0.095 * sx, 0.50, -0.04), 0.105, sx)
    C['Shin' + s] = cap((0.095 * sx, 0.50, -0.04), (0.10 * sx, 0.10, -0.03), 0.075, sx)
    C['Foot' + s] = cap((0.10 * sx, 0.10, -0.03), (0.10 * sx, 0.03, 0.13), 0.085, sx)

def seg_dist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)

K = 70.0
S = np.full((len(P), len(names)), -1e9)
for name, (a, b, r, side) in C.items():
    sd = seg_dist(P, a, b) - r
    sc = -K * sd
    if side > 0: sc = np.where(P[:, 0] > (0.03 if name.startswith(('UpperArm', 'ForeArm', 'Hand')) else -0.02), sc, -1e9)
    if side < 0: sc = np.where(P[:, 0] < (-0.03 if name.startswith(('UpperArm', 'ForeArm', 'Hand')) else 0.02), sc, -1e9)
    S[:, ix[name]] = sc
# softmax, keep best 4
S -= S.max(axis=1, keepdims=True)
W = np.exp(S)
top = np.argsort(-W, axis=1)[:, :4]
Wt = np.take_along_axis(W, top, axis=1)
Wt = Wt / Wt.sum(axis=1, keepdims=True)
Wt[Wt < 0.02] = 0; Wt = Wt / Wt.sum(axis=1, keepdims=True)
print('avg influences', (Wt > 0).sum(axis=1).mean())

# ---------------------------------------------------------------- 3. textures (smaller)
def shrink(b, size, q):
    im = Image.open(io.BytesIO(b)).convert('RGB').resize((size, size), Image.LANCZOS)
    o = io.BytesIO(); im.save(o, 'JPEG', quality=q, optimize=True, progressive=False); return o.getvalue()
# image order in the source: 0 = Image_2?, find which texture slot uses which image
mat = j['materials'][0]['pbrMetallicRoughness']; texs = j['textures']
def image_of(tex_index): return texs[tex_index]['source']
base_i = image_of(mat['baseColorTexture']['index']); mr_i = image_of(mat['metallicRoughnessTexture']['index']); nrm_i = image_of(j['materials'][0]['normalTexture']['index'])
tex_bytes = [shrink(imgs[base_i], 2048, 82), shrink(imgs[nrm_i], 1024, 86), shrink(imgs[mr_i], 1024, 82)]
print('textures bytes', [len(t) for t in tex_bytes])

# ---------------------------------------------------------------- 4. write GLB
def pad4(b, c=b'\x00'): return b + c * ((4 - len(b) % 4) % 4)
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

Pf = P.astype(np.float32); Nf = N.astype(np.float32); Uf = UV.astype(np.float32)
a_pos = add_acc(add_view(Pf.tobytes(), 34962), 5126, len(Pf), 'VEC3', Pf.min(0).tolist(), Pf.max(0).tolist())
a_nor = add_acc(add_view(Nf.tobytes(), 34962), 5126, len(Nf), 'VEC3')
a_uv = add_acc(add_view(Uf.tobytes(), 34962), 5126, len(Uf), 'VEC2')
a_jt = add_acc(add_view(top.astype(np.uint8).tobytes(), 34962), 5121, len(top), 'VEC4')
a_wt = add_acc(add_view(Wt.astype(np.float32).tobytes(), 34962), 5126, len(Wt), 'VEC4')
assert len(P) < 65535
a_idx = add_acc(add_view(T.astype(np.uint16).tobytes(), 34963), 5123, T.size, 'SCALAR')
ibm = np.zeros((len(names), 16), np.float32)
for k, name in enumerate(names):
    M = np.eye(4); M[:3, 3] = -J[name]['p']          # inverse of a pure translation
    ibm[k] = M.T.reshape(16)                           # glTF is column-major
a_ibm = add_acc(add_view(ibm.tobytes()), 5126, len(names), 'MAT4')
images = [dict(bufferView=add_view(t), mimeType='image/jpeg') for t in tex_bytes]

nodes = []
for name in names:
    p = J[name]['p']; par = J[name]['parent']
    local = p - (J[par]['p'] if par else 0)
    nodes.append(dict(name=name, translation=[float(x) for x in local], children=[]))
for name in names:
    if J[name]['parent']: nodes[ix[J[name]['parent']]]['children'].append(ix[name])
for nd in nodes:
    if not nd['children']: del nd['children']
nodes.append(dict(name='man', mesh=0, skin=0))
gltf = dict(
    asset=dict(version='2.0', generator='make_man.py', copyright='Source mesh: grab3d.com, CC0-1.0'),
    scene=0, scenes=[dict(nodes=[0, len(nodes) - 1])], nodes=nodes,
    skins=[dict(joints=list(range(len(names))), inverseBindMatrices=a_ibm, skeleton=0)],
    meshes=[dict(name='man', primitives=[dict(attributes=dict(POSITION=a_pos, NORMAL=a_nor, TEXCOORD_0=a_uv, JOINTS_0=a_jt, WEIGHTS_0=a_wt), indices=a_idx, material=0)])],
    materials=[dict(name='man', doubleSided=True, pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicRoughnessTexture=dict(index=2), metallicFactor=1.0, roughnessFactor=1.0), normalTexture=dict(index=1))],
    textures=[dict(source=0, sampler=0), dict(source=1, sampler=0), dict(source=2, sampler=0)],
    samplers=[dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)],
    images=images, accessors=accs, bufferViews=views,
)
binb = b''.join(chunks)
gltf['buffers'] = [dict(byteLength=len(binb))]
jb = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(binb), 0x004E4942) + binb
open(dst, 'wb').write(out)
print('wrote', dst, len(out) / 1e6, 'MB')
json.dump({k: dict(parent=v['parent'], p=v['p'].tolist()) for k, v in J.items()}, open(dst + '.joints.json', 'w'))
