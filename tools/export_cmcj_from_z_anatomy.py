# Builds cmcj/models/cmcj.glb from the Z-Anatomy FBX models (CC BY-SA 4.0).
# Usage: python export_cmcj_from_z_anatomy.py -- <Z-Anatomy "1.0 Models" dir> <out.glb>
# Requires Blender as a Python module (pip install bpy).
import bpy, sys, bmesh, re, json, numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
M, OUT = sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
for f in ['SkeletalSystem100','Joints100','MuscularSystem100','CardioVascular41','NervousSystem100']:
    bpy.ops.import_scene.fbx(filepath=f'{M}/{f}.fbx')

HAND_BONES = ['Trapezium bone','First metacarpal bone','Scaphoid bone','Trapezoid bone','Capitate bone','Hamate bone',
 'Lunate bone','Triquetrum bone','Pisiform bone','Second metacarpal bone','Third metacarpal bone','Fourth metacarpal bone',
 'Fifth metacarpal bone']+[f'{p} phalanx of {d} finger of hand' for p in ['Proximal','Middle','Distal'] for d in ['first','second','third','fourth','fifth'] if not (p=='Middle' and d=='first')]
FOREARM = ['Radius','Ulna']
LIG = ['Dorsal carpometacarpal ligaments','Palmar carpometacarpal ligaments','Scaphotrapeziotrapezoidal ligament',
 'Radial collateral ligament of wrist joint','Trapeziotrapezoidal interosseous ligament']
MUS = ['Abductor pollicis longus','Extensor pollicis brevis','Extensor pollicis longus','Flexor carpi radialis','Flexor pollicis longus',
 'Abductor pollicis brevis','Opponens pollicis muscle','Superficial head of flexor pollicis brevis','Deep head of flexor pollicis brevis',
 'Oblique head of adductor pollicis','Transverse head of adductor pollicis','Flexor retinaculum of wrist','Extensor retinaculum of wrist',
 'Tendon sheath - abd. pollicis longus - ext. pollicis brevis','Tendon sheath of flexor carpi radialis','Tendon sheath of extensor pollicis longus']
NV = ['Radial artery','Palmar carpal branch of radial artery','Dorsal carpal anastomosis','Superficial branch of radial nerve',
'Dorsal digital branches of radial nerve']

def world(o):
    return np.array([tuple(o.matrix_world@v.co) for v in o.data.vertices])*1000
T=world(bpy.data.objects['Trapezium bone.r']); F=world(bpy.data.objects['First metacarpal bone.r'])
kd=KDTree(len(F))
for i,p in enumerate(F): kd.insert(p,i)
kd.balance()
pairs=[(p,kd.find(p)[0]) for p in T]; pairs=[(np.array(a),np.array(b)) for a,b in pairs if (Vector(a)-b).length<3]
C=np.mean([(a+b)/2 for a,b in pairs],axis=0)
print('joint centre (mm, blender world)',C)

keep=[]
def prep(name, group, clip=None, subdiv=0, bisectZ=None):
    o=bpy.data.objects.get(name+'.r')
    if o is None: print('MISSING',name); return
    me=o.data.copy(); o.data=me
    me.transform(Matrix.Translation(Vector(-C/1000))@o.matrix_world)  # still meters
    me.transform(Matrix.Scale(1000,4))
    o.parent=None; o.matrix_world=Matrix.Identity(4)
    bm=bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-4)
    if bisectZ is not None:
        geom=bm.verts[:]+bm.edges[:]+bm.faces[:]
        r=bmesh.ops.bisect_plane(bm,geom=geom,plane_co=(0,0,bisectZ),plane_no=(0,0,1),clear_outer=True)
        edges=[e for e in r['geom_cut'] if isinstance(e,bmesh.types.BMEdge)]
        bmesh.ops.holes_fill(bm,edges=edges)
    if clip:
        bad=[f for f in bm.faces if any(v.co.length>clip for v in f.verts)]
        bmesh.ops.delete(bm,geom=bad,context='FACES')
        loose=[v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(me); bm.free()
    if len(me.polygons)==0: print('EMPTY',name); return
    for p in me.polygons: p.use_smooth=True
    if subdiv:
        m=o.modifiers.new('sub','SUBSURF'); m.levels=subdiv; m.render_levels=subdiv
    o.name=name; o['group']=group; o['zname']=name
    keep.append(o)

for b in HAND_BONES: prep(b,'bone',subdiv=2 if b in ('Trapezium bone','First metacarpal bone') else 1)
# wrist joint line approx at scaphoid top; cut radius/ulna 45mm proximal to joint centre
for b in FOREARM: prep(b,'bone',subdiv=1,bisectZ=48)
for n in LIG: prep(n,'ligament',subdiv=1)
for n in MUS: prep(n,'muscle',clip=55,subdiv=1)
for n in NV: prep(n,'nv',clip=50,subdiv=1)

for o in list(bpy.data.objects):
    if o not in keep: bpy.data.objects.remove(o)
for c in list(bpy.data.collections):
    pass
for o in keep:
    o.data.materials.clear()
# bake modifiers so we can compute per-vertex attributes on the final geometry
dg=bpy.context.evaluated_depsgraph_get()
for o in keep:
    ev=o.evaluated_get(dg); me=bpy.data.meshes.new_from_object(ev); o.modifiers.clear(); o.data=me
from mathutils.bvhtree import BVHTree
def bvh(o):
    bm=bmesh.new(); bm.from_mesh(o.data); t=BVHTree.FromBMesh(bm); bm.free(); return t
ob={o.name:o for o in keep}
def joint_attr(a,b,attrname='_jd'):
    t=bvh(ob[b]); me=ob[a].data
    attr=me.attributes.new(attrname,'FLOAT','POINT')
    ds=[]
    for v in me.vertices:
        hit=t.find_nearest(v.co, 50.0)
        d=hit[3] if hit[0] is not None else 50.0
        attr.data[v.index].value=d; ds.append(d)
    ds=np.array(ds); print(a,b,'min',ds.min(),'n<2',(ds<2).sum(),'n<4',(ds<4).sum(),'of',len(ds))
joint_attr('Trapezium bone','First metacarpal bone')
joint_attr('First metacarpal bone','Trapezium bone')
joint_attr('Trapezium bone','Scaphoid bone','_js')
joint_attr('Scaphoid bone','Trapezium bone')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
    export_materials='NONE', export_extras=True, export_attributes=True, export_yup=True, export_normals=True)
tot=0
for o in keep:
    n=len(o.data.vertices); tot+=n
    print(o.name, n)
print('total verts',tot)
