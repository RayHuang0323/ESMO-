// ============================================================================
//  platform/online/signedSnapshot.js — SignedSquadSnapshot.v1（Online Foundation v1）
//
//  ── 為什麼需要這一層 ────────────────────────────────────────────────────────
//  `SquadSnapshot.v1` 的 `hash` 是 FNV-1a（變更偵測），**不是**簽章：
//  它擋得住意外改動，擋不住蓄意偽造（任何人都能改完值再重算雜湊）。
//  線上要讓 A 相信「B 的陣容就是這些值」，必須有**只有伺服器做得出來**的東西 ⇒ 簽章。
//
//  ── 契約 ────────────────────────────────────────────────────────────────────
//    · 演算法**只允許 Ed25519**（`alg:"none"`、HMAC、RSA 一律拒）。
//    · 簽的是**整份正規化信封**（`stableStringify`，排除 `signature.value` 本身），
//      ⚠ 不是簽 8 位 FNV 雜湊——32-bit FNV 可以輕易造碰撞，簽一個可碰撞的摘要等於沒簽。
//    · `issuedAtServerMs` 是**伺服器**時刻（ServerTime），不是客戶端時間、不是生涯日。
//    · 驗章需要：信任金鑰表（keyId → 公鑰）＋ 注入的 verify 函式。缺任何一個 ⇒ 拒絕，不猜。
//    · 內層 `SquadSnapshot` 的雜湊也要對（信封完整但內層被改 ⇒ 拒）。
//
//  ⚠ **客戶端永遠不簽**：本檔與整個 `src/` 沒有私鑰、沒有簽章函式。
//    私鑰只存在伺服器（Edge Function／後端環境變數），verifier 用 node:crypto 扮演伺服器。
//  ⚠ 本機 mock authority 產出的快照**未簽**（`LOCAL_UNSIGNED`），而且這一層
//    **不提供**「沒後端所以放行」的開關。沒簽就是沒簽。
//
//  純函式：不 import React / zustand / localStorage / Supabase SDK，不讀時鐘。
// ============================================================================
import { snapshotHashOf, stableStringify, SQUAD_SNAPSHOT_VERSION } from "../contracts/squadSnapshot.js";

export const SIGNED_SNAPSHOT_VERSION = "SignedSquadSnapshot.v1";
export const SIGNATURE_ALGS = Object.freeze(["Ed25519"]);

/** 本機 authority 的狀態宣告：沒有簽章、不可信。 */
export const LOCAL_UNSIGNED = Object.freeze({ alg: null, trusted: false });

const fin = (v) => typeof v === "number" && Number.isFinite(v);

/** 信封形狀與內層快照完整性（不含簽章驗證）。 */
export function validateEnvelopeShape(env) {
  const errors = [];
  if (!env || typeof env !== "object") return { ok: false, errors: [{ code: "invalid", message: "信封不是物件" }] };
  if (env.schema !== SIGNED_SNAPSHOT_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${SIGNED_SNAPSHOT_VERSION}` });
  const p = env.payload;
  if (!p || p.schema !== SQUAD_SNAPSHOT_VERSION) errors.push({ code: "payload", message: "信封內沒有 SquadSnapshot" });
  else if (p.hash !== snapshotHashOf(p)) errors.push({ code: "payload_hash", message: "內層快照雜湊不符——內容被改過" });
  if (!env.issuedBy) errors.push({ code: "issuer", message: "缺少簽發者" });
  if (!fin(env.issuedAtServerMs)) errors.push({ code: "issued_at", message: "缺少伺服器簽發時刻" });
  if (!env.signature || typeof env.signature !== "object") errors.push({ code: "signature", message: "缺少簽章" });
  else {
    if (!SIGNATURE_ALGS.includes(env.signature.alg)) errors.push({ code: "alg", message: `不允許的簽章演算法：${env.signature.alg}` });
    if (!env.signature.keyId) errors.push({ code: "key_id", message: "缺少金鑰識別碼" });
  }
  return { ok: !errors.length, errors };
}

/**
 * 建立一份**待伺服器簽章**的信封。
 * ⚠ 這一支客戶端也能呼叫（例如組出要送審的內容），但沒有私鑰就產不出有效的 `signature.value`。
 */
export function createUnsignedEnvelope({ snapshot, issuedBy, issuedAtServerMs, keyId } = {}) {
  const env = {
    schema: SIGNED_SNAPSHOT_VERSION,
    payload: snapshot ? JSON.parse(JSON.stringify(snapshot)) : null,
    issuedBy: issuedBy ?? null,
    issuedAtServerMs,
    signature: { alg: SIGNATURE_ALGS[0], keyId: keyId ?? null, value: null },
  };
  const v = validateEnvelopeShape(env);
  return { ok: v.ok, envelope: v.ok ? env : null, errors: v.errors };
}

/** 要簽／要驗的位元組：整份信封（排除 `signature.value`），決定性序列化。 */
export function signingBytes(env) {
  const { signature, ...rest } = env ?? {};
  const body = { ...rest, signature: { alg: signature?.alg ?? null, keyId: signature?.keyId ?? null } };
  return new TextEncoder().encode(stableStringify(body));
}

/** 伺服器簽完之後把簽章值掛上（純函式，回傳新物件）。 */
export function attachSignature(env, valueB64) {
  return { ...env, signature: { ...env.signature, value: valueB64 } };
}

/**
 * 驗章。
 * @param {object} env
 * @param {{trustedKeys:Object<string,{alg:string, publicKeyJwkX:string}>, verify:Function}} opts
 *   `verify(bytes, signatureB64, keyEntry) → Promise<boolean>`（見 `webCryptoEd25519Verifier`）
 */
export async function verifySignedSnapshot(env, { trustedKeys = null, verify = null } = {}) {
  const shape = validateEnvelopeShape(env);
  if (!shape.ok) return { ok: false, errors: shape.errors };
  if (typeof verify !== "function") return { ok: false, errors: [{ code: "verifier", message: "沒有驗章函式" }] };
  const key = trustedKeys?.[env.signature.keyId];
  if (!key) return { ok: false, errors: [{ code: "untrusted_key", message: `不信任的金鑰：${env.signature.keyId}` }] };
  if (key.alg !== env.signature.alg) return { ok: false, errors: [{ code: "alg_mismatch", message: "金鑰演算法與簽章不符" }] };
  if (!env.signature.value) return { ok: false, errors: [{ code: "unsigned", message: "信封未簽章" }] };
  let good = false;
  try { good = await verify(signingBytes(env), env.signature.value, key); } catch { good = false; }
  return good ? { ok: true, errors: [] } : { ok: false, errors: [{ code: "bad_signature", message: "簽章驗證失敗" }] };
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * WebCrypto 的 Ed25519 驗章器（瀏覽器與 Node 20+ 共用）。
 * @param {SubtleCrypto} subtle  `globalThis.crypto.subtle`
 */
export function webCryptoEd25519Verifier(subtle) {
  return async (bytes, sigB64, keyEntry) => {
    if (!subtle) return false;
    const key = await subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: keyEntry.publicKeyJwkX },
      { name: "Ed25519" }, false, ["verify"]);
    return subtle.verify({ name: "Ed25519" }, key, b64ToBytes(sigB64), bytes);
  };
}
