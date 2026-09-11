# Supabase 設定清單（B1D.1 · 只列需要「人」做的事）

> 2026-09-11．程式端（B1D）已經完成並上線，**缺的只有憑證**。
> 這份清單裡的每一項都**必須由 Owner 在瀏覽器裡手動完成**，我做不到。
> 全部做完之後告訴我，我就能跑真正的 Remote E2E（含兩個帳號的 RLS 實測）。
>
> ⚠ 全程**不需要** service-role key。任何頁面叫你複製 `service_role`，
> 那一把**不要**給我、也不要放進這個 repo —— 它繞過所有權限檢查。

---

## 你要做的 7 件事

### 1. 建立 Supabase 專案

<https://supabase.com/dashboard> → **New project**

- Organization：選你的
- Name：`esmo`（隨意）
- Database Password：**自己存好**（這份密碼我們不會用到，但重設很麻煩）
- Region：選離玩家近的（台灣玩家建議 `Northeast Asia (Tokyo)`）

建好之後等它跑完初始化（約 1–2 分鐘）。

---

### 2. 執行資料表 migration

左側 **SQL Editor** → **New query** → 把這個檔案的內容整份貼上去 → **Run**：

```
supabase/migrations/0001_career_saves.sql
```

跑完應該看到 `Success. No rows returned`。

**怎麼確認成功**：左側 **Table Editor** 應該看得到 `profiles` 與 `career_saves`
兩張表，而且兩張表的名稱旁邊都有 **RLS enabled** 的標記。

⚠ 如果沒有那個標記，**先不要往下做** —— 那代表資料是公開的。

---

### 3. 設定 Google 登入

這一步有**兩個地方**要設，順序不能反。

**3a. 先在 Supabase 拿到 callback 網址**

Supabase → **Authentication** → **Providers** → **Google** → 打開開關。
展開後會看到一行 **Callback URL (for OAuth)**，長得像：

```
https://<你的專案代號>.supabase.co/auth/v1/callback
```

**先複製它**，不要關掉這個頁面。

**3b. 去 Google Cloud 建一組 OAuth 用戶端**

<https://console.cloud.google.com/apis/credentials>

1. 建立（或選一個）專案
2. 若第一次用：先設定 **OAuth consent screen**
   - User Type：**External**
   - App name / 支援信箱 / 開發者信箱：填一填即可
   - 發布狀態先留 **Testing** 沒關係，但要把你自己的 Google 帳號
     加進 **Test users**，否則登入會被擋
3. **Create Credentials** → **OAuth client ID**
   - Application type：**Web application**
   - **Authorized redirect URIs**：貼上 3a 複製的那串 callback URL
4. 建好會給你 **Client ID** 與 **Client Secret**

**3c. 回 Supabase 填進去**

把 Client ID 與 Client Secret 貼進 Supabase 的 Google provider 欄位 → **Save**。

---

### 4. 設定 Site URL 與 Redirect URLs

Supabase → **Authentication** → **URL Configuration**

- **Site URL**：`https://rayhuang0323.github.io/ESMO-/`
- **Redirect URLs**：把下面兩行都加進去
  ```
  https://rayhuang0323.github.io/ESMO-/
  http://localhost:5173/ESMO-/
  ```
  （第二行是本機開發用。實際 port 若不是 5173，`npm run dev` 啟動時會印出來。）

⚠ 少了這一步，Google 登入會走到最後一步才失敗，而且錯誤訊息不明顯。

---

### 5. 取得專案 URL 與 anon key

Supabase → **Project Settings** → **API**（新版介面可能在 **API Keys**）

要複製兩個值：

| 欄位 | 長相 |
|---|---|
| **Project URL** | `https://xxxxxxxxxxxxxxxx.supabase.co` |
| **anon / public**（新版叫 **publishable**） | 一長串，開頭通常是 `eyJ...` 或 `sb_publishable_...` |

⚠ **同一頁上還有一把 `service_role` / `secret`。不要複製它。**
它繞過所有權限檢查，放進前端等於把整個資料庫公開。
（程式裡有偵測器：真的貼錯會被擋下來，但最好根本不要碰。）

---

### 6. 本機 `.env.local`

在專案根目錄建立 `.env.local`（`.gitignore` 已經擋著它，不會進版控）：

```
VITE_SUPABASE_URL=你在第 5 步複製的 Project URL
VITE_SUPABASE_ANON_KEY=你在第 5 步複製的 anon / publishable key
VITE_SUPABASE_REDIRECT_URL=http://localhost:5173/ESMO-/
VITE_SUPABASE_ALLOW_ANONYMOUS=1
```

欄位說明都在 `.env.example` 裡。最後一行是**本機**才開的訪客登入
（正式站不要開，理由見該檔）。

**做完這一步就可以叫我跑 Remote E2E 了** —— 第 7 步是「正式站也要能用」，
可以晚一點再做。

---

### 7. 正式站（GitHub Pages）的設定

GitHub repo → **Settings** → **Secrets and variables** → **Actions**
→ **Variables** 分頁 → **New repository variable**，新增兩個：

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | 同第 5 步 |
| `VITE_SUPABASE_ANON_KEY` | 同第 5 步 |

⚠ **放 Variables，不要放 Secrets。** 理由見下面那段——這兩個值最後一定會
出現在公開的 bundle 裡，放進 Secrets 會給人一種「它被保護著」的錯覺。

⚠ **設定完之後還需要我改一行 `deploy.yml`**（把這兩個變數傳給 build），
那是程式改動不是後台設定，等你說可以我再做。**在那之前正式站仍然是
「沒有開放雲端存檔」的狀態，而且一切照常運作。**

---

## 兩件你應該先知道的事

**① anon key 一定會被看到，這是設計如此**

`VITE_*` 的值會被打包進 JavaScript，任何人打開 devtools 都看得到。
anon key 本來就是設計成公開的 —— 資料的保護**完全來自 RLS**
（第 2 步那份 migration），不是來自把 key 藏起來。

所以第 2 步的 **RLS enabled 標記**比什麼都重要。

**② 有帳號 ≠ 防作弊**

登入之後我們知道「這是同一個人」，存檔也只有本人改得動。
但**數值仍然是在玩家自己的瀏覽器裡算出來的** —— 一個人要改自己的存檔，
還是改得動。競技可信度要等之後的 Server Authority，不在這一輪。

畫面上也是這樣寫的，不會講成「已經防作弊」。

---

## 做完之後

告訴我「Supabase 設定好了」，我會跑真正的 Remote E2E：

- A 用 Google 登入成功
- B 建立生涯 → **真的寫進 Postgres**
- C reload → 從雲端還原同一份，逐值比對
- D 改訓練 → 同步 → 讀回來仍在
- E 確認雲端那份**不含**季賽 timeline 與重播證據
- F 雲端故障時本機存檔不丟失
- G **兩個測試帳號實測 RLS**：A 讀寫 A ✓、B 讀寫 B ✓、A 讀寫 B ✗、B 讀寫 A ✗
- H 照實回報「這不是防作弊」

⚠ 其中 **G 是最重要的一條**。它是目前唯一「寫好了但從來沒有在真環境驗證過」
的安全機制 —— SQL 寫得對不代表它真的生效了。

⚠ 第 7 步（正式站）還需要我改一行 workflow，那是另一件事。
