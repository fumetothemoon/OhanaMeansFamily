# OhanaMeansFamily 值日生提醒機器人

功能：

- 每週輪值提醒（3組輪流：我 / Jane+范老師 / 詠晴+阿升）
- 6項值日工作各自獨立勾選回報，全部完成當週就不再提醒
- 週一 17:00 發本週任務、週三 17:00 / 週日 17:00 提醒尚未完成的項目
- 全體共用的「當月待辦清單」（跟房東的事、要一起買的東西等），任何人都能新增/標記完成
- 每月 1 號提醒還沒完成的待辦事項

**架構（零成本版）**：排程改由 **GitHub Actions**（完全免費）在固定時間打你機器人的網址觸發提醒，
所以主機本身不需要 24 小時不睡覺，可以直接用會自動休眠的免費方案（例如 Render 免費方案）。
被打到的時候如果剛好在睡，它會自動醒來處理，之後幾秒內就正常回應。
LINE 的訊息（按「完成」按鈕、打指令）平常互動不多，睡著時第一次會晚個幾十秒回應，之後就正常，
對值日提醒這種用途完全夠用。

唯一要注意：GitHub Actions 的排程時間偶爾會有數分鐘的延遲（官方排程機制本來就這樣，免費也沒辦法要求準點），
不是每次都精準卡在 17:00:00，但落在 17:00~17:10 左右很正常，不影響使用。

---

## English Description

**OhanaMeansFamily** is a LINE group chatbot that reminds roommates about their weekly chore duties.

**Features:**

