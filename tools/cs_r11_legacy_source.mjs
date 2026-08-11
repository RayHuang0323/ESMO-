// Historical-view adapter for the R10 determinism verifier and older CS
// evidence after R11 repairs the overloaded round-end `how` semantics.
// It never writes production files.

export const CS_R10_SOURCE_SHA256 = "ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d";
export const CS_R11_REPAIRED_SOURCE_SHA256 = "b26ec0947c0b569401ec35f85f02e5efae7a4aaf7baa4381d27587ae235c3482";
export const CS_R10_LF_SHA256 = "1362106a6e1b21b9e459a4c1b0fd06f4d86ceea0a8bf7e2064f5b72e39ee17a7";
export const CS_R11_REPAIRED_LF_SHA256 = "634e7063e95ea3c1267d4f5ec3871930b4f776c415f8460e894ee43f6b92115d";

const R10_RESULT_LINES = [
  '        else if(aliveCT.length===0)roundEnd={winner:"t",how:planted?"bomb":"elim"};',
  '        else if(sec>=114)roundEnd={winner:planted?"t":"ct",how:planted?"bomb":"time"};',
];
const R11_RESULT_RE = /(\r?\n)(        else if\(aliveCT\.length===0\)roundEnd=\{winner:"t",how:"elim"\};)(\r?\n)(        else if\(sec>=114\)roundEnd=\{winner:planted\?"t":"ct",how:"time"\};)(\r?\n)(      \})/;

export function csR11R10Source(source) {
  const match = source.match(R11_RESULT_RE);
  if (!match) return source;
  const historicalEol = match[1];
  return source.replace(R11_RESULT_RE,
    `${historicalEol}${R10_RESULT_LINES.join(historicalEol)}${historicalEol}${match[6]}`);
}
