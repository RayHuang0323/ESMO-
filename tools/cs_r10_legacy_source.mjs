// Historical-view adapter for pre-R10 CS verifiers.
// It never changes production files; it lets R1-R8 re-run their frozen
// evidence against the R9 legacy defuse semantics after production migrates.

export const CS_R10_REPAIRED_SOURCE_SHA256 = "ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d";
export const CS_R10_REPAIRED_LF_SHA256 = "1362106a6e1b21b9e459a4c1b0fd06f4d86ceea0a8bf7e2064f5b72e39ee17a7";
export const CS_R8_LEGACY_LF_SHA256 = "8c9768949e9fbedd0f3048d82fd25a4ff50bc9daf71b7155f6d154c67bb393c0";

const LEGACY_DEFUSE_LINES = [
  "        const defuser=aliveCT.find(cp=>dist(cp.pos,c4pos)<6);",
  "        const contested=defuser&&aliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));",
];
const REPAIRED_DEFUSE_RE = /(        const defuseAliveCT=ps\.filter\(p=>p\.side===\"ct\"&&!p\.dead\),defuseAliveT=ps\.filter\(p=>p\.side===\"t\"&&!p\.dead\);)(\r?\n)(        const defuser=defuseAliveCT\.find\(cp=>dist\(cp\.pos,c4pos\)<6\);)(\r?\n)(        const contested=defuser&&defuseAliveT\.some\(tp=>dist\(tp\.pos,c4pos\)<9&&!lineBlocked\(tp\.pos,defuser\.pos,walls\)\);)/;

export function csR10LegacySource(source) {
  const match = source.match(REPAIRED_DEFUSE_RE);
  if (!match) return source;
  const eol = match[2];
  return source.replace(REPAIRED_DEFUSE_RE, LEGACY_DEFUSE_LINES.join(eol));
}
