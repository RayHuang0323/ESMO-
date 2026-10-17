// Per-weapon signatures. Pistol bodies and mechanisms are designed offline
// from the credited recordings; runtime still spends one pooled source/shot.
export const FPS_GUN_RECORDINGS=Object.freeze({
 'pistol-glock':{label:'Glock-18',sample:'../owner4g/glock-designed.wav',sourceRecording:'Sonniss GDC2023 / Pole Position Glock17 + GDC2015 mechanism',offset:0,duration:.66,gain:.94},
 'pistol-usp':{label:'USP-S',sample:'../owner4g/usp-designed.wav',sourceRecording:'CC0 Ruger MarkIII R_35P, suppressed design + GDC2015 mechanism; not a USP recording',offset:0,duration:.40,gain:.94},
 'pistol-p250':{label:'P250',sample:'../owner4g/p250-designed.wav',sourceRecording:'CC0 Walther PPQ X_39P + GDC2015 mechanism; not a P250 recording',offset:0,duration:.78,gain:.94},
 'pistol-deagle':{label:'Desert Eagle',sample:'../owner4g/deagle-designed.wav',sourceRecording:'Sonniss GDC2015 / Coll Anderson .50 Cal Pistol + mechanism',offset:0,duration:1.12,gain:.94},
 'pistol-tec9':{label:'Tec-9',sample:'../owner4g/tec9-designed.wav',sourceRecording:'Sonniss GDC2023 Glock17 9mm, compact design + mechanism; not a Tec9 recording',offset:0,duration:.54,gain:.94},
});
export const FPS_GUN_AUDIO=Object.freeze({
 ak:{family:'rifle',pitch:.94,gain:1,duration:1.2},m4:{family:'rifle',pitch:1.22,gain:.57,duration:.32},m4a4:{family:'rifle',pitch:1.09,gain:.88,duration:.82},
 galil:{family:'rifle',pitch:1.04,gain:.86,duration:.72},famas:{family:'rifle',pitch:1.17,gain:.79,duration:.58},aug:{family:'rifle',pitch:1.13,gain:.8,duration:.66},sg:{family:'rifle',pitch:.99,gain:.95,duration:.98},
 awp:{family:'sniper',pitch:.88,gain:1,duration:2.2},scout:{family:'sniper',pitch:1.2,gain:.76,duration:1.35},
 mp9:{family:'smg',pitch:1.24,gain:.78,duration:.45},mac10:{family:'smg',pitch:1.1,gain:.86,duration:.55},ump:{family:'smg',pitch:.87,gain:1,duration:.8},p90:{family:'smg',pitch:1.32,gain:.72,duration:.36},
 deagle:{family:'pistol',recording:'pistol-deagle',pitch:1,gain:1.08,duration:1.12},glock:{family:'pistol',recording:'pistol-glock',pitch:1,gain:.86,duration:.66},usp:{family:'pistol',recording:'pistol-usp',pitch:1,gain:.53,duration:.40},p250:{family:'pistol',recording:'pistol-p250',pitch:1,gain:.9,duration:.78},tec9:{family:'pistol',recording:'pistol-tec9',pitch:1.03,gain:.83,duration:.54},
 nova:{family:'shotgun',pitch:.96,gain:1,duration:1.8},xm1014:{family:'shotgun',pitch:1.13,gain:.87,duration:.92},mag7:{family:'shotgun',pitch:1.04,gain:.95,duration:1.25},sawedoff:{family:'shotgun',pitch:.84,gain:1.07,duration:1.65},
});
export function fpsGunAudioProfile(gun){return FPS_GUN_AUDIO[gun]||null;}
