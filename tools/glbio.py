import json, struct, numpy as np
def read_glb(path):
    b = open(path, 'rb').read()
    L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20+L])
    off = 20 + L + 8
    binb = b[off:]
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        ct = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride')
        if stride and stride != n * np.dtype(ct).itemsize:
            raw = np.frombuffer(binb, dtype=np.uint8, count=stride * a['count'], offset=start).reshape(a['count'], stride)
            return np.frombuffer(raw[:, :n * np.dtype(ct).itemsize].tobytes(), dtype=ct).reshape(a['count'], n)
        return np.frombuffer(binb, dtype=ct, count=a['count'] * n, offset=start).reshape(a['count'], n)
    p = j['meshes'][0]['primitives'][0]
    pos = acc(p['attributes']['POSITION']).copy(); nor = acc(p['attributes']['NORMAL']).copy(); uv = acc(p['attributes']['TEXCOORD_0']).copy()
    idx = acc(p['indices']).reshape(-1, 3).copy()
    imgs = []
    for im in j['images']:
        bv = j['bufferViews'][im['bufferView']]
        imgs.append(bytes(binb[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']]))
    return j, pos, nor, uv, idx, imgs
