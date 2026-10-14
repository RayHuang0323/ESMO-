from pathlib import Path
p=Path('tools/browser_check_cs_major_temporal_surface.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("'maps','expectMajorNear'", "'maps','expectMajorNear','roiY'")
s=s.replace("const width=Number(args.width||1366);", "const roiY=Number(args.roiY||.65);if(![.35,.65].includes(roiY))throw new HarnessError('Explicit diagnostic ROI must be .35 or .65');evidence.roiNormalizedY=roiY;\n const width=Number(args.width||1366);")
s=s.replace('rect.height*.65-32','rect.height*roiY-32')
s=s.replace('/Service-streets|Courtyards|Site_safety|Authored-rooms|Industrial_access/', '/Building_|Cover_|Service-streets|Courtyards|Site_safety|Authored-rooms|Industrial_access/')
with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
