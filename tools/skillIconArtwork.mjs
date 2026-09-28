// Skill-icon illustration grammar. Mechanic chooses the scene; the canonical
// VFX motif and material choose its subject and silhouette, not only its hue.
const stroke = (d, width = 4, opacity = 1) => `<path d="${d}" fill="none" stroke="url(#bright)" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
const solid = (d, opacity = 1) => `<path d="${d}" fill="url(#metal)" stroke="url(#bright)" stroke-width="3" stroke-linejoin="round" opacity="${opacity}"/>`;
const poly = (points, opacity = 1) => solid(`M${points.map(([x, y]) => `${x} ${y}`).join(' L')} Z`, opacity);
const ring = (r, width = 3, dash = '') => `<circle cx="64" cy="64" r="${r}" fill="none" stroke="url(#bright)" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity=".72"/>`;
const shifted = (seed, n, span = 9) => ((seed >>> (n * 4)) % (span * 2 + 1)) - span;

function materialMark(kind, seed) {
  const a = shifted(seed, 0, 7), b = shifted(seed, 1, 7);
  if (kind === 'ice') return poly([[60 + a, 20], [78 + b, 45], [70, 71], [48, 94], [38, 58]], .9)
    + stroke(`M60 ${20 + a} L62 75 M38 58 L78 45 M49 91 L70 71`, 2.5);
  if (kind === 'fire') return solid(`M62 ${15 + a} Q84 36 70 59 Q97 ${45 + b} 95 78 Q85 103 59 109 Q30 94 36 69 Q35 52 53 38 Q49 68 63 70 Q76 51 62 ${15 + a} Z`)
    + stroke('M58 96 Q50 76 70 62 Q80 84 66 100', 3);
  if (kind === 'thunder') return solid(`M${70 + a} 15 L36 66 L62 62 L${52 + b} 111 L97 49 L70 52 Z`)
    + stroke('M35 33 L24 48 L42 44 M93 85 L109 71 L102 96', 3);
  if (kind === 'earth') return poly([[43 + a, 20], [87, 29], [103, 72], [72, 108], [27, 85]], .94)
    + stroke(`M43 20 L64 ${57 + b} L103 72 M64 ${57 + b} L57 100 M27 85 L64 ${57 + b}`, 2.5);
  if (kind === 'steel') return solid(`M35 ${26 + a} L84 21 L105 47 L97 87 L64 109 L27 87 L23 47 Z`)
    + stroke(`M35 ${26 + a} L49 53 L82 ${42 + b} L97 87 M27 87 L49 53 L64 109 M49 53 L82 ${42 + b}`, 3);
  if (kind === 'nature') return solid(`M29 88 Q32 45 88 22 Q96 68 53 99 Q37 104 29 88 Z`)
    + stroke(`M32 94 Q60 69 87 28 M49 67 L31 56 M67 48 L76 ${72 + a}`, 3);
  if (kind === 'water') return solid(`M64 ${19 + a} Q90 54 87 78 Q81 106 63 108 Q38 102 39 78 Q37 51 64 ${19 + a} Z`)
    + stroke(`M36 79 Q58 ${58 + b} 91 76 M42 92 Q67 73 87 89`, 3);
  if (kind === 'wind') return stroke(`M19 ${50 + a} Q62 13 98 39 Q106 51 88 62 Q65 69 48 51 M24 79 Q67 43 105 81 Q107 96 75 101`, 6)
    + stroke(`M42 99 Q50 ${84 + b} 68 82`, 3);
  if (kind === 'shadow') return solid(`M33 ${23 + a} L78 30 L60 61 L103 49 L73 108 L38 90 L51 67 L20 57 Z`)
    + stroke(`M27 28 Q50 ${19 + b} 64 42 M81 87 Q99 75 111 91`, 3);
  return solid(`M64 ${18 + a} L95 42 L105 77 L70 111 L32 95 L20 60 L44 27 Z`)
    + stroke(`M64 ${18 + a} L64 91 M20 60 L95 42 M32 95 L105 77`, 2.5);
}

function sceneKind(mechanic, slot, name, motif) {
  if (slot === 'P') return /醫|救|療|治/.test(name) ? 'passive' : /星|界|宙/.test(name) ? 'aura' : 'passive';
  if (/牌|賭注/.test(name)) return 'card';
  if (/拳|爪|重擊/.test(name) && !/projectile/.test(mechanic)) return 'strike';
  if (/area-heal/.test(mechanic)) return 'sanctuary';
  if (/heal|revive/.test(mechanic)) return 'heal';
  if (/area-mark|area-root|area-control|area-dot|delayed-area/.test(mechanic)) return 'domain';
  if (/target-mark/.test(mechanic)) return 'mark';
  if (/silence-target/.test(mechanic)) return 'silence';
  if (/flood/.test(motif) && /barrier/.test(mechanic)) return 'domain';
  if (/地裂/.test(name) && /dash-wall/.test(mechanic)) return 'domain';
  if (/shield/.test(mechanic) && /連結|連攜/.test(name)) return 'link-guard';
  if (/shield/.test(mechanic) && /祈福|加速/.test(name)) return 'winged-guard';
  if (/shield|guard|barrier/.test(mechanic)) return 'guard';
  if (/crater|blast|flood/.test(motif) && /dash|barrier/.test(mechanic)) return 'domain';
  if (/phase|portal|shift/.test(motif) && /dash|blink/.test(mechanic)) return 'dash';
  if (/刺|斬|刃/.test(name) && /dash|blink/.test(mechanic)) return 'strike';
  if (/dash|blink/.test(mechanic)) return 'dash';
  if (/root|pull|control-target|taunt/.test(mechanic)) return 'bind';
  if (/projectile|piercing/.test(mechanic)) return 'projectile';
  if (/cone|multi-strike|line/.test(mechanic)) return 'sweep';
  if (/area|delayed|dot/.test(mechanic) || /bloom|nova|storm|fault/.test(motif)) return 'domain';
  if (/箭|彈|槍|射|狙/.test(name)) return 'projectile';
  if (/buff|haste|stealth|empower|cdr/.test(mechanic)) return 'aura';
  return /拳|爪|刀|劍|刺|斬/.test(name) ? 'strike' : 'domain';
}

function actionScene(scene, seed, motif, name, kind, mechanic, slot) {
  const a = shifted(seed, 0, 10), b = shifted(seed, 1, 10);
  const c = shifted(seed, 2, 8), n = 2 + (seed % 4);
  if (scene === 'passive') {
    if (/鐵鏈/.test(name)) return [23, 62].map((x, i) => `<g transform="rotate(${i ? 35 : -35} ${x + 23} 64)">${solid(`M${x} 47 Q${x} 26 ${x + 23} 26 Q${x + 46} 26 ${x + 46} 47 L${x + 46} 81 Q${x + 46} 103 ${x + 23} 103 Q${x} 103 ${x} 81 Z`, .8)}</g>`).join('');
    if (/颶風|風刃/.test(name)) return stroke('M15 83 Q43 15 100 33 Q75 43 47 80 Q79 62 113 78 M22 102 Q64 73 104 105', 8)
      + poly([[50, 30], [75, 46], [97, 25]], .75);
    if (/捕食|利爪/.test(name)) return [34, 61, 88].map((x, i) => solid(`M${x - 9} 97 L${x + 9} ${23 + i * 8} L${x + 17} ${55 + i * 5} L${x + 4} 107 Z`, .8)).join('');
    if (/時間|時光/.test(name)) return solid('M32 20 L96 20 L71 63 L96 109 L32 109 L57 63 Z')
      + stroke('M26 18 L102 18 M26 111 L102 111 M45 37 L83 89', 5);
    if (/光速/.test(name)) return stroke('M13 30 L90 30 M23 54 L111 54 M13 79 L95 79 M26 103 L111 103', 8)
      + poly([[79, 19], [113, 64], [79, 111]], .82);
    if (/鏡像|反射/.test(name)) return [24, 76].map((x, i) => solid(`M${x} 29 L${x + 27} ${18 + i * 12} L${x + 22} 102 L${x - 5} ${92 - i * 7} Z`, .9)).join('')
      + stroke('M63 17 L63 109 M36 48 L52 63 M92 49 L76 64', 5);
    if (/龍/.test(name)) return solid('M22 96 Q21 32 67 19 Q105 11 108 48 Q78 38 69 64 Q58 92 22 96 Z')
      + stroke('M58 61 L93 90 M84 47 L108 31 M29 106 L69 101', 5);
    if (/聖焰|聖火/.test(name)) return solid('M64 17 Q85 42 78 63 Q105 52 96 82 Q86 110 64 111 Q40 108 31 83 Q28 56 50 41 Q48 72 64 74 Z')
      + stroke('M64 21 L64 101 M35 63 L92 64', 5);
    if (/影|閃避/.test(name)) return solid('M21 91 Q44 22 78 23 L60 65 L99 48 L76 105 Z')
      + stroke('M18 47 L42 52 M82 28 L111 20 M90 94 L109 108', 5);
    if (/天使|恩典/.test(name)) return solid('M64 73 Q40 20 12 42 Q27 83 60 87 Q89 79 116 41 Q93 17 64 73 Z')
      + stroke('M64 25 L64 101 M43 100 L85 100', 5);
    if (/急救|治療|醫/.test(name)) return solid('M64 22 C28 11 17 54 44 82 L64 109 L84 82 C111 54 100 11 64 22 Z')
      + stroke('M64 44 L64 88 M42 66 L86 66', 8);
    if (/鬼火|靈魂/.test(name)) return solid('M54 19 Q90 44 82 67 Q101 58 94 84 Q86 109 60 109 Q33 104 32 79 Q35 57 56 44 Q41 69 61 73 Q75 53 54 19 Z')
      + stroke('M38 39 Q19 49 22 65 M102 43 Q115 61 104 76', 4);
    if (/護盾|護甲|聖盾/.test(name)) return solid('M64 15 L101 38 L93 82 L64 110 L35 82 L27 38 Z')
      + stroke('M39 43 L64 65 L89 43 M64 66 L64 103', 5);
    const sides = 4 + seed % 5;
    const points = Array.from({ length: sides }, (_, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / sides;
      const radius = i % 2 ? 37 + (seed % 9) : 46 + ((seed >>> 5) % 7);
      return [Math.round(64 + Math.cos(angle) * radius), Math.round(64 + Math.sin(angle) * radius)];
    });
    return poly(points, .62) + ring(25 + seed % 10, 3, `${5 + seed % 7} ${4 + seed % 5}`);
  }
  if (scene === 'projectile') {
    const split = /split|volley|salvo|barrage|rain|連|散|箭雨/.test(`${motif} ${name}`);
    if (/箭|弓/.test(name)) return stroke(`M29 20 Q${76 + a} 64 29 108 M29 20 L29 108`, 5)
      + poly([[27, 60], [91, 59 + b], [112, 64], [92, 72], [27, 68]], .95)
      + stroke('M19 48 L29 61 M19 80 L29 68 M83 44 L101 32', 3);
    if (/彈|槍|round|bullet/.test(`${name} ${motif}`)) return solid(`M29 68 Q34 42 65 38 L103 55 Q113 65 103 74 L66 90 Q34 87 29 68 Z`)
      + stroke(`M15 ${37 + a} L45 46 M11 62 L33 64 M15 ${92 + b} L45 83`, 5)
      + ring(15 + seed % 8, 3);
    if (kind === 'thunder') return solid(`M82 15 L31 70 L61 63 L52 112 L105 48 L73 53 Z`)
      + stroke(`M20 31 L42 ${46 + a} L28 58 M92 85 L113 ${73 + b} L103 98`, 4);
    const main = poly([[19, 101], [40 + a, 70], [74, 39 + b], [105, 18],
      [93, 55], [79, 48 + c], [49, 83], [31, 106]], .95);
    const trails = stroke('M16 62 L42 78 M23 44 L54 67 M11 85 L30 92', 3);
    return main + trails + (split ? stroke('M22 30 L58 53 M42 19 L72 39 M70 107 L92 82', 5) :
      stroke(`M${71 + a} 31 L${93 + b} 19 M40 87 L22 106`, 3));
  }
  if (scene === 'guard') {
    if (/carpet|地毯/.test(`${motif} ${name}`)) return stroke('M15 87 Q33 51 54 84 Q75 43 113 83 M11 104 Q37 68 59 103 Q82 66 117 102', 9)
      + solid('M41 72 Q47 47 57 25 Q66 47 60 77 Z M77 69 Q83 49 95 35 Q99 60 91 85 Z', .85);
    if (/medic|醫/.test(`${motif} ${name}`)) return solid('M64 16 L91 33 L86 82 L64 108 L42 82 L37 33 Z')
      + stroke('M64 37 L64 87 M42 62 L86 62', 10)
      + stroke('M23 96 Q64 76 105 96', 4);
    if (/chrono|time|時光/.test(`${motif} ${name}`)) return ring(44, 6, '15 4')
      + solid('M64 23 L89 42 L83 88 L64 109 L45 88 L39 42 Z')
      + stroke('M64 47 L64 69 L80 77 M64 24 L64 15 M24 64 L15 64 M104 64 L113 64', 5);
    if (/dream|夢/.test(`${motif} ${name}`)) return solid('M87 16 Q48 26 45 61 Q45 92 87 112 Q24 110 19 65 Q17 22 87 16 Z')
      + stroke('M74 30 L80 40 L92 42 L81 49 L78 60 L69 50 L58 48 L69 40 Z', 5);
    if (motif === 'fate-ward3') return solid('M33 22 L95 32 L105 71 L72 110 L28 87 L20 48 Z')
      + stroke('M20 77 Q62 26 107 55 M32 90 Q65 53 98 91 M48 21 L81 105', 5);
    if (motif === 'fate-ward2') return solid('M64 20 L96 42 L87 86 L64 110 L41 86 L32 42 Z')
      + ring(39, 5, '7 7') + stroke('M43 45 L85 85 M85 45 L43 85 M64 28 L64 101', 4);
    if (/fate|命運/.test(`${motif} ${name}`)) return solid('M64 17 L101 42 L94 84 L64 111 L34 84 L27 42 Z')
      + stroke('M27 43 Q64 77 101 43 M35 83 Q64 30 94 83 M64 25 L64 103', 5);
    if (/soul|靈魂/.test(`${motif} ${name}`)) return solid('M64 19 Q96 28 100 60 Q99 92 64 110 Q29 92 28 60 Q32 28 64 19 Z')
      + ring(24, 6) + stroke('M21 94 Q64 55 107 94', 4);
    if (/barrier|wall/.test(mechanic)) return [19, 46, 73].map((x, i) =>
      solid(`M${x} ${37 + i * 3} L${x + 26} ${26 + i * 3} L${x + 30} 86 L${x + 4} 99 Z`, .82)).join('')
      + stroke('M18 105 L106 105 M25 19 L48 10 M74 17 L101 26', 4);
    if (/taunt/.test(mechanic)) return solid('M26 93 L26 32 L63 17 L102 34 L102 93 L65 108 Z')
      + stroke('M64 20 L64 104 M29 52 L100 52 M36 82 L53 69 L64 83 L75 69 L91 82', 5);
    if (/team-shield/.test(mechanic)) return [0, 1, 2].map((i) =>
      `<g transform="translate(${(i - 1) * 21} ${i % 2 ? -9 : 10}) scale(.78)">${solid('M64 18 L95 36 L91 80 L64 106 L37 80 L33 36 Z', .7)}</g>`).join('');
    if (/targeted-ally-shield|ally-shield|targeted-ally-guard/.test(mechanic)) return [0, 1].map((i) =>
      `<g transform="translate(${i ? 19 : -19} ${i ? -5 : 13}) scale(.78)">${solid('M64 19 L98 35 L93 78 L64 107 L35 78 L30 35 Z', .83)}</g>`).join('')
      + stroke('M19 104 Q64 88 109 104', 4);
    const shoulder = 25 + (seed % 13), foot = 96 + (seed % 11);
    return solid(`M64 ${19 + a} L${103 - b} ${shoulder + 12} L95 75 Q84 ${foot} 64 110 Q44 ${foot} 33 75 L${25 + b} ${shoulder + 12} Z`)
      + stroke(`M${25 + b} ${shoulder + 12} L64 ${42 + c} L${103 - b} ${shoulder + 12} M64 ${42 + c} L64 105`, 3)
      + (n % 2 ? stroke('M35 70 L19 82 M93 70 L109 82', 5) : stroke('M30 56 L15 50 M98 56 L113 50', 5));
  }
  if (scene === 'link-guard') return [0, 1].map((i) =>
    `<g transform="translate(${i ? 24 : -24} ${i ? -8 : 9}) scale(.72)">${solid('M64 21 L96 39 L89 81 L64 105 L39 81 L32 39 Z', .87)}</g>`).join('')
    + stroke('M43 70 Q64 46 86 70 M43 83 Q64 58 85 83', 5);
  if (scene === 'winged-guard') return solid('M64 20 L91 37 L86 84 L64 105 L42 84 L37 37 Z')
    + stroke('M36 48 Q18 27 12 44 Q18 70 39 65 M92 48 Q109 27 116 44 Q109 70 89 65', 6);
  if (scene === 'dash') {
    if (/step|phase|shadow|幻影|穿越|閃步/.test(`${motif} ${name}`)) return stroke(`M22 85 Q9 39 58 22 Q93 16 105 47 Q113 82 73 106`, 8)
      + poly([[27, 75], [68, 56], [51, 96]], .82)
      + stroke('M20 29 L43 32 M86 93 L111 91', 4);
    return solid(`M16 ${91 + a} L58 55 L48 33 L103 16 L83 56 L108 67 L49 110 L59 78 Z`)
      + stroke(`M17 ${43 + b} L42 51 M13 ${60 + c} L35 65 M78 93 L111 104`, 4)
      + (seed % 2 ? stroke('M24 107 L68 71 M35 25 L61 36', 3) :
        poly([[21, 22], [47, 29], [31, 44]], .55));
  }
  if (scene === 'bind') {
    if (/pull/.test(mechanic)) return stroke('M20 24 Q82 9 97 56 Q104 83 70 91 Q40 96 45 66', 7)
      + solid('M40 58 L60 57 L66 75 L53 91 L37 80 Z') + stroke('M15 24 L30 38 M75 109 L101 95', 4);
    if (/root-dot/.test(mechanic)) {
      if (/drain|汲取/.test(`${motif} ${name}`)) return solid('M92 27 Q105 56 89 76 Q73 93 57 76 Q42 57 58 39 Q72 19 92 27 Z')
        + stroke('M13 102 Q46 101 55 68 M19 79 Q44 80 54 62 M26 109 L31 91 M52 62 L70 50', 7);
      if (/vine|藤蔓/.test(`${motif} ${name}`)) return stroke('M17 107 Q15 70 54 80 Q89 89 77 49 Q71 20 104 18 M32 93 L20 67 M71 79 L91 100 M79 48 L55 29', 8)
        + poly([[95, 18], [113, 19], [102, 39]], .85);
      return stroke('M19 109 Q45 78 63 72 Q84 68 108 34 M33 92 L22 69 M63 72 L51 42 M84 59 L107 70', 6)
        + poly([[57, 59], [75, 58], [85, 75], [67, 88], [48, 75]], .75);
    }
    if (/control-target/.test(mechanic)) return solid('M18 50 L41 37 L53 48 L64 37 L78 48 L91 36 L111 52 L96 91 L65 107 L30 91 Z')
      + stroke('M20 52 L65 73 L109 51 M36 89 L65 72 L94 89', 4);
    return stroke(`M${18 + a} 47 Q46 19 67 55 Q80 80 108 ${35 + b} M20 ${80 + c} Q49 109 67 75 Q84 46 108 87`, 7)
      + poly([[55, 45], [75, 45], [85, 63], [75, 83], [53, 81], [43, 64]], .9)
      + stroke('M45 64 L19 64 M85 63 L110 63', 3);
  }
  if (scene === 'heal') {
    return solid(`M64 ${31 + a} C30 14 21 56 40 78 L64 108 L88 78 C107 55 97 16 64 ${31 + a} Z`)
      + stroke(`M64 ${44 + b} L64 91 M43 66 L85 66`, 7)
      + stroke('M17 44 L34 53 M94 51 L111 43', 3);
  }
  if (scene === 'sanctuary') return stroke('M14 92 Q64 31 114 92 M19 101 Q64 67 109 101', 7)
    + solid('M64 28 C42 16 34 44 48 59 L64 76 L80 59 C94 44 86 16 64 28 Z')
    + stroke('M64 35 L64 68 M51 51 L77 51', 5);
  if (scene === 'mark') {
    if (/copy|仿製|鏡/.test(`${motif} ${name}`)) return solid('M19 26 L51 20 L59 88 L28 104 Z M77 20 L109 26 L100 104 L69 88 Z')
      + stroke('M34 37 L48 84 M94 37 L80 84 M64 17 L64 111', 5);
    if (/judgment|天罰/.test(`${motif} ${name}`)) return ring(42, 6, '20 9')
      + solid('M64 23 L89 67 L66 99 L40 67 Z')
      + stroke('M16 64 L38 64 M90 64 L112 64 M64 13 L64 33', 6);
    if (/sunder|魂魄/.test(`${motif} ${name}`)) return solid('M64 22 Q101 31 101 66 Q96 100 64 109 Q30 101 27 65 Q27 31 64 22 Z')
      + stroke('M66 25 L53 56 L73 65 L47 101 M24 83 L44 75 M88 76 L108 91', 6);
    if (/guihuo|鬼火/.test(`${motif} ${name}`)) return [36, 80].map((x, i) => solid(`M${x} ${28 + i * 10} Q${x + 26} 52 ${x + 10} 90 Q${x - 12} 83 ${x} ${28 + i * 10} Z`, .9)).join('')
      + stroke('M43 86 Q64 47 85 93 M23 101 Q64 70 106 106', 5);
    return ring(40, 5, '12 6') + stroke('M64 11 L64 39 M64 89 L64 117 M11 64 L39 64 M89 64 L117 64', 5)
      + poly([[64, 45], [83, 64], [64, 83], [45, 64]], .82);
  }
  if (scene === 'silence') {
    if (/void|虛空/.test(`${motif} ${name}`)) return ring(41, 8, '22 10')
      + solid('M18 63 Q64 23 110 63 Q64 105 18 63 Z')
      + stroke('M42 64 L86 64 M64 43 L64 84', 8);
    if (/dark-silence|黑暗/.test(`${motif} ${name}`)) return solid('M20 50 Q64 23 108 50 L94 82 Q64 104 34 82 Z')
      + stroke('M16 98 L111 29 M36 61 L91 61', 9);
    return stroke('M20 30 Q65 14 71 64 Q80 104 109 86 M18 88 Q47 107 57 63 Q47 31 23 45', 8)
      + solid('M52 46 L75 44 L84 67 L66 83 L46 69 Z');
  }
  if (scene === 'sweep') {
    const blades = Array.from({ length: n }, (_, i) => {
      const angle = -52 + i * (105 / Math.max(1, n - 1));
      return `<g transform="rotate(${angle} 64 84)">${solid('M57 96 L65 35 L74 17 L77 94 Z', .75)}</g>`;
    }).join('');
    return blades + stroke(`M20 ${90 + a} Q64 ${104 + b} 110 77`, 5);
  }
  if (scene === 'domain') {
    if (kind === 'ice') return poly([[64, 13], [87, 38], [109, 64], [87, 91], [64, 115], [41, 91], [19, 64], [41, 38]], .45)
      + stroke('M64 17 L64 111 M22 64 L106 64 M39 39 L89 89 M89 39 L39 89', 5)
      + poly([[64, 35], [85, 63], [64, 92], [43, 63]], .9);
    if (kind === 'fire') return solid(`M26 96 Q22 69 44 50 Q39 79 56 71 Q63 45 70 19 Q77 53 86 44 Q108 74 94 96 Z`)
      + stroke(`M17 109 Q64 ${83 + a} 111 109 M32 99 Q62 ${72 + b} 94 100`, 5);
    if (kind === 'thunder' && /delayed/.test(mechanic)) return ring(43, 4, '5 8')
      + solid('M57 22 L40 65 L59 61 L50 106 L86 55 L68 59 L81 22 Z')
      + stroke('M21 96 L41 82 M91 80 L108 97', 4);
    if (kind === 'thunder') return solid('M64 13 L42 57 L60 53 L47 98 L84 61 L69 62 L91 21 Z')
      + stroke('M18 30 L38 45 L27 63 M108 39 L86 56 L102 76 M35 103 L52 84 M92 101 L77 80', 5);
    if (kind === 'earth') return poly([[16, 91], [37, 61], [48, 75], [62, 31], [79, 72], [92, 53], [113, 92]], .9)
      + stroke('M13 106 L43 94 L64 105 L92 92 L116 108 M62 31 L64 105', 4);
    const radii = [32 + seed % 9, 44 + ((seed >>> 4) % 7)];
    const fissures = Array.from({ length: n + 2 }, (_, i) => {
      const angle = 2 * Math.PI * i / (n + 2) + (seed % 19) / 20;
      const x1 = Math.round(64 + Math.cos(angle) * 17), y1 = Math.round(64 + Math.sin(angle) * 17);
      const x2 = Math.round(64 + Math.cos(angle + .13) * radii[1]);
      const y2 = Math.round(64 + Math.sin(angle + .13) * radii[1]);
      return stroke(`M${x1} ${y1} L${x2} ${y2}`, 4);
    }).join('');
    return ring(radii[0], 5, `${8 + seed % 10} ${5 + seed % 7}`) + fissures
      + poly([[64, 37 + a], [83 + b, 62], [65, 86 + c], [43, 64]], .8);
  }
  if (scene === 'aura') {
    const spokes = Array.from({ length: n + 3 }, (_, i) => `<path d="M64 11 L59 28 L69 28 Z" fill="url(#bright)" transform="rotate(${i * 360 / (n + 3) + seed % 17} 64 64)" opacity=".75"/>`).join('');
    return spokes + ring(32 + seed % 8, 4, `${7 + seed % 7} 5`)
      + stroke(`M44 90 Q64 ${29 + a} 84 90 M37 70 Q64 ${45 + b} 91 70`, 5);
  }
  if (scene === 'card') {
    const fan = slot === 'R' ? [-18, 0, 18] : slot === 'Q' ? [-13, 13] : [0];
    return fan.map((angle, i) => `<g transform="rotate(${angle} 64 69)">${solid('M39 23 L89 23 L89 104 L39 104 Z', .75)}${stroke(`M49 ${39 + i * 7} L78 ${39 + i * 7} M49 86 L78 86`, 3)}</g>`).join('');
  }
  if (scene === 'strike' && /拳|爪|重擊/.test(name)) return solid('M34 55 L42 35 L50 42 L56 28 L66 38 L74 25 L86 43 L94 61 L86 93 L64 108 L39 92 Z')
    + stroke('M42 63 L82 63 M47 79 L77 80 M20 42 L32 49', 5);
  return solid(`M28 ${85 + a} Q53 56 87 18 L104 22 Q85 62 51 105 Z`)
    + stroke(`M22 39 L47 60 M15 59 L36 70 M80 92 L111 105`, 4);
}

function materialScene(kind, seed, scene) {
  const mark = materialMark(kind, seed);
  // The material is a second large object, with one of several authored
  // placements. It changes the silhouette at HUD size, not just tiny trim.
  const transform = scene === 'projectile' ? 'translate(-7 -8) scale(.65)'
    : scene === 'guard' ? 'translate(38 38) scale(.43)'
      : scene === 'domain' ? 'translate(24 24) scale(.62)'
        : scene === 'dash' ? 'translate(55 40) scale(.43)'
          : scene === 'heal' || scene === 'sanctuary' ? 'translate(41 38) scale(.4)'
            : scene === 'passive' ? 'translate(22 22) scale(.66)'
              : 'translate(40 32) scale(.5)';
  return `<g transform="${transform}" opacity=".95">${mark}</g>`;
}

// These are artwork treatments, not a parallel skill/gameplay map.  The small
// override set below is deliberately keyed by the canonical hero/slot id: it
// is used only for the final visual-difference pass and leaves gameplay data,
// mechanics and every non-listed icon unchanged.
function refinedSignature(heroId, slot) {
  const key = `${heroId}:${slot}`;
  // Final Owner Review A-set: these are the minimum vertex-cover icons for
  // the accepted high-risk pairs.  Each treatment changes the main silhouette
  // and the subject/composition; it is intentionally keyed to the canonical
  // hero/slot and does not alter gameplay or the shared B archetypes.
  if (key === 'tianshi:W') return solid('M64 21 L93 39 L87 82 L64 108 L41 82 L35 39 Z', .9)
    + stroke('M17 55 Q28 22 53 45 Q64 55 64 67 Q64 55 75 45 Q100 22 111 55 Q103 84 78 74 M64 39 L64 96', 6)
    + ring(43, 3, '7 6');
  if (key === 'tiebi:W') return solid('M20 28 L108 28 L100 101 L28 101 Z', .92)
    + stroke('M25 43 L103 43 M23 65 L105 65 M30 91 L98 91 M42 29 L37 100 M86 29 L91 100', 5)
    + solid('M64 44 L79 53 L75 77 L64 88 L53 77 L49 53 Z', .82)
    + stroke('M53 64 L75 64 M64 54 L64 75', 3);
  if (key === 'leisuhunter:P') return solid('M73 13 L39 55 L61 52 L46 111 L101 45 L76 50 Z', .94)
    + stroke('M16 31 Q39 40 50 55 M12 75 Q31 67 46 70 M78 88 Q99 80 115 91', 5)
    + ring(31, 3, '3 7');
  if (key === 'bingshouweis:P') return ring(45, 4, '4 8')
    + poly([[64, 10], [73, 43], [104, 25], [83, 55], [116, 64], [83, 73], [104, 103], [73, 85], [64, 118], [55, 85], [24, 103], [45, 73], [12, 64], [45, 55], [24, 25], [55, 43]], .88)
    + poly([[64, 39], [83, 64], [64, 89], [45, 64]], .98)
    + stroke('M64 23 L64 105 M23 64 L105 64 M36 36 L92 92 M92 36 L36 92', 4)
    + [31, 97].map((x) => `<circle cx="${x}" cy="64" r="5" fill="url(#bright)"/>`).join('');
  if (key === 'tianfa:P') return ring(42, 4, '9 5')
    + solid('M64 17 L72 46 L103 46 L78 64 L87 96 L64 77 L41 96 L50 64 L25 46 L56 46 Z', .88)
    + stroke('M20 22 L32 34 M108 22 L96 34 M20 106 L34 94 M108 106 L94 94', 4)
    + [28, 50, 72, 94].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 91 : 31}" r="4" fill="url(#bright)"/>`).join('');
  if (key === 'xingchen:Q') return poly([[15, 91], [52, 55], [44, 39], [112, 15], [89, 83], [73, 75], [37, 108]], .92)
    + stroke('M24 68 L83 45 M32 82 L92 59 M77 28 L91 42 M91 27 L96 45 M104 38 L87 47', 4)
    + ring(22, 3, '4 7');
  if (key === 'auralith:E') return ring(46, 5, '6 5')
    + [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => `<g transform="rotate(${angle} 64 64)">${poly([[64, 11], [75, 36], [64, 48], [53, 36]], .86)}</g>`).join('')
    + poly([[64, 38], [78, 64], [64, 90], [50, 64]], .95)
    + stroke('M64 47 L64 81 M47 64 L81 64', 4);
  if (key === 'ronghuo:E') return solid('M16 101 Q18 68 39 58 Q43 31 64 16 Q85 31 89 58 Q110 68 112 101 Z', .93)
    + poly([[64, 18], [55, 56], [64, 48], [73, 56]], .88)
    + stroke('M19 105 Q42 86 64 101 Q86 86 109 105 M37 70 L49 81 M91 70 L79 81', 6)
    + ring(35, 3, '5 8');
  if (key === 'wuxing:E') return ring(43, 6, '18 7')
    + solid('M25 86 Q20 45 53 26 Q88 14 104 43 Q113 72 82 96 Q51 116 25 86 Z', .72)
    + poly([[29, 101], [55, 67], [73, 52], [101, 28], [82, 70], [62, 84]], .95)
    + stroke('M16 48 L31 56 M96 83 L113 92', 4);
  if (key === 'tiemu:Q') return solid('M25 83 L29 52 L43 38 L55 47 L64 28 L74 47 L88 38 L103 53 L101 83 L80 105 L48 105 Z', .94)
    + stroke('M39 62 L51 73 L59 57 L67 73 L79 62 M48 87 L80 87', 6)
    + stroke('M15 36 Q9 64 20 86 M113 36 Q119 64 108 86', 5)
    + ring(29, 3, '4 7');
  if (key === 'voidrift:E') return stroke('M25 18 Q6 64 25 110 M103 18 Q122 64 103 110', 8)
    + stroke('M42 23 Q24 64 42 105 M86 23 Q104 64 86 105', 4)
    + poly([[22, 91], [58, 62], [45, 48], [111, 20], [82, 84], [67, 72]], .94)
    + ring(31, 3, '5 6');
  if (key === 'hunpo:W') return solid('M64 16 L99 37 L92 84 L64 111 L36 84 L29 37 Z', .88)
    + solid('M64 39 Q83 41 83 61 Q83 81 64 88 Q45 81 45 61 Q45 41 64 39 Z', .74)
    + stroke('M54 62 L60 68 L68 55 L74 62 M17 64 Q27 49 37 64 Q27 79 17 64 M111 64 Q101 49 91 64 Q101 79 111 64', 5)
    + ring(42, 3, '4 7');
  if (key === 'stoneguard:E') return [18, 47, 76].map((x, i) => solid(`M${x} ${101 - i * 5} L${x + 4} ${37 - i * 6} L${x + 27} ${25 - i * 4} L${x + 30} ${100 - i * 3} Z`, .9)).join('')
    + stroke('M12 108 L116 108 M26 37 L43 50 M86 49 L104 36 M19 78 L38 68 M90 68 L110 78', 5)
    + ring(45, 3, '3 9');
  if (key === 'ravager:Q') return solid('M20 94 L44 62 L35 42 L61 49 L75 18 L81 49 L108 35 L91 67 L108 76 L77 82 L65 112 Z', .94)
    + stroke('M29 101 Q49 81 65 57 Q81 36 101 24 M25 69 L14 52 M100 95 L114 108', 6)
    + poly([[54, 28], [64, 13], [73, 28]], .82)
    + ring(27, 3, '4 6');
  if (key === 'zhanchang:Q') return solid('M37 22 L66 22 L75 31 L66 40 L37 40 Z', .86)
    + solid('M66 31 L105 64 L66 97 Z', .78)
    + stroke('M37 31 L92 64 L37 97 M51 50 L51 78', 5)
    + stroke('M26 64 L57 64 M42 49 L42 79', 8)
    + ring(44, 3, '4 7');
  if (key === 'suishan:R') return poly([[64, 12], [91, 47], [112, 78], [82, 74], [70, 108], [53, 82], [17, 91], [39, 54]], .94)
    + stroke('M10 108 L38 87 L51 100 L66 77 L82 94 L112 108 M39 55 L64 74 L91 47', 7)
    + ring(42, 4, '6 8')
    + poly([[64, 42], [75, 60], [64, 77], [53, 60]], .9);
  if (key === 'yeiren:W') return solid('M91 17 Q47 27 35 62 Q28 87 57 108 Q42 78 59 55 Q71 38 91 17 Z', .92)
    + stroke('M22 84 Q43 72 57 82 Q72 93 94 77 M18 47 L40 52 M84 101 L110 105', 5)
    + [28, 18, 10].map((r, i) => `<circle cx="${24 + i * 19}" cy="${104 - i * 13}" r="${r / 4}" fill="url(#bright)"/>`).join('')
    + stroke('M78 30 L108 18', 4);
  if (key === 'cinderfist:Q') return solid('M27 94 Q25 71 42 57 L42 35 L56 47 L64 23 L72 47 L88 35 L87 57 Q104 72 101 94 L78 109 L50 109 Z', .92)
    + stroke('M42 69 L56 77 L64 56 L72 77 L88 69 M50 92 L78 92', 5)
    + stroke('M19 43 Q14 61 22 76 M109 43 Q114 61 106 76', 4);
  if (key === 'stoneguard:Q') return solid('M64 18 L94 34 L103 67 L83 101 L48 107 L24 80 L30 45 Z', .9)
    + stroke('M31 46 L64 68 L95 38 M64 68 L48 104 M64 68 L102 67', 5)
    + ring(42, 3, '5 8');
  if (key === 'dianguang:Q') return solid('M73 13 L45 53 L64 50 L50 91 L83 68 L67 66 L94 28 L75 37 Z', .94)
    + stroke('M21 34 L37 47 L25 62 M107 36 L91 49 L103 64 M23 98 L39 84 M105 98 L89 84', 4)
    + ring(31, 3, '4 6');
  if (key === 'sting:P') return solid('M64 19 Q83 32 82 55 Q81 72 64 109 Q47 72 46 55 Q45 32 64 19 Z', .9)
    + stroke('M64 29 L64 88 M45 65 Q28 51 20 64 Q29 77 45 73 M83 65 Q100 51 108 64 Q99 77 83 73', 5)
    + [34, 94].map((x) => `<circle cx="${x}" cy="96" r="5" fill="url(#bright)"/>`).join('');
  if (key === 'hexweave:E') return stroke('M18 34 Q64 14 110 34 M18 94 Q64 114 110 94', 5)
    + solid('M28 64 L64 24 L100 64 L64 104 Z', .92)
    + stroke('M35 43 L93 85 M93 43 L35 85 M19 64 L109 64', 4)
    + [35, 93].map((x) => `<circle cx="${x}" cy="64" r="5" fill="url(#bright)"/>`).join('');
  if (key === 'rongyan:Q') return solid('M22 97 Q22 71 37 57 L45 31 L61 49 L70 20 L79 49 L94 31 L105 58 Q111 83 93 101 L64 113 Z')
    + stroke('M36 84 Q47 66 57 55 M92 84 Q81 66 71 55 M47 94 Q64 81 81 94', 5)
    + stroke('M18 42 L34 51 M94 51 L110 42', 4);
  if (key === 'luminary:W') return solid('M64 12 L74 45 L108 64 L74 74 L64 113 L54 74 L20 64 L54 45 Z', .9)
    + ring(30, 4, '6 5')
    + stroke('M29 30 L29 43 M22 36 L36 36 M99 91 L99 104 M92 97 L106 97', 4);
  if (key === 'mantra:E') return solid('M64 15 L91 30 L98 63 L82 96 L64 113 L46 96 L30 63 L37 30 Z', .9)
    + stroke('M64 21 L64 107 M36 48 L92 80 M92 48 L36 80', 4)
    + ring(24, 3, '3 6')
    + stroke('M18 63 L29 63 M99 63 L110 63', 5);
  if (key === 'yueying:P') return solid('M84 19 Q46 24 32 57 Q21 87 54 108 Q38 83 52 60 Q65 37 84 19 Z', .92)
    + stroke('M75 28 Q52 40 47 63 Q45 83 60 99', 4)
    + poly([[96, 25], [100, 34], [110, 35], [102, 41], [105, 51], [96, 45], [87, 51], [90, 41], [82, 35], [92, 34]], .78);
  if (key === 'shiguang:Q') return ring(42, 5)
    + ring(24, 3, '3 8')
    + solid('M64 27 L71 60 L95 74 L83 88 L58 73 Z', .86)
    + stroke('M19 31 L19 45 M19 31 L33 31 M109 31 L109 45 M109 31 L95 31 M19 97 L19 83 M19 97 L33 97 M109 97 L109 83 M109 97 L95 97', 4);
  if (key === 'suishan:E') return solid('M16 101 L40 55 L55 71 L73 29 L112 101 Z', .92)
    + stroke('M16 102 L112 102 M73 30 L73 91 M39 57 L59 91', 5)
    + poly([[73, 42], [82, 58], [73, 68], [64, 58]], .72);
  if (key === 'mingyun2:E') return ring(42, 4, '4 7')
    + stroke('M21 45 Q42 20 64 45 Q86 70 107 45 M21 83 Q42 58 64 83 Q86 108 107 83', 6)
    + [21, 64, 107].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 83 : 45}" r="7" fill="url(#metal)" stroke="url(#bright)" stroke-width="3"/>`).join('')
    + stroke('M64 16 L64 34 M64 94 L64 112', 4);
  if (key === 'maestro:E') return stroke('M12 46 Q27 24 43 46 T75 46 T116 46', 7)
    + stroke('M12 78 Q27 56 43 78 T75 78 T116 78', 5)
    + poly([[64, 37], [78, 62], [64, 89], [50, 62]], .86)
    + stroke('M28 30 L28 94 M100 30 L100 94', 3);
  if (key === 'hunpo:P') return solid('M14 64 Q35 31 64 31 Q93 31 114 64 Q93 97 64 97 Q35 97 14 64 Z', .9)
    + ring(16, 4)
    + solid('M64 48 Q75 54 75 64 Q75 74 64 80 Q53 74 53 64 Q53 54 64 48 Z', .86)
    + stroke('M25 64 L43 64 M85 64 L103 64', 4);
  if (key === 'lieyan:R') return solid('M64 13 Q83 31 83 49 L98 59 L80 65 Q86 89 64 114 Q42 89 48 65 L30 59 L45 49 Q45 31 64 13 Z', .9)
    + ring(31, 4, '5 5')
    + stroke('M64 22 L64 104 M43 91 L53 82 M85 91 L75 82', 4);
  if (key === 'leiming:R') return ring(41, 4, '8 6')
    + solid('M72 12 L39 55 L59 53 L48 92 L84 69 L67 66 L95 31 L74 38 Z', .94)
    + stroke('M16 36 L31 47 M112 36 L97 47 M18 96 L34 86 M110 96 L94 86', 4);
  if (key === 'xingchen:P') return poly([[64, 13], [73, 53], [111, 64], [73, 75], [64, 115], [55, 75], [17, 64], [55, 53]], .86)
    + ring(27, 3, '4 6')
    + stroke('M29 29 L45 45 M99 29 L83 45 M29 99 L45 83 M99 99 L83 83', 4)
    + [29, 99].map((x) => `<circle cx="${x}" cy="${x === 29 ? 29 : 99}" r="5" fill="url(#bright)"/>`).join('');
  return null;
}

