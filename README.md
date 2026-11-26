# EmbyPulse Check-in

为 EmbyPulse 用户门户提供多实例、多账号自动签到和可选的积分续期。

**v1.2.2** 支持 Loon 和 Quantumult X。默认按设备时间每天 **08:00** 执行，也可以手动运行。每次通过 HTTPS 直连各站点登录，同一站点填了多个账号时，通知会按填写顺序显示账号序号。

站点须提供 EmbyPulse 的用户门户和积分签到接口。使用用户门户的 HTTPS 地址，也可以填写域名或带端口的地址。 [EmbyPulse 项目](https://github.com/amlkiller/emby-pulse)

## Loon

[在 Loon 中安装 EmbyPulse Check-in](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Ffunanzz%2FEmbyPulse-Check-in%2Frefs%2Fheads%2Fmain%2FEmbyPulse.plugin)

需要 Loon 3.5.1（Build 983）或更高版本。

在插件参数的「实例列表」中，每个实例依次填写 HTTPS 地址、用户名和密码。字段用逗号隔开，实例用分号隔开，中英文标点都可以。

```text
https://pulse1.example.com，用户名1，密码1；https://pulse2.example.com，用户名2，密码2；
```

如果用户名或密码含有逗号、分号、双引号或首尾空格，用英文双引号包裹该字段，字段里的英文双引号写成两个。例如 `https://pulse1.example.com,user1,"abc;d,""ef"`。同一门户的多个账号各填一组。账号密码保存在 Loon 的插件参数里，分享配置或截图前请遮盖。

插件参数中的「启用插件」默认开启。关闭后，每日签到和立即签到都会停用，实例列表和其他设置会保留。

开启 Loon 脚本功能，运行「EmbyPulse 立即签到」，按站点查看结果。保持 Loon 运行以执行定时任务。插件通过 HTTPS 直连门户登录，无需配置 MitM 或在 Safari 登录。

从 v1.0.0 升级时，先刷新 Loon 中的插件，再将旧实例列表替换为新格式。如果原先专门为本插件添加了 MitM 域名，现在可以移除这些条目。

## Quantumult X

[一键添加 QX 任务库](https://quantumult.app/x/open-app/ui?module=gallery&type=task&action=add&content=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Ffunanzz%2FEmbyPulse-Check-in%2Fmain%2Fgallery.json%22%5D)

需要 QX Build 934 或更高版本。添加任务库后，在 QX 里添加并编辑「EmbyPulse 每日签到」。也可以把 [EmbyPulse.conf](EmbyPulse.conf) 的任务行复制到 `[task_local]`。

在任务脚本地址里直接填写 `sites=`。一组用 `~` 隔开地址、用户名和密码，多组用英文分号隔开。同一门户的多个账号各填一组。把 `renewAll` 放在 `sites` 前面。

```text
#renewAll=false&sites=https://pulse1.example.com~user1~pass1;https://pulse2.example.com~user2~pass2
```

含有逗号、分号、波浪号、井号、百分号、双引号或空格等特殊字符时，可以沿用 `#instances=编码后的实例列表&renewAll=false`。旧格式将 `地址,用户名,密码;` 的整段列表进行 URL 编码，字段的引号用法与 Loon 相同。账号密码填在自己设备的任务配置里，分享配置或截图前请遮盖。

填好后启用任务，也可以从任务列表手动运行一次。用任务开关暂停或恢复所有已配置实例。

## 自动续期

自动续期默认关闭。Loon 打开「签到后自动续期」，QX 把任务里的 `renewAll=false` 改为 `renewAll=true`。开启后，所有已配置实例在确认今日签到后都尝试用积分续期。手动运行和定时执行都适用。

脚本在签到后刷新商城和余额。第一件是续期商品且积分足够时才兑换。每个站点的账号按北京时间记录当天是否已发起兑换。超时或兑换结果不明确时，当天暂停再次提交，可到门户的积分明细核对。

同一账号同时用两个客户端签到时，只在其中一个开启自动续期。兑换记录保存在各客户端本地。
