// Reads the assigned simulation task, never a player's display specialty.
export const FPS_ROLE_JOBS=Object.freeze({
 entry:{label:'突破手',job:'首波進點、取得接觸與空間'},
 rifler:{label:'步槍手',job:'跟進補槍、交叉火力與回防'},
 awp:{label:'狙擊手',job:'長線控角、取得首殺後重新架線'},
 igl:{label:'指揮',job:'情報協調、轉點與目標執行'},
 support:{label:'輔助',job:'煙閃掩護、支援補槍與目標保障'},
 lurker:{label:'游走手',job:'側線控圖、牽制與截斷回防'},
});
export function fpsRoleDutyView(p){
 const role=FPS_ROLE_JOBS[p.role]||FPS_ROLE_JOBS.rifler;
 const duty=p.tacticalIntent?.kind==='recover-c4'?'回收 C4':p.state==='安裝中'?'安裝 C4':p.state==='拆彈中'?'拆除 C4':p.hasBomb?'攜包推進':p.tacticalIntent?.kind==='take-cover'?'尋找掩體':p.tacticalIntent?.kind==='save'?'保槍':p.side==='ct'?({information:'資訊架線',rotator:'機動回防',anchor:'守點架槍'}[p.tacticalDuty?.defenseDuty]):({entry:'首波突破',trade:'補槍支援',overwatch:'狙擊架線',flank:'側線牽制',carrier:'目標執行'}[p.tacticalDuty?.attackDuty]);
 return{role:p.role,label:role.label,job:role.job,duty:duty||p.state||'等待部署'};
}
