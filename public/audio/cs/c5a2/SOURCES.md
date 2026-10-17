# C5A.2 gunfire source ledger

## 2026-10-16 Owner4G 追加

原五份 `*-prepared.wav` 與 SHA 保留。新 Major 的五把手槍改讀 `../owner4g/` 個別設計，空彈／換彈改讀同目錄三份機構錄音；含 Sonniss GDC 授權素材，不能把所有新增成品稱為 CC0。詳細來源與授權見 [Owner4G 台帳](../owner4g/SOURCES.md)。下方 Owner4F／C5A.2 為原始使用紀錄，不代表新增檔案的授權。

## 2026-10-16 Owner4F 使用方式

五份原始 `*-prepared.wav` 錄音與下列 SHA-256 均未改動，授權仍為原作者的 CC0。新版以 `src/battle/fps/fpsGunAudio.js` 為22把正式槍提供各自的播放音高（0.8–1.32）、音量與尾音長度；消音槍縮短並降低聲量。每發仍只建立一個錄音聲源，連射由真 shotAtMs 排程，不疊加合成槍聲，不取用 Valve 素材。這些是同五份合法實錄的不同播放設計，並非22份獨立原槍錄音。

換彈起止與彈藥耗盡使用本頁既有 CC0 `utility-click.wav`，讀真保存狀態與幀內毫秒時鐘，不重建另一套彈藥／時間。舊版「small pitch variation」敘述為 C5A.2 原始使用方式；本輪新增逐槍音色參數，隨機微變調仍維持原幅度。

`esmo-c4-a.wav`、`esmo-c4-b.wav`、`esmo-c4-warning.wav` 是 Owner4E 以數學波形生成的 ESMO 原創 C4 素材，來源程序保存在 review/cs-major-upgrade/tools/create_owner4e_c4_audio.mjs；不是 Valve 錄音，也不是下列五份槍聲錄音的一部分。

The five `*-prepared.wav` runtime files are direct prepared firearm recordings from **The Free Firearm Sound Library**
by Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney. The source library
is released under CC0 1.0 / public-domain dedication and explicitly permits
personal and commercial use. No Counter-Strike or Valve audio is used.

- Original library: https://opengameart.org/content/the-free-firearm-sound-library
- Runtime archive: https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z
- Selection metadata: `Prepared Master Sheet.csv` inside that archive
- License: CC0 1.0 (the project keeps the source record and author credit even though attribution is waived)
- Acquisition date: 2026-08-28

| Runtime file | Source recording | SHA-256 |
|---|---|---|
| `pistol-prepared.wav` | 1911 .45 near (`A_42P.wav`) | `8e84438e771c157155a6a1ff47a6a7a7d81b6f39b185d41e426c57337a82254a` |
| `smg-prepared.wav` | Carl Gustav M45 9mm near (`G_31P.wav`) | `5982c6c2fa44545b750ba6217ed57797a6a15c02f5c9943ac0e99e5f3ab2b158` |
| `rifle-prepared.wav` | AK-47 7.62x39 near (`C_28P.wav`) | `e0934c1d79192d2216db62fdf6ab57bf9d5d585267af367a1cfb21f0972a537d` |
| `sniper-prepared.wav` | Mosin Nagant 7.62x54 near (`M_21P.wav`) | `970ed2322ba61579dc8afaefb4f25e6ae791a3acb1e6e23372ea948cfe2a97b3` |
| `shotgun-prepared.wav` | Benelli Nova 12 gauge near (`O_21P.wav`) | `5661d0625e4634f19e6e316c13693b80c8e28cd9f716cf9c75c465153ae40815` |

The runtime plays one trimmed prepared-recording region through one
`AudioBufferSourceNode` for each authoritative shot. Web Audio applies only
small pitch variation, gain and distance attenuation; it does not reconstruct
gunfire from filtered layers and has no oscillator/noise gunfire fallback.

The older five `.mp3` files in this folder are retained only as provenance for
the earlier blast-only audit. They are not referenced by the Battle runtime.

## C5A.2 utility presentation source ledger

Utility cues use single recorded CC0 sources. The runtime applies only gain,
distance attenuation, a small deterministic pitch variation and stereo
spatialisation; it does not synthesize grenade or C4 cues.

- `utility-he.wav`: `dull_explosion.wav`, Spring Spring, OpenGameArt, CC0 1.0
- `utility-flash.wav`: `flash_bang.wav`, teeeece, OpenGameArt, CC0 1.0
- `utility-smoke.ogg`: `compressed_gas_leak.ogg`, 0new4y, OpenGameArt, CC0 1.0
- `utility-throw.wav`: `snd_throw1.wav`, Spring Spring, OpenGameArt, CC0 1.0
- `utility-bounce.wav`: `tap_stone.wav`, Spring Spring, OpenGameArt, CC0 1.0
- `utility-footstep.wav`: `snd_footsteps1.wav`, Spring Spring, OpenGameArt, CC0 1.0
- `utility-click.wav`: `click.wav`, Spring Spring, OpenGameArt, CC0 1.0
- `utility-tick.wav`: `tick.wav`, Spring Spring, OpenGameArt, CC0 1.0

Source pages:

- https://opengameart.org/content/various-sound-effects-0
- https://opengameart.org/content/flash-bang-sound
- https://opengameart.org/content/compressed-gas-leak-sfx

No Valve or Counter-Strike original audio is used.
