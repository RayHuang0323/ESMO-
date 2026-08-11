// Historical-view adapter for R12 and older CS evidence after R13 wires
// player-thrown smoke into the existing smoke LOS system. It never writes
// production files and must restore the byte-exact R12 source.

export const CS_R12_SOURCE_SHA256 = "b26ec0947c0b569401ec35f85f02e5efae7a4aaf7baa4381d27587ae235c3482";
export const CS_R13_PLAYER_SMOKE_SOURCE_SHA256 = "bab6776110eac6181bf7b75250061592e2dfc892d4523ea9817cdb15e1cfe341";

export const R13_PLAYER_SMOKE_LINE = '        if(tw.type==="smoke")smokes.push({id:`s${tw.id}`,pos:{...tw.to},tl:18,age:0});';

export function csR13R12Source(source) {
  const lineIndex = source.indexOf(R13_PLAYER_SMOKE_LINE);
  if (lineIndex < 0) return source;
  const newlineIndex = source.lastIndexOf("\n", lineIndex);
  if (newlineIndex < 0) return source;
  const removeFrom = source[newlineIndex - 1] === "\r" ? newlineIndex - 1 : newlineIndex;
  return source.slice(0, removeFrom) + source.slice(lineIndex + R13_PLAYER_SMOKE_LINE.length);
}
