# 原創場外地形材質 v1

- 用途：ESMO CS/FPS 場外石脊、草地、裝卸碎石與柏油服務道路。
- 來源：2026-10-03 使用內建 `image_gen` 生成，無參考圖片，非任何官方遊戲素材；未使用 CLI fallback。
- 原始輸出：`C:/Users/ifikn/.codex/generated_images/01a0fa37-1baa-7f93-906a-c36c1a7c756e/exec-5d34fc36-5e2c-4a23-92d0-b90ad253fb46.png`。
- 專案檔案：`public/assets/fps/major-v1/terrain-albedo-atlas-v1.png`，保留原始輸出，未覆蓋其他貼圖。
- 原始尺寸：1254×1254；3,847,522 bytes。
- SHA-256：`87a704204753f3fe4f79660334da49b9685ee313e8264c0a3b0797eeec60cfb6`。
- 四格：左上石灰岩、右上碎石土、左下稀疏草地、右下柏油。
- Runtime：同一貼圖／材質供地形與場外道路共用；GPU上傳前依品質層縮至桌機1024／手機512，sRGB、mipmap、anisotropy4／2。估計額外貼圖記憶體5.33／1.33MB，非實際VRAM；需以遊戲量測核對。
- 僅 albedo，不宣稱包含真實 normal／roughness／AO；實際地形來自幾何。未使用額外動態燈。

## 生成呼叫的原始 prompt

下列為可重現素材需求的 API 文字參數；圖片內容仍須人工檢查，不能以 prompt 保證接縫完全不可見。

```text
Use case: stylized-concept. Asset type: original albedo texture atlas for ESMO competitive FPS terrain, a square 1024x1024 raster texture. Make exactly four equal square material samples in a precise 2x2 grid, touching at the center, no gutters, no frame, no labels, no text. Top-left: pale grey weathered natural limestone rock with irregular fine fissures and believable medium-scale stone variation, NOT bricks, NOT paving, no regular grid. Top-right: grey-brown compacted quarry gravel and soil, small scattered stones with restrained contrast, no big objects. Bottom-left: muted olive short wild grass with patchy dry soil, natural nonuniform distribution, viewed straight down. Bottom-right: dark cool grey worn asphalt with fine aggregate and a few subtle hairline cracks, no lane markings. Every quadrant must be independently seamless/tileable at its own boundaries. Pure flat evenly lit base-color/albedo only, orthographic surface view, no perspective, no directional lighting, no cast shadows, no vignette, no horizon, no 3D scene, no metallic highlights, no characters or objects. Realistic restrained physically plausible midtone colors and fine detail, suitable to repeat on low-poly terrain without obvious square seams. This is an original game material, do not reproduce any existing game artwork.
```
