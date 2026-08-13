# Deployment / 部署

This guide deploys OhanaMeansFamily with Upstash Redis for persistent state, Render for the Node.js service, and GitHub Actions for scheduled reminders.

本指南使用 Upstash Redis 儲存持久狀態、Render 執行 Node.js 服務，以及 GitHub Actions 發送排程提醒，來部署 OhanaMeansFamily。

Complete [LINE setup](LINE_SETUP.md) before configuring the service.

設定服務前，請先完成 [LINE 設定](LINE_SETUP.md)。

## 1. Create an Upstash Redis Database / 建立 Upstash Redis 資料庫

Sign in to [Upstash](https://upstash.com/) and create a Redis database. The free Regional tier is sufficient for this bot; select a region near the household.

登入 [Upstash](https://upstash.com/) 並建立 Redis database。此機器人使用免費 Regional 方案即可；請選擇距離住家較近的 region。

From the database's **REST API** section, copy the REST URL and REST token.

在 database 的 **REST API** 區塊複製 REST URL 與 REST token。

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Redis keeps chore and to-do data available across application restarts and redeployments.

Redis 會在程式重新啟動或重新部署後保留值日與待辦資料。

## 2. Deploy to Render / 部署至 Render

Push this repository to GitHub, then sign in to [Render](https://render.com/) and create a **Web Service** from the repository.

將此 repository push 到 GitHub，接著登入 [Render](https://render.com/) 並從 repository 建立 **Web Service**。

Use these service settings:

請使用以下服務設定：

| Setting       | Value                            | 設定         | 值                    |
| ------------- | -------------------------------- | ------------ | --------------------- |
| Runtime       | Node                             | 執行環境     | Node                  |
| Build Command | `npm install`                    | 建置指令     | `npm install`         |
| Start Command | `npm start`                      | 啟動指令     | `npm start`           |
| Instance Type | Free or a suitable paid instance | 執行個體類型 | Free 或合適的付費方案 |

Set the following environment variables in Render. Use values from the LINE and Upstash setup steps, and generate a strong random value for `CRON_SECRET`.

在 Render 設定以下環境變數。LINE 與 Upstash 的值請使用前述設定步驟取得的內容，並為 `CRON_SECRET` 產生強度足夠的隨機值。

```text
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
LINE_GROUP_ID
CRON_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

`LINE_GROUP_ID` can remain empty until the bot receives its first group event. Follow the [LINE setup guide](LINE_SETUP.md) to retrieve it, then add it in Render and allow the service to redeploy.

在機器人收到第一個群組事件前，`LINE_GROUP_ID` 可以保持空白。請依照 [LINE 設定指南](LINE_SETUP.md) 取得它，然後在 Render 新增該值並讓服務重新部署。

After deployment, note the service URL, for example `https://<your-app>.onrender.com`, and configure it as the LINE webhook URL.

部署完成後，記下服務網址，例如 `https://<your-app>.onrender.com`，並將它設定為 LINE webhook URL。

Render's free service may sleep while idle. The next request wakes it, which can delay that request briefly; this is expected behavior for low-traffic use.

Render 免費服務在閒置時可能會休眠。下一個請求會喚醒服務，該請求可能會短暫延遲；對低流量使用情境而言這是預期行為。

## 3. Configure GitHub Actions / 設定 GitHub Actions

In the GitHub repository, open **Settings** > **Secrets and variables** > **Actions** and add these repository secrets:

在 GitHub repository 開啟 **Settings** > **Secrets and variables** > **Actions**，新增以下 repository secrets：

| Secret        | Value                                       | 說明                           |
| ------------- | ------------------------------------------- | ------------------------------ |
| `APP_URL`     | Render service URL without a trailing slash | 不含結尾斜線的 Render 服務網址 |
| `CRON_SECRET` | The exact same value configured in Render   | 與 Render 設定完全相同的值     |

The workflow at `.github/workflows/reminders.yml` calls the protected `/cron/*` endpoints for the weekly and monthly reminders.

位於 `.github/workflows/reminders.yml` 的 workflow 會呼叫受保護的 `/cron/*` 端點，發送每週與每月提醒。

GitHub Actions schedules can run a few minutes after their nominal time. This timing variation is normal for scheduled workflows.

GitHub Actions 排程可能會在預定時間後數分鐘執行。這種時間差是排程 workflow 的正常行為。

## 4. Verify the Deployment / 驗證部署

Open the Render service URL and confirm it returns `OhanaMeansFamily is running`.

開啟 Render 服務網址，確認它回傳 `OhanaMeansFamily is running`。

In the LINE group, run `/狀態` and confirm the bot responds with the expected on-duty group.

在 LINE 群組輸入 `/狀態`，確認機器人回應預期的本週值日組別。

To test a scheduled workflow from GitHub, open **Actions**, select **OhanaMeansFamily reminders**, choose **Run workflow**, and select a reminder endpoint. Use a test group when validating outbound messages.

若要從 GitHub 測試排程 workflow，請開啟 **Actions**，選擇 **OhanaMeansFamily reminders**，按 **Run workflow**，並選擇提醒端點。驗證對外訊息時請使用測試群組。
