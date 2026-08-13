# LINE Official Account and Messaging API Setup / LINE 官方帳號與 Messaging API 設定

This guide creates the LINE identity that OhanaMeansFamily uses to receive group events and send reminders.

本指南建立 OhanaMeansFamily 用來接收群組事件與發送提醒的 LINE 身分。

## 1. Create an Official Account / 建立官方帳號

Go to the [LINE Official Account Manager](https://manager.line.biz/) and sign in with the LINE account that will own the bot.

前往 [LINE Official Account Manager](https://manager.line.biz/)，使用將擁有此機器人的 LINE 帳號登入。

Choose **Create a LINE Official Account**, enter an account name and the requested basic information, and complete phone verification when prompted.

選擇 **Create a LINE Official Account**，填寫帳號名稱與必要基本資料，並依畫面提示完成手機驗證。

## 2. Enable Messaging API / 啟用 Messaging API

Open the new account in LINE Official Account Manager, choose **Settings**, then **Messaging API**, and select **Enable Messaging API**.

在 LINE Official Account Manager 開啟新帳號，選擇 **Settings**，接著選擇 **Messaging API**，然後按 **Enable Messaging API**。

Select an existing provider or create one when LINE asks. Accept the terms to create the Messaging API channel.

LINE 要求選擇 Provider 時，請選擇既有 Provider 或建立新的 Provider。接受條款後即可建立 Messaging API channel。

## 3. Collect Channel Credentials / 取得 Channel 憑證

Open the channel in the [LINE Developers Console](https://developers.line.biz/console/). On the **Messaging API** tab, issue a long-lived Channel access token. On **Basic settings**, copy the Channel secret.

在 [LINE Developers Console](https://developers.line.biz/console/) 開啟 channel。在 **Messaging API** 分頁簽發 long-lived Channel access token；在 **Basic settings** 分頁複製 Channel secret。

Store these values only in environment variables:

請只將這些值儲存在環境變數中：

```text
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
```

Do not commit either credential to the repository.

請勿將任一憑證提交到 repository。

## 4. Disable Default Replies / 關閉預設回應

In LINE Official Account Manager, open **Settings** and then **Response settings**. Turn off the auto-reply message and the greeting message so they do not overlap with bot behavior.

在 LINE Official Account Manager 開啟 **Settings**，接著選擇 **Response settings**。關閉自動回應訊息與加入好友歡迎訊息，避免它們與機器人的行為重疊。

## 5. Add the Bot to a Group / 將機器人加入群組

Use the QR code or add-friend link on the Messaging API page to add the official account to LINE, then invite that account into the household group.

使用 Messaging API 頁面的 QR code 或加好友連結，先將官方帳號加為 LINE 好友，再邀請該帳號加入室友群組。

After deployment and webhook configuration, send a group message or enter `/groupid`. The server logs the group ID; save it as `LINE_GROUP_ID` in the deployment environment.

完成部署與 webhook 設定後，在群組傳送訊息或輸入 `/groupid`。伺服器 log 會顯示群組 ID；請將它儲存為部署環境的 `LINE_GROUP_ID`。

## 6. Configure the Webhook / 設定 Webhook

Deploy the application first by following the [deployment guide](DEPLOYMENT.md). Then set the channel's **Webhook URL** to `https://<your-app>.onrender.com/webhook`, verify it, and enable **Use webhook**.

請先依照 [部署指南](DEPLOYMENT.md) 部署程式。接著將 channel 的 **Webhook URL** 設為 `https://<your-app>.onrender.com/webhook`，完成驗證後開啟 **Use webhook**。

For local webhook testing, replace the Render URL temporarily with a tunnel URL that ends in `/webhook`. Restore the deployed URL when testing is complete.

本機測試 webhook 時，請暫時將 Render URL 改成以 `/webhook` 結尾的 tunnel URL。測試完成後請還原為已部署的網址。
