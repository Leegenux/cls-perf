"""Stdlib-only icon generator: rounded dark tile + green bolt. No PIL needed."""
import struct, zlib, os

S = 512          # master
SS = S // 128    # downsample factor

def chunk(tag, data):
    body = tag + data
    return (struct.pack(">I", len(data)) + body
            + struct.pack(">I", zlib.crc32(body) & 0xffffffff))

def png(path, w, h, rgba):
    raw = b"".join(b"\x00" + bytes(rgba[y*w*4:(y+1)*w*4]) for y in range(h))
    data = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))
    open(path, "wb").write(data)

# ---- master canvas
px = bytearray(S * S * 4)

R = 0.22                                     # corner radius, fraction of size
BOLT = [(0.565, 0.10), (0.325, 0.575), (0.475, 0.575), (0.415, 0.90),
        (0.675, 0.425), (0.505, 0.425)]

def in_round_rect(x, y):
    f = 0.004                                   # hairline inset so edge stays crisp
    if not (f < x < 1 - f and f < y < 1 - f):
        return False
    cx = min(max(x, R), 1 - R)
    cy = min(max(y, R), 1 - R)
    return (x - cx) ** 2 + (y - cy) ** 2 <= R * R

def in_poly(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

for y in range(S):
    fy = (y + 0.5) / S
    for x in range(S):
        fx = (x + 0.5) / S
        o = (y * S + x) * 4
        if not in_round_rect(fx, fy):
            continue                                        # transparent
        # vertical gradient #0E1F33 -> #16324D
        t = fy
        r = int(14 + t * 8); g = int(31 + t * 19); b = int(51 + t * 26)
        if in_poly(fx, fy, BOLT):
            r, g, b = 0x2B, 0xE8, 0xA0                        # green bolt
            if fy > 0.62:                                     # subtle depth on lower half
                r, g, b = 0x22, 0xC9, 0x8B
        px[o:o+4] = bytes((r, g, b, 255))

def downsample(target):
    k = S // target
    out = bytearray(target * target * 4)
    n = k * k
    for y in range(target):
        for x in range(target):
            ar = ag = ab = aa = 0
            for dy in range(k):
                base = ((y * k + dy) * S + x * k) * 4
                for dx in range(k):
                    o = base + dx * 4
                    a = px[o+3]
                    ar += px[o] * a; ag += px[o+1] * a; ab += px[o+2] * a; aa += a
            o = (y * target + x) * 4
            if aa:
                out[o] = ar // aa; out[o+1] = ag // aa; out[o+2] = ab // aa
            out[o+3] = aa // n
    return out

out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
os.makedirs(out_dir, exist_ok=True)
for size in (16, 48, 128):
    png(os.path.join(out_dir, f"icon{size}.png"), size, size, downsample(size))
    print(f"icon{size}.png", os.path.getsize(os.path.join(out_dir, f"icon{size}.png")), "bytes")

# self-check: bolt pixels present, corner transparent, tile edge opaque
bolt = sum(1 for i in range(0, S*S*4, 4) if px[i] == 0x2B and px[i+1] == 0xE8)
assert bolt > 2000, f"bolt not drawn ({bolt})"
assert px[3] == 0, "corner not transparent"
assert px[(255*512 + 8)*4 + 3] == 255, "tile edge missing"
print("self-check ok, bolt px:", bolt)
