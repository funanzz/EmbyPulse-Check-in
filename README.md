# EmbyPulse Check-in

为 EmbyPulse 用户门户提供多实例自动签到和可选的积分续期。

当前提供 **Loon 插件 v1.1.0**。默认按设备时间每天 **08:00** 执行，也可以在 Loon 中手动运行 **EmbyPulse 立即签到**。插件每次运行时直接登录各站点，通知会显示站点域名。

需要 **Loon 3.5.1（Build 983）或更高版本**。站点须提供 EmbyPulse 的用户门户和积分签到接口。使用用户门户的 HTTPS 地址，也可以填写域名或带端口的地址。 [EmbyPulse 项目](https://github.com/amlkiller/emby-pulse)

## 安装

[在 Loon 中安装 EmbyPulse Check-in](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Ffunanzz%2FEmbyPulse-Check-in%2Frefs%2Fheads%2Fmain%2FEmbyPulse.plugin)

## 配置实例

在插件参数的「实例列表」中，每个实例依次填写 HTTPS 地址、用户名和密码。字段用逗号隔开，实例用分号隔开，中英文标点都可以。

```text
https://pulse1.example.com，用户名1，密码1；https://pulse2.example.com，用户名2，密码2；
```

如果用户名或密码含有逗号、分号、双引号或首尾空格，用英文双引号包裹该字段，字段里的英文双引号写成两个。例如 `https://pulse1.example.com,user1,"abc;d,""ef"`。每个门户地址填一组凭据。账号密码保存在 Loon 的插件参数里，分享配置或截图前请遮盖。

## 运行与升级

开启 Loon 脚本功能，运行「EmbyPulse 立即签到」，按站点查看结果。保持 Loon 运行以执行定时任务。插件通过 HTTPS 直连门户登录，无需配置 MitM 或在 Safari 登录。

从 v1.0.0 升级时，先刷新 Loon 中的插件，再将旧实例列表替换为新格式。如果原先专门为本插件添加了 MitM 域名，现在可以移除这些条目。

## 自动续期

「签到后自动续期」默认关闭。开启后，所有已配置实例在确认今日签到后都尝试用积分续期。手动运行和定时执行都适用。

脚本在签到后刷新商城和余额。第一件是续期商品且积分足够时才兑换。每个站点的账号按北京时间记录当天是否已发起兑换。超时或兑换结果不明确时，当天暂停再次提交，可到门户的积分明细核对。
