"""Minimal glTF/GLB scene reader/writer for static props: bakes node transforms, converts
KHR_materials_pbrSpecularGlossiness to plain PBR, groups primitives by material, keeps images as JPEG/PNG bytes."""
import json, struct, io
import numpy as np
from PIL import Image


def load(path):
    b = open(path, 'rb').read()
    L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + L])
    off = 20 + L
    binb = b[off + 8: off + 8 + struct.unpack('<I', b[off:off + 4])[0]] if off < len(b) else b''
    return j, binb


def accessor(j, binb, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']] if 'bufferView' in a else None
    ct = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    isz = np.dtype(ct).itemsize
    if bv is None:
        return np.zeros((a['count'], n), ct)
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or n * isz
    if stride != n * isz:
        raw = np.frombuffer(binb, dtype=np.uint8, count=stride * (a['count'] - 1) + n * isz, offset=start)
        out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], n * isz), strides=(stride, 1)).copy()
        arr = np.frombuffer(out.tobytes(), dtype=ct).reshape(a['count'], n)
    else:
        arr = np.frombuffer(binb, dtype=ct, count=a['count'] * n, offset=start).reshape(a['count'], n)
    if a.get('normalized'):
        arr = arr.astype(np.float32) / np.iinfo(ct).max
    return arr


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], float).reshape(4, 4).T
    T = np.eye(4); T[:3, 3] = n.get('translation', [0, 0, 0])
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    R = np.eye(4)
    R[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                 [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                 [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    S = np.diag(list(n.get('scale', [1, 1, 1])) + [1])
    return T @ R @ S


def image_bytes(j, binb, i):
    im = j['images'][i]
    if 'bufferView' in im:
        bv = j['bufferViews'][im['bufferView']]
        return bytes(binb[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']])
    return None


def read_prims(path, skip_skinned=False, raw_skinned=False):
    """-> list of dict(pos, nor, uv, idx, mat) in world space (scene roots), plus parsed materials"""
    j, binb = load(path)
    mats = []
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        sg = (m.get('extensions') or {}).get('KHR_materials_pbrSpecularGlossiness')
        d = dict(name=m.get('name', ''), alpha=m.get('alphaMode', 'OPAQUE'), cutoff=m.get('alphaCutoff', 0.5), double=m.get('doubleSided', False),
                 color=[1, 1, 1, 1], tex=None, normal=None, metal=0.0, rough=0.8, emissive=m.get('emissiveFactor', [0, 0, 0]), emissiveTex=None)
        if sg:
            d['color'] = sg.get('diffuseFactor', [1, 1, 1, 1]); t = sg.get('diffuseTexture')
            d['rough'] = 1 - min(1, sg.get('glossinessFactor', 0.5) * 0.9)
        else:
            d['color'] = pbr.get('baseColorFactor', [1, 1, 1, 1]); t = pbr.get('baseColorTexture')
            d['metal'] = pbr.get('metallicFactor', 0.0); d['rough'] = pbr.get('roughnessFactor', 0.8)
        if t is not None:
            d['tex'] = j['textures'][t['index']]['source']
        nt = m.get('normalTexture')
        if nt is not None: d['normal'] = j['textures'][nt['index']]['source']
        et = m.get('emissiveTexture')
        if et is not None: d['emissiveTex'] = j['textures'][et['index']]['source']
        mats.append(d)
    out = []

    def walk(ni, M):
        n = j['nodes'][ni]
        W = M @ node_matrix(n)
        if raw_skinned and 'skin' in n: W = np.eye(4)
        if 'mesh' in n and not (skip_skinned and 'skin' in n):
            for p in j['meshes'][n['mesh']]['primitives']:
                if p.get('mode', 4) != 4: continue
                at = p['attributes']
                pos = accessor(j, binb, at['POSITION']).astype(np.float64)
                nor = accessor(j, binb, at['NORMAL']).astype(np.float64) if 'NORMAL' in at else np.tile([0, 1, 0], (len(pos), 1)).astype(np.float64)
                uv = accessor(j, binb, at['TEXCOORD_0']).astype(np.float32) if 'TEXCOORD_0' in at else np.zeros((len(pos), 2), np.float32)
                idx = accessor(j, binb, p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(pos)).reshape(-1, 3)
                pos = (np.c_[pos, np.ones(len(pos))] @ W.T)[:, :3]
                nm = np.linalg.inv(W[:3, :3]).T
                nor = nor @ nm.T
                nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
                if np.linalg.det(W[:3, :3]) < 0: idx = idx[:, ::-1]
                out.append(dict(pos=pos.astype(np.float32), nor=nor.astype(np.float32), uv=uv, idx=idx, mat=p.get('material', 0), node=n.get('name', '')))
        for c in n.get('children', []): walk(c, W)
    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    return j, binb, mats, out


def pad4(b, c=b'\x00'):
    return b + c * ((4 - len(b) % 4) % 4)


def to_jpeg(data, max_size=1024, quality=84, keep_alpha=False):
    im = Image.open(io.BytesIO(data))
    if keep_alpha and ('A' in im.getbands() or im.mode == 'P'):
        im = im.convert('RGBA')
    else:
        im = im.convert('RGB')
    w, h = im.size
    if max(w, h) > max_size:
        k = max_size / max(w, h); im = im.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
    o = io.BytesIO()
    if im.mode == 'RGBA':
        im.save(o, 'PNG', optimize=True); return o.getvalue(), 'image/png'
    im.save(o, 'JPEG', quality=quality, optimize=True); return o.getvalue(), 'image/jpeg'


def write(path, prims, mats, j, binb, max_tex=1024, extras=None, copyright=''):
    """prims: list of dict(pos,nor,uv,idx,mat). Writes one mesh node with one primitive per input prim."""
    chunks = []; views = []; accs = []; images = []; textures = []; imgmap = {}

    def add_view(data, target=None):
        data = pad4(data); off = sum(len(c) for c in chunks); chunks.append(data)
        v = dict(buffer=0, byteOffset=off, byteLength=len(data))
        if target: v['target'] = target
        views.append(v); return len(views) - 1

    def add_acc(view, ct, count, typ, mn=None, mx=None):
        a = dict(bufferView=view, componentType=ct, count=count, type=typ)
        if mn is not None: a['min'] = mn; a['max'] = mx
        accs.append(a); return len(accs) - 1

    def tex_index(src, alpha=False):
        key = (src, alpha)
        if key in imgmap: return imgmap[key]
        data = image_bytes(j, binb, src)
        if data is None: return None
        b, mime = to_jpeg(data, max_tex, 84, keep_alpha=alpha)
        images.append(dict(bufferView=add_view(b), mimeType=mime)); textures.append(dict(source=len(images) - 1, sampler=0))
        imgmap[key] = len(textures) - 1
        return imgmap[key]
    used = sorted({p['mat'] for p in prims})
    outmats = []; matmap = {}
    for mi in used:
        m = mats[mi] if mi < len(mats) else dict(name='default', alpha='OPAQUE', cutoff=0.5, double=False, color=[0.8, 0.8, 0.8, 1], tex=None, normal=None, metal=0, rough=0.8, emissive=[0, 0, 0], emissiveTex=None)
        om = dict(name=m['name'] or 'mat%d' % mi, doubleSided=bool(m['double']), pbrMetallicRoughness=dict(baseColorFactor=m['color'], metallicFactor=float(m['metal']), roughnessFactor=float(m['rough'])))
        if m['tex'] is not None:
            ti = tex_index(m['tex'], alpha=m['alpha'] != 'OPAQUE')
            if ti is not None: om['pbrMetallicRoughness']['baseColorTexture'] = dict(index=ti)
        if m['normal'] is not None and max_tex >= 512:
            ti = tex_index(m['normal'])
            if ti is not None: om['normalTexture'] = dict(index=ti)
        if m['alpha'] == 'MASK': om['alphaMode'] = 'MASK'; om['alphaCutoff'] = m['cutoff']
        elif m['alpha'] == 'BLEND': om['alphaMode'] = 'BLEND'
        if any(m['emissive']): om['emissiveFactor'] = m['emissive']
        matmap[mi] = len(outmats); outmats.append(om)
    meshprims = []
    for p in prims:
        P, N, U, T = p['pos'].astype(np.float32), p['nor'].astype(np.float32), p['uv'].astype(np.float32), p['idx']
        at = dict(POSITION=add_acc(add_view(P.tobytes(), 34962), 5126, len(P), 'VEC3', P.min(0).tolist(), P.max(0).tolist()),
                  NORMAL=add_acc(add_view(N.tobytes(), 34962), 5126, len(N), 'VEC3'),
                  TEXCOORD_0=add_acc(add_view(U.tobytes(), 34962), 5126, len(U), 'VEC2'))
        if len(P) < 65535: ia = add_acc(add_view(T.astype(np.uint16).tobytes(), 34963), 5123, T.size, 'SCALAR')
        else: ia = add_acc(add_view(T.astype(np.uint32).tobytes(), 34963), 5125, T.size, 'SCALAR')
        meshprims.append(dict(attributes=at, indices=ia, material=matmap[p['mat']]))
    gltf = dict(asset=dict(version='2.0', generator='gltfscene.py', copyright=copyright), scene=0, scenes=[dict(nodes=[0])],
                nodes=[dict(name='prop', mesh=0, extras=extras or {})], meshes=[dict(name='prop', primitives=meshprims)], materials=outmats,
                accessors=accs, bufferViews=views)
    if textures:
        gltf['textures'] = textures; gltf['images'] = images; gltf['samplers'] = [dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)]
    binout = b''.join(chunks); gltf['buffers'] = [dict(byteLength=len(binout))]
    jb = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    data = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(binout)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(binout), 0x004E4942) + binout
    open(path, 'wb').write(data)
    return len(data)
