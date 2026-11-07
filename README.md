# EmbyPulse Check-in

为 EmbyPulse 用户门户提供多实例自动签到和可选的积分续期。

当前提供 **Loon v1.0.0**。默认按设备时间每天 **08:00** 执行，也可以在 Loon 中手动运行 **EmbyPulse 立即签到**。每个站点独立保存会话和兑换记录，通知会显示站点域名。

需要 **Loon 3.5.1（Build 983）或更高版本**。站点须提供 EmbyPulse 的个人中心与积分签到接口。填写门户的 HTTPS 地址，例如 `https://pulse1.example.com`，也可以填写域名或带端口的地址。 [EmbyPulse 项目](https://github.com/amlkiller/emby-pulse)

## 安装

[在 Loon 中安装 EmbyPulse Check-in](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Ffunanzz%2FEmbyPulse-Check-in%2Frefs%2Fheads%2Fmain%2FEmbyPulse.plugin)

## 配置实例

安装后，在插件参数的「实例列表」中填入门户地址。多个地址用英文分号 `;` 分隔。

```text
https://pulse1.example.com;https://pulse2.example.com
```

把每个站点的域名加入 Loon 的 `[Mitm]` → `hostname` 列表。用英文逗号分隔，并保留原有条目。 [Loon MitM 文档](https://nsloon.app/docs/MitM/)

## 登录和运行

1. 开启 Loon 脚本和 MitM，并在设备上信任 Loon 的 CA 证书。 [Loon 证书设置](https://nsloon.uk/faq.html)
2. 在 Safari 依次登录各站点，打开或刷新各自的个人中心，等待对应域名的「已保存登录会话」提示。
3. 在 Loon 运行「EmbyPulse 立即签到」，检查各站点的通知。保持 Loon 运行以执行定时任务。

插件支持 `session_id` 和 `session` 两种会话 Cookie。会话只用于原 HTTPS 站点，退出某站或该站会话失效时，只影响该站。遇到「尚未获取登录会话」，检查实例地址和 MitM 域名，再打开对应站点的个人中心。

## 自动续期

站点默认只签到。要开启某站点的续期，在该站地址末尾加 `|renew`，例如 `https://pulse1.example.com|renew`。插件安装方式还需开启「签到后自动续期」。启用前确认该服支持用同一 `request_id` 重试且只扣分一次。启用后，定时和手动运行都可能扣分。

脚本在签到后刷新商城和余额。第一件是续期商品且积分足够时才兑换。同一站点的账号每天按北京时间使用一个新订单编号。超时后沿用原编号。如果重试前发现首件商品或价格变化，当天暂停兑换。实际扣分以服务器结算为准。

添加新站点后，可以先在 Loon 手动运行「EmbyPulse 立即签到」，检查该站点的结果通知。
