"""真保存幀的柔軟回折與肘內壓褶作者工序；不寫產品、保留原拓撲。"""
import bpy, json, hashlib, math
from mathutils import Vector


def sculpt_soft_cuff_elbow(packet_path, collection_name, pins_path, return_shortening=.016, collapse=.006, crease_depth=.005):
    if not (0 <= return_shortening <= .018 and 0 <= collapse <= .008 and 0 <= crease_depth <= .006):
        raise ValueError('作者工序超出明確局部形體範圍')
    raw = open(packet_path, 'rb').read()
    packet = json.loads(raw)
    sha = hashlib.sha256(raw).hexdigest()
    pins = json.load(open(pins_path, encoding='utf8'))
    if pins['version'] != 'cs-sleeve-author-pins.v1' or pins['packetSha256'] != sha:
        raise ValueError('裁片固定點與真保存幀來源不符')
    pinned = set(pins['pinnedVertices'])
    if packet['status'] != 'TRUE_BROWSER_SAVED_FRAME_AUTHOR_PACKET_NOT_ART_PASS':
        raise ValueError('需要最新真Browser保存幀，不採fixture')
    collection = bpy.data.collections[collection_name]
    if collection['packet_sha256'] != sha:
        raise ValueError('來源不符')
    index = next(i for i, r in enumerate(packet['meshes']) if r['name'] == 'ESMO_Major_ContinuousClothing')
    source = packet['meshes'][index]
    cuff = source['cuff']
    if cuff['profileRows'] != 10 or cuff['ringPoints'] != 14 or abs(cuff['thickness']-.006) > 1e-8:
        raise ValueError('未驗證的袖口profile')
    obj = next(o for o in collection.objects if o.type == 'MESH' and o['packet_mesh_index'] == index)
    convert = lambda p: Vector((p[0], -p[2], p[1]))
    original = [convert(p) for p in source['positions']]
    if len(obj.data.vertices) != len(original) or [i for p in obj.data.polygons for i in p.vertices] != source['indices']:
        raise ValueError('拓撲已變')
    if max((v.co-p).length for v, p in zip(obj.data.vertices, original)) > 1e-6:
        raise ValueError('已有未記錄修改，不能疊加重複雕塑')
    ring, segments = cuff['ringPoints'], cuff['radialSegments']
    start = len(original)-cuff['addedVertices']
    protected = set(range(cuff['ventSegment'], cuff['ventSegment']+cuff['ventSegmentCount']+1))
    deltas, cuff_metrics = {}, []
    # 各profile共享真三維位移，保持outer/inner之間原6mm向量。
    # 兩個縫合根層0/9與開衩端保持；回折長度周向不齊整，並非縮放整臂。
    for arm in range(2):
        base = start+arm*cuff['verticesPerArm']
        center = lambda r: sum((original[base+r*ring+j] for j in range(segments)), Vector())/segments
        root, edge = center(0), center(cuff['outerRow'])
        toward_root = (root-edge).normalized()
        old_lengths, new_lengths = [], []
        for j in range(segments):
            if j in protected:
                continue
            # 通風裁口附近自然淡出；wrap point 0/13視為同一位置。
            distance = min(min(abs(j-k), segments-abs(j-k)) for k in protected)
            taper = min(1., distance/3.)
            angle = j/segments*math.tau
            radial = original[base+cuff['outerRow']*ring+j]-edge
            radial -= toward_root*radial.dot(toward_root)
            radial.normalize()
            shorten = return_shortening*taper*(.76+.24*math.sin(angle+.6))
            pinch = collapse*taper*(.6+.4*math.sin(angle*2+.8))
            delta = toward_root*shorten-radial*pinch
            if delta.length > .022:
                raise ValueError('袖口單次位移超22mm')
            for r in range(1, 9):
                deltas[base+r*ring+j] = delta
                if j == 0:
                    deltas[base+r*ring+segments] = delta
            old_lengths.append((original[base+cuff['outerRow']*ring+j]-original[base+j]).length)
            new_lengths.append((original[base+cuff['outerRow']*ring+j]+delta-original[base+j]).length)
        cuff_metrics.append({'arm': arm, 'returnSpanBeforeMetres': [min(old_lengths), max(old_lengths)],
                             'returnSpanAfterMetres': [min(new_lengths), max(new_lengths)]})
    bones = {b['name']: convert(b['position']) for b in packet['bones']}
    names = source['boneNames']
    # 真衣料material0，只選真臂骨權重。手、裝備、胸、原袖口根附近不雕。
    garment = set()
    for group in source['groups']:
        if group['materialIndex'] == 0:
            garment.update(source['indices'][group['start']:group['start']+group['count']])
    elbow_counts = {}
    for side in ('l', 'r'):
        shoulder, elbow, wrist = (bones[k+'_'+side] for k in ('upperarm', 'lowerarm', 'hand'))
        inward = ((shoulder-elbow).normalized()+(wrist-elbow).normalized()).normalized()
        count = 0
        for i in garment:
            if i >= start or i in pinned:
                continue
            weight = sum(source['skinWeight'][i*4+j] for j in range(4)
                         if names[source['skinIndex'][i*4+j]] in ('upperarm_'+side, 'lowerarm_'+side))
            if weight < .65 or (original[i]-elbow).length > .145:
                continue
            best = None
            for endpoint in (shoulder, wrist):
                axis = (endpoint-elbow).normalized()
                along = (original[i]-elbow).dot(axis)
                if along < .008 or along > .12:
                    continue
                radial = original[i]-elbow-axis*along
                if radial.length < .02:
                    continue
                if best is None or radial.length < best[0]:
                    best = (radial.length, radial.normalized(), along)
            if best is None:
                continue
            _, radial, along = best
            facing = max(0., min(1., (radial.dot(inward)-.15)/.55))
            if facing == 0:
                continue
            envelope = math.sin(math.pi*(along-.008)/.112)**2
            # 三條窄谷與兩側弱脊，實際vertex形體；不以shader畫假折線。
            wave = sum(-math.exp(-((along-c)/.008)**2)
                       +.3*math.exp(-((along-c-.011)/.008)**2) for c in (.032, .064, .096))
            delta = radial*(crease_depth*facing*envelope*wave)
            if delta.length > 1e-6:
                deltas[i] = delta
                count += 1
        elbow_counts[side] = count
    if not all(elbow_counts.values()):
        raise ValueError('缺雙肘真壓褶頂點，拒絕空工序')
    for i, delta in deltas.items():
        obj.data.vertices[i].co = original[i]+delta
    obj.data.update()
    return {'status': 'AUTHOR_SOFT_CUFF_ELBOW_CANDIDATE_NOT_INTEGRATED_NOT_ART_PASS', 'packetSha256': sha,
            'changedVertices': len(deltas), 'maximumPosedDeltaMetres': max(d.length for d in deltas.values()),
            'elbowChangedVertices': elbow_counts, 'cuff': cuff_metrics,
            'patternPinnedVertices': len(pinned),
            'parameters': {'returnShorteningMetres': return_shortening, 'collapseMetres': collapse, 'creaseDepthMetres': crease_depth},
            'caveat': '真保存幀雕塑，仍須inverse skin、累計bind≤40mm、根／開衩／接縫／厚度、UV／法線／AO及六動作檢查；不代表產品或藝術通過。'}