// Distinct signature compositions follow the existing Final VFX Fusion motif
// names. These are artwork treatments, not a parallel skill/gameplay map.
function signatureArt(motif) {
  if (motif === 'iron-intercept') return solid('M21 95 L29 39 L63 20 L99 39 L107 95 L64 111 Z')
    + stroke('M12 65 L47 65 M80 65 L116 65 M64 19 L64 108 M33 91 L64 71 L95 91', 6);
  if (motif === 'auralith-wall8') return [21, 49, 77].map((x, i) => solid(`M${x} 104 L${x + 3} ${33 - i * 6} L${x + 24} ${23 - i * 5} L${x + 24} 104 Z`, .83)).join('')
    + stroke('M16 108 L112 108 M31 40 L47 52 M58 31 L75 44', 4);
  if (motif === 'bingshuang-bulwark8') return solid('M64 14 L104 38 L98 82 L64 113 L30 82 L24 38 Z')
    + stroke('M64 18 L64 106 M28 42 L64 68 L100 42 M43 83 L64 68 L85 83', 5);
  if (motif === 'hanbing-repulse10') return ring(27, 6)
    + [15, 43, 72, 101].map((x, i) => poly([[x, 58], [x + 11, 19 + (i % 2) * 13], [x + 20, 59]], .85)).join('')
    + stroke('M13 94 Q64 64 116 94', 6);
  if (motif === 'bingshuang-zero9') return stroke('M18 99 Q64 114 110 99 M24 87 L42 71 M104 87 L86 71', 5)
    + [31, 55, 79].map((x, i) => poly([[x, 92], [x + 8, 18 + i * 10], [x + 22, 92]], .8)).join('')
    + stroke('M17 110 L38 98 M90 98 L111 110', 3);
  if (motif === 'skyfall-barrage') return solid('M24 50 Q20 31 43 28 Q52 11 72 25 Q97 18 105 44 Q105 55 92 58 L31 58 Z')
    + [34, 63, 87].map((x, i) => solid(`M${x + 9} 59 L${x - 5} ${83 + i * 4} L${x + 4} ${80 + i * 4} L${x - 1} 113 L${x + 19} 78 L${x + 10} 81 Z`, .9)).join('');
  if (motif === 'cinderfist-inferno4') return solid('M32 93 L31 59 L41 41 L50 49 L56 30 L65 39 L73 25 L86 45 L96 63 L86 94 L63 108 Z')
    + stroke('M40 69 L82 70 M45 83 L78 84 M18 81 Q15 50 32 35 M99 36 Q114 64 103 88', 5);
  if (motif === 'dadi-resonance8') return [22, 47, 75].map((x, i) =>
    solid(`M${x} 100 L${x + 4} ${42 - i * 12} L${x + 22} ${29 - i * 7} L${x + 26} 99 Z`, .9)).join('')
    + stroke('M13 110 Q64 88 116 110 M16 98 Q64 75 113 99', 4);
  if (motif === 'earthquake2') return stroke('M8 101 L44 75 L61 93 L82 57 L119 96 M14 115 L49 93 L64 110 L94 82 L116 109', 8)
    + [27, 68, 101].map((x, i) => solid(`M${x - 12} ${79 - i * 7} L${x} ${26 + i * 12} L${x + 14} ${77 - i * 7} Z`, .85)).join('');
  if (motif === 'auralith-tempest8') return stroke('M17 43 Q64 9 111 43 M21 51 Q64 18 107 51', 9)
    + [36, 64, 92].map((x, i) => solid(`M${x} ${49 + i * 5} L${x + 11} ${75 + i * 2} L${x + 1} 112 L${x - 10} ${75 + i * 2} Z`, .87)).join('');
  if (motif === 'permafrost') return [30, 58, 88].map((x, i) => solid(`M${x} 108 L${x + 6} ${24 + i * 11} L${x + 20} 106 Z`, .92)).join('')
    + stroke('M18 49 L109 49 M16 96 L111 96', 6);
  if (motif === 'sanctuary-grid') return stroke('M13 91 Q64 4 115 91 M17 102 Q64 72 111 102 M39 45 L39 92 M64 26 L64 104 M89 45 L89 92', 7);
  if (motif === 'sanctuary-crown') return solid('M17 95 L25 36 L46 57 L64 20 L82 57 L103 36 L111 95 Z')
    + stroke('M22 105 L106 105 M46 65 L64 41 L82 65', 5);
  if (motif === 'fate-bind') return solid('M30 25 L98 25 L70 63 L98 103 L30 103 L57 63 Z')
    + stroke('M18 64 Q38 24 64 64 Q90 104 110 64', 6);
  if (motif === 'dream-bind') return solid('M89 19 Q38 33 46 76 Q52 103 91 108 Q25 112 20 68 Q18 28 89 19 Z')
    + stroke('M18 104 Q53 64 107 96 M44 89 L61 70', 6);
  if (motif === 'bastion-wrath4') return solid('M23 99 L25 39 L48 22 L64 39 L80 22 L104 39 L105 99 L64 114 Z')
    + stroke('M64 17 L64 102 M49 39 L64 24 L79 39 M27 79 L48 68 M101 79 L80 68', 5);
  if (motif === 'hanbing-salvo10') return stroke('M23 24 Q78 64 23 107 M23 24 L23 107', 5)
    + [-28, -13, 0, 13, 28].map((a) => `<g transform="rotate(${a} 43 66)">${solid('M31 61 L92 58 L108 65 L92 72 L31 69 Z', .75)}</g>`).join('');
  if (motif === 'gambler-chance6') return solid('M22 64 Q64 13 106 64 Q64 115 22 64 Z')
    + solid('M64 43 L83 64 L64 85 L45 64 Z')
    + stroke('M13 26 L30 37 M98 38 L115 26 M13 102 L30 90 M97 91 L115 102', 4);
  return null;
}

