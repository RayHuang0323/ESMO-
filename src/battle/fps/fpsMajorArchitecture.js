// CS major 專用的室內資料；碰撞、導航及可見牆共用這些實體片段。
// 保留原建物外框，只將指定廠房改成有合法門洞的空間；legacy 不載入。
export const FPS_MAJOR_AUTHORED_ROOMS = {
  mirage: [
    {id:'pump-gallery',x:33,y:10,w:10,h:17,height:7,label:'濾池泵房',roof:'vault',entryAxis:'y',doorWidth:4.8,authored:true},
    {id:'pressure-gallery',x:69,y:10,w:16,h:7,height:7,label:'A 點調壓廊',roof:'clerestory',entryAxis:'y',doorWidth:4.8,authored:true,compact:true},
    {id:'central-pump-hall',x:62,y:44,w:12,h:20,height:4.5,label:'中央主泵廊',roof:'process-hall',entryAxis:'y',doorWidth:4.8,authored:true,compact:true,processKind:'pump-hall',
      fixtures:[{id:'main-pump-service-bank',x:62.8,y:50,w:1.6,h:4.6,hgt:2.7,form:'pump-bank',asset:'factory-kit/machine-fortified',rotation:Math.PI/2}]},
  ],
  dust2: [
    {id:'repair-bay',x:32,y:61,w:10,h:13,height:7,label:'維修工位',roof:'sawtooth',entryAxis:'x',doorWidth:4.8,authored:true,
      fixtures:[{id:'repair-workbench',x:35.1,y:61.8,w:3.8,h:1.6,hgt:2.1,form:'repair-bench',asset:'factory-kit/machine-fortified'}]},
    {id:'customs-transfer',x:52,y:51,w:9,h:17,height:8,label:'通關轉運廊',roof:'clerestory',entryAxis:'y',doorWidth:4.8,authored:true,compact:true},
  ],
  inferno: [
    {id:'conveyor-hall',x:35,y:34,w:9,h:17,height:7,label:'輸送廠房',roof:'sawtooth',entryAxis:'x',doorWidth:4.8,authored:true},
    {id:'casting-gallery',x:7,y:34,w:10,h:21,height:8,label:'西側鑄件廊',roof:'shed',entryAxis:'y',doorWidth:4.8,authored:true,compact:true},
    {id:'extraction-gallery',x:44,y:47,w:10,h:9,height:7,label:'中央集塵廊',roof:'process-hall',entryAxis:'y',doorWidth:4.8,authored:true,compact:true,processKind:'extraction-plant',
      fixtures:[{id:'extraction-control-bank',x:44.8,y:49.4,w:1.6,h:3.9,hgt:2.6,form:'extraction-bank',asset:'factory-kit/machine-fortified',rotation:Math.PI/2}]},
    {id:'pouring-hall',x:53,y:61,w:9,h:9,height:7,label:'澆鑄工位',roof:'process-hall',entryAxis:'x',doorWidth:4.8,authored:true,compact:true,processKind:'extraction-plant',
      fixtures:[{id:'casting-control-bed',x:55.4,y:61.8,w:3.9,h:1.2,hgt:2.5,form:'casting-bed',asset:'factory-kit/machine-fortified'}]},
  ],
};

export function majorRoomWalls(room) {
  const {x,y,w,h,height,entryAxis,doorWidth,id}=room,t=.8;
  const wall=(x,y,w,h)=>({x,y,w,h,hgt:height,architecture:id,compactArchitecture:!!room.compact});
  if(entryAxis==='y'){
    const side=(w-doorWidth)/2;
    return [wall(x,y,t,h),wall(x+w-t,y,t,h),wall(x,y,side,t),wall(x+side+doorWidth,y,side,t),wall(x,y+h-t,side,t),wall(x+side+doorWidth,y+h-t,side,t)];
  }
  const side=(h-doorWidth)/2;
  return [wall(x,y,w,t),wall(x,y+h-t,w,t),wall(x,y,t,side),wall(x,y+side+doorWidth,t,side),wall(x+w-t,y,t,side),wall(x+w-t,y+side+doorWidth,t,side)];
}

export function majorRoomPassage(room, padding=1.5) {
  const center={x:room.x+room.w/2,y:room.y+room.h/2};
  return room.entryAxis==='y'?[{x:center.x,y:room.y-padding},center,{x:center.x,y:room.y+room.h+padding}]:[{x:room.x-padding,y:center.y},center,{x:room.x+room.w+padding,y:center.y}];
}
