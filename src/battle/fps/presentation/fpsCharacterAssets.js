const BASE_URL = String(import.meta.env?.BASE_URL || "/");

function assetUrl(relativePath) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return `${base}${relativePath.replace(/^\/+/, "")}`;
}
export const FPS_CHARACTER_ASSET_MANIFEST = Object.freeze({
  id: "esmo-fps-base-character-c2a",
  source: "Quaternius Universal Base Characters / Superhero_Male_FullBody",
  license: "CC0 1.0 Universal",
  character: assetUrl("assets/fps/c2a/esmo-fps-character.glb"),
  animationLibrary: assetUrl("assets/fps/c2a/esmo-fps-animation-library.glb"),
  targetHeight: 1.82,
  // The checked-in CC0 character faces native +Z (the Eyes/Eyebrows bind
  // bounds sit on +Z). Rotate +Z onto the renderer's authoritative +X front.
  // The previous negative sign turned the body 180deg away from movement.
  orientationOffset: Math.PI / 2,
  clips: Object.freeze({
    idle: "Idle_Loop",
    walk: "Walk_Loop",
    run: "Sprint_Loop",
    jog: "Jog_Fwd_Loop",
    strafeLeft: "Walk_Loop",
    strafeRight: "Walk_Loop",
    backpedal: "Walk_Loop",
    aim: "Pistol_Aim_Neutral",
    fire: "Pistol_Shoot",
    hit: "Hit_Chest",
    death: "Death01",
  }),
  optionalClips: Object.freeze({
    crouch: "Crouch_Fwd_Loop",
    crouchIdle: "Crouch_Idle_Loop",
    reload: "Pistol_Reload",
    aimDown: "Pistol_Aim_Down",
    aimUp: "Pistol_Aim_Up",
  }),
  clipFallbacks: Object.freeze({
    Idle_Loop: "Idle_Loop",
    Walk_Loop: "Idle_Loop",
    Sprint_Loop: "Walk_Loop",
    Jog_Fwd_Loop: "Walk_Loop",
    Pistol_Aim_Neutral: "Idle_Loop",
    Pistol_Shoot: "Pistol_Aim_Neutral",
    Hit_Chest: "Idle_Loop",
    Death01: "Idle_Loop",
    Crouch_Fwd_Loop: "Walk_Loop",
    Crouch_Idle_Loop: "Idle_Loop",
    Pistol_Reload: "Pistol_Aim_Neutral",
    Pistol_Aim_Down: "Pistol_Aim_Neutral",
    Pistol_Aim_Up: "Pistol_Aim_Neutral",
  }),
});

export const FPS_CHARACTER_QUALITY_POLICY = Object.freeze({
  high: Object.freeze({ riggedPlayers: "all", shadow: true }),
  medium: Object.freeze({ riggedPlayers: "all", shadow: false }),
  low: Object.freeze({ riggedPlayers: 0, shadow: false }),
});

export function getRiggedCharacterLimit(roster = []) {
  if (typeof window === "undefined") return roster.length;
  const mode = new URLSearchParams(window.location.search).get("fpsRigged");
  if (mode === "off") return 0;
  if (!mode || mode === "all") return roster.length;
  const requested = Number.parseInt(mode, 10);
  return Number.isFinite(requested) ? Math.max(0, Math.min(roster.length, requested)) : roster.length;
}
