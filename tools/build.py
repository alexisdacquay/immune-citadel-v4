# Assemble index.html: v4 presentation (src/template.html) + game engine sections from v3.
import re, sys
v3 = open('../immune-citadel-v3/index.html').read()
script = v3[v3.index("// ============================================================ utils"):]
def section(a, b): return script[script.index("// ============================================================ " + a):script.index("// ============================================================ " + b)]
A = section("utils", "art")
B = section("waves", "rendering")
recolor = [("'#8cc04f', virus: '#d0485a', staph: '#e2b13a', candida: '#a578d6', spore: '#a578d6', flu: '#5aaed0', worm: '#c99a70', boss: '#d0802f' }[e.type]", "'#a6ff4d', virus: '#ff4d5e', staph: '#ffb02e', candida: '#ff4fd8', spore: '#ff7fe3', flu: '#ff8a3d', worm: '#ffae7a', boss: '#ff6a3d' }[e.type]"),
  ("'#8dbf7f' : '#b48ad0'", "'#3fe0d0' : '#b49cff'"), ("'#f3e3d1', 12", "'#7fd8ff', 12"), ("'#d9bfa6', 14", "'#7fd8ff', 14"),
  ("c: '#5f95cf'", "c: '#ffd166'"), ("'#c48f22'", "'#ffc24a'"), ("'#c4503c'", "'#ff6b78'"), ("'#5d8f2b'", "'#a6ff4d'"), ("'#b48ad0', 6", "'#b49cff', 6")]
for a, b in recolor:
    n = B.count(a); assert n >= 1, a; B = B.replace(a, b)
t = open('src/template.html').read().replace('/*@@ENGINE_A@@*/', A).replace('/*@@ENGINE_B@@*/', B).replace("const _burst = burst;\n", "").replace("// these colors replace the v3 particle colors on kill\n", "")
open('index.html', 'w').write(t)
print('ok', len(t.splitlines()), 'lines')
