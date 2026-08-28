# C5A.2 gunfire source ledger

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