export function illustrateSkillIcon({ hero, slot, skill, kind, seed }) {
  const mechanic = skill.gameplay?.mechanic ?? '';
  const motif = skill.presentation?.motif ?? `${hero.id}-${skill.name}`;
  const scene = sceneKind(mechanic, slot, skill.name, motif);
  const motifSeed = seed ^ [...motif].reduce((n, ch) => Math.imul(n ^ ch.codePointAt(0), 16777619) >>> 0, 2166136261);
  const shape = refinedSignature(hero.id, slot)
    ?? signatureArt(motif)
    ?? actionScene(scene, motifSeed, motif, skill.name, kind, mechanic, slot);
  const material = materialScene(kind, motifSeed, scene);
  const ultimate = slot === 'R' ? {
    ice: stroke('M14 27 L32 34 L38 15 M91 14 L96 34 L115 25 M12 98 L35 91 L27 114 M93 92 L115 104 L107 81', 4),
    fire: stroke('M12 92 Q16 60 30 45 M104 39 Q117 66 112 96 M41 17 Q48 30 41 42 M89 15 Q80 33 91 42', 5),
    thunder: stroke('M10 26 L30 36 L18 51 L42 47 M99 16 L114 31 L101 47 M17 99 L35 85 L27 112 M86 88 L109 106 L101 83', 4),
    earth: solid('M8 91 L25 69 L37 96 Z M92 94 L110 68 L120 103 Z M45 13 L63 8 L77 24 L57 30 Z', .65),
    steel: stroke('M13 31 L38 20 L42 37 M87 20 L115 34 L102 48 M16 97 L40 109 M86 109 L111 94', 5),
    nature: stroke('M11 100 Q21 53 43 27 M118 28 Q99 63 93 105 M14 53 Q30 48 30 70 M108 72 Q92 75 94 55', 4),
    water: stroke('M8 32 Q31 13 46 31 M78 31 Q101 12 120 34 M8 94 Q28 74 48 92 M80 93 Q102 73 120 93', 5),
    wind: stroke('M12 36 Q26 20 46 30 M82 26 Q105 19 117 41 M12 91 Q32 108 48 89 M85 99 Q109 106 119 83', 4),
    shadow: solid('M8 18 L35 27 L19 48 Z M120 18 L93 28 L109 49 Z M8 110 L34 101 L18 82 Z M119 110 L93 100 L108 82 Z', .55),
    arcane: stroke('M15 37 L34 14 L50 29 M81 29 L99 14 L115 37 M15 92 L34 114 L50 99 M81 99 L99 114 L115 92', 3),
  }[kind] ?? '' : '';
  const accent = slot === 'P' ? stroke('M14 107 L34 97 M94 30 L113 21', 2.5, .8)
    : slot === 'R' ? stroke('M12 17 L28 26 M100 102 L116 112', 3, .9)
      : scene === 'projectile' ? stroke('M8 109 L31 93', 3, .8)
        : scene === 'domain' ? stroke('M14 73 L26 76 M102 49 L117 43', 3, .8)
          : '';
  return { scene, markup: `<g>${shape}${material}${ultimate}${accent}</g>` };
}
