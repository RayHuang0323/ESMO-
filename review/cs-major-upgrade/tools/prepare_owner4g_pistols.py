import wave,math,pathlib,json,hashlib,struct
source=pathlib.Path('review/cs-major-upgrade/assets-source/owner4g-audio')
dest=pathlib.Path('public/audio/cs/owner4g');dest.mkdir(parents=True,exist_ok=True)
RATE=44100
def clip(name,start,duration):
    with wave.open(str(source/name),'rb') as w:
        rate=w.getframerate();channels=w.getnchannels();width=w.getsampwidth();w.setpos(round(start*rate));data=w.readframes(round(duration*rate))
    n=len(data)//(channels*width);frames=[]
    for i in range(n):
        at=i*channels*width;frames.append(sum(int.from_bytes(data[at+c*width:at+(c+1)*width],'little',signed=True) for c in range(channels))/channels/(2**(width*8-1)))
    count=round(n/rate*RATE);out=[]
    for i in range(count):
        at=i*rate/RATE;lo=min(n-1,int(at));hi=min(n-1,lo+1);out.append(frames[lo]+(frames[hi]-frames[lo])*(at-lo))
    return out
def highpass(data,hz):
    a=math.exp(-2*math.pi*hz/RATE);last=0;value=0;out=[]
    for x in data:value=a*(value+x-last);last=x;out.append(value)
    return out
def lowpass(data,hz):
    a=1-math.exp(-2*math.pi*hz/RATE);value=0;out=[]
    for x in data:value+=a*(x-value);out.append(value)
    return out
def finish(data,seconds,target,ceiling):
    count=round(seconds*RATE);data=(data+[0.0]*count)[:count]
    for i in range(count):data[i]*=min(1,i/(RATE*.0006),max(0,(count-1-i)/(RATE*.045)))
    energy=math.sqrt(sum(x*x for x in data[:round(.25*RATE)])/min(len(data),round(.25*RATE)))
    peak=max(abs(x) for x in data);gain=min(target/max(energy,1e-12),ceiling/max(peak,1e-12));return [x*gain for x in data]
def write(name,data,provenance):
    path=dest/name
    if path.exists():raise RuntimeError('Refuse derived sound overwrite: '+str(path))
    with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(b''.join(struct.pack('<h',max(-32767,min(32767,round(x*32767)))) for x in data))
    return dict(file=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size,duration=len(data)/RATE,rate=RATE,channels=1,peak=max(abs(x) for x in data),rms=math.sqrt(sum(x*x for x in data)/len(data)),provenance=provenance)
mechanic=highpass(clip('charging-handle-gdc2015-source.wav',.747,.12),700)
mp=max(abs(x) for x in mechanic);mechanic=[x/mp for x in mechanic]
plans=[
 ('glock','glock17-gdc2023-source.wav',8.502,.66,80,8000,.20,.032,.022,.12,.84),
 ('usp','R_35P.wav',.475,.40,100,1700,.075,.018,.035,.075,.62),
 ('p250','X_39P.wav',1.398,.78,110,6400,.25,.045,.026,.12,.84),
 ('deagle','deagle-50cal-gdc2015-source.wav',1.012,1.12,45,7000,.40,.065,.040,.16,.90),
 ('tec9','glock17-gdc2023-source.wav',17.072,.54,140,7300,.14,.022,.030,.11,.82),
]
rows=[]
for gun,file,start,duration,hp,lp,tail,delay,metal,target,ceiling in plans:
    data=lowpass(highpass(clip(file,start,duration),hp),lp)
    if gun=='usp':data=lowpass(data,1700)
    for i in range(len(data)):
        t=i/RATE
        if t>.095:data[i]*=math.exp(-(t-.095)/tail)
    at=round(delay*RATE)
    for i,x in enumerate(mechanic):
        if at+i<len(data):data[at+i]+=x*metal
    data=finish(data,duration,target,ceiling)
    rows.append(write(gun+'-designed.wav',data,dict(recording=file,startSec=start,durationSec=duration,highpassHz=hp,lowpassHz=lp,extraLowpass=(gun=='usp'),tailTauSec=tail,mechanicSource='charging-handle-gdc2015-source.wav',mechanicCrop=[.747,.867],mechanicDelaySec=delay,design='licensed recorded firearm plus recorded mechanism; no Valve audio, no generated gunshot oscillator')))
for kind,file,start,duration,target in [('empty','charging-handle-gdc2015-source.wav',.748,.12,.05),('reload-start','magazine-gdc2015-source.wav',.245,.64,.065),('reload-complete','charging-handle-gdc2015-source.wav',2.365,.40,.07)]:
    data=finish(highpass(clip(file,start,duration),350),duration,target,.68)
    rows.append(write('handling-'+kind+'.wav',data,dict(recording=file,startSec=start,durationSec=duration,highpassHz=350)))
for row in rows:row['provenance']['sourceSHA256']=hashlib.sha256((source/row['provenance']['recording']).read_bytes()).hexdigest()
report=dict(rows=rows,totalBytes=sum(r['bytes'] for r in rows),originalSourceDownloadsPaid=False,sourceFilesNotForDistribution=True,runtimeSourcesPerShot=1,rate=RATE)
(source/'prepared-pistols-r1.json').write_text(json.dumps(report,indent=2));print(json.dumps(dict(files=len(rows),totalBytes=report['totalBytes'],rows=[{k:r[k] for k in ['file','duration','peak','rms']} for r in rows])))