- Weekly chore-duty rotation reminders across 3 groups (Me / Jane+Fan Laoshi / Yongqing+Asheng), rotating automatically every week
- 6 individual chore tasks, each reported/checked off separately; once all 6 are done for the week, reminders stop for that cycle
- Automatic reminders sent Monday 17:00 (new week's task list), Wednesday 17:00, and Sunday 17:00 (only for tasks still outstanding)
- A shared monthly to-do list for the whole household (e.g. things to discuss with the landlord, shared purchases like appliances/furniture) — anyone can add items, list them, or mark them done
- Monthly reminder (1st of the month) for any still-open to-do items

**Architecture (zero-cost setup):** Scheduling is handled by **GitHub Actions** (free), which calls dedicated `/cron/*` endpoints on the bot's server at the scheduled times. This means the server itself doesn't need to run 24/7 — it can sit on a free tier that sleeps when idle (e.g. Render's free plan). When a scheduled job or a LINE webhook event hits a sleeping server, it wakes up automatically within tens of seconds, which is perfectly fine for this kind of low-traffic household use case.

One caveat: GitHub Actions' free scheduler can have a delay of a few minutes, so reminders may land a bit after the exact time (e.g. 17:00–17:10) rather than to the second — this doesn't affect usability.

See `README.md`'s Chinese sections below for full, step-by-step setup instructions (LINE Official Account creation, Messaging API activation, Render deployment, GitHub Actions configuration, and in-chat bot commands). The setup steps are written in Traditional Chinese since that's the language the household group chat uses, but all code, config, and comments in the source files are written to be readable regardless of language — configuration only requires editing plain values in `config.js` (names, tasks, dates, times).

---

## 一、申請 LINE 官方帳號 + 啟用 Messaging API（約 10 分鐘）

LINE 現在的流程改成要先建立「LINE 官方帳號」，再從官方帳號後台啟用 Messaging API，
不能像以前一樣直接在 Developers Console 建立。步驟如下：

1. 前往 [LINE 官方帳號開通頁面](https://www.linebiz.com/tw/entry/) 或直接到
   [LINE Official Account Manager](https://manager.line.biz/)，用你的 LINE 帳號登入
2. 按「建立帳號 / Create a LINE Official Account」，填基本資料：
   - 帳號名稱：例如「值日生小幫手」（隨便取，不影響功能）
   - 國家、產業類別：隨便選一個接近的即可（例如「其他」）
   - 需要用手機做一次簡訊驗證
3. 建立完成後，登入 **LINE Official Account Manager**（[manager.line.biz](https://manager.line.biz/)），
   選到剛剛建立的帳號
4. 右上角「設定 / Settings」→ 左側選單找「Messaging API」→ 按「啟用 Messaging API / Enable Messaging API」
   - 會要你選一個 **Provider**（第一次用的話會叫你新建一個，名稱隨意，例如「我們家」）
   - 同意條款後即完成啟用
5. 啟用後，回到 [LINE Developers Console](https://developers.line.biz/console/)（用同一組帳號登入），
   會看到剛剛那個 Provider 底下已經多了一個 **Messaging API channel**，點進去：
   - 到 **Messaging API** 分頁，找到 **Channel access token**，按「Issue」產生一組長期 token，複製起來（等等會用到）
   - 到 **Basic settings** 分頁，複製 **Channel secret**（等等會用到）
6. 回到 LINE Official Account Manager 的「設定 → 回應設定」，把「自動回應訊息」「加入好友歡迎訊息」都關掉，
   避免干擾你的機器人訊息

## 二、把機器人加進你們的 LINE 群組

1. 在 Messaging API 分頁可以看到這個官方帳號的 QR code / 加好友連結
2. 先用自己的 LINE 加這個官方帳號好友
3. 打開你們五人的群組 → 設定 → 邀請 → 把這個官方帳號邀請進群組

## 三、把程式碼放到 GitHub

1. 到 [github.com](https://github.com) 新增一個 **private** repository（例如叫 `OhanaMeansFamily`）
2. 把這個資料夾的內容 push 上去（GitHub 網頁可以直接拖曳上傳檔案，不用會 git 指令也行）

## 四、部署後端程式（推薦 Render 免費方案即可，因為現在不需要 24 小時常駐了）

1. 到 [render.com](https://render.com) 用 GitHub 登入
2. New → Web Service → 選你剛剛的 `OhanaMeansFamily` repo
3. 設定：
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
4. 到 Environment 分頁，新增以下環境變數：
   - `LINE_CHANNEL_ACCESS_TOKEN` = 剛剛複製的 token
   - `LINE_CHANNEL_SECRET` = 剛剛複製的 secret
   - `LINE_GROUP_ID` = 先留空，下一步會拿到
   - `CRON_SECRET` = 自己隨便打一串英數字亂碼（例如用密碼產生器產生），記下來
5. 部署完成後會拿到一個網址，例如 `https://OhanaMeansFamily-xxxx.onrender.com`
6. 把「網址 + `/webhook`」（例如 `https://OhanaMeansFamily-xxxx.onrender.com/webhook`）填回
   LINE Developers Console 的 **Messaging API → Webhook URL**，並打開「Use webhook」

> 免費方案閒置一段時間會睡著，被叫醒時第一個請求可能要等 30~50 秒，之後就正常，這是免費方案的正常現象。

### 取得 GROUP_ID

1. 部署好、Webhook 設定好之後，在你們的群組裡隨便發一句話（或輸入 `/groupid`）
2. 到 Render 的 Logs 裡會看到一行 `目前群組 groupId = Cxxxxxxxx...`，把這串複製起來
3. 回到 Render 的 Environment，把 `LINE_GROUP_ID` 設成這個值，儲存後它會自動重新部署

## 五、設定 GitHub Actions 排程（負責準時觸發提醒，完全免費）

1. 回到你的 GitHub repo → **Settings → Secrets and variables → Actions**
2. 新增兩個 repository secrets：
   - `APP_URL` = 你的 Render 網址，**不要**加最後的斜線，例如 `https://OhanaMeansFamily-xxxx.onrender.com`
   - `CRON_SECRET` = 跟第四步驟設的 `CRON_SECRET` 完全一樣的那串亂碼
3. 這樣就完成了！`.github/workflows/reminders.yml` 已經寫好排程時間
   （週一/三/日 17:00 台灣時間 + 每月 1 號 09:00 台灣時間）
4. 想先測試看看的話，到 GitHub repo 的 **Actions** 分頁 → 左邊選 `OhanaMeansFamily reminders`
   → 右邊 **Run workflow** → 選一個要測試的項目（例如 `weekly-kickoff`）→ Run，
   幾秒後群組就應該會收到訊息

## 六、修改成你們家實際的設定

打開 `config.js`：

- `ROTATION_GROUPS`：確認 3 組分法跟成員名字正確
- `ROTATION_START_MONDAY`：填「現在這一週」的週一日期，代表這週算第一組值日
- `DUTY_TASKS`：六項工作內容（已經照你提供的填好）
- `SCHEDULE`：提醒時間，預設週一/三/日 17:00

改完存檔、重新部署，機器人就會照新設定運作。

## 七、群組裡可以用的指令

- `/狀態`：查看本週值日進度
- `/todo` 或 `/待辦`：查看當月待辦清單
- `/todo 新增 內容`：新增一項待辦，例如 `/todo 新增 跟房東反應廚房水管漏水`
- `/todo 完成 3`：把編號 3 的待辦標記完成
- `/groupid`：查詢目前群組的 groupId（設定時用）

## 本機測試

```bash
npm install
LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_CHANNEL_SECRET=xxx npm start
```

需要用 [ngrok](https://ngrok.com/) 之類的工具把本機的 `/webhook` 暴露到外網，
才能在 LINE Developers Console 設定 Webhook URL 做測試。
