# EmbyPulse Check-in

为 EmbyPulse 用户门户提供多实例自动签到和可选的积分续期。默认按设备本地时间每天 **08:00** 执行。各站点独立保存登录会话和兑换记录。

站点须提供 EmbyPulse 的个人中心与积分签到接口。 [EmbyPulse 项目](https://github.com/amlkiller/emby-pulse)

## 安装

| 客户端 | 安装入口 |
| --- | --- |
| Loon | [在 Loon 中安装 EmbyPulse Check-in](https://www.nsloon.com/openloon/import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Ffunanzz%2FEmbyPulse-Check-in%2Frefs%2Fheads%2Fmain%2FEmbyPulse.plugin) |
| Surge | [Surge 模块 URL](https://raw.githubusercontent.com/funanzz/EmbyPulse-Check-in/refs/heads/main/clients/EmbyPulse.sgmodule) · [设置说明](clients/README.md#surge) |
| Stash | [Stash 覆写 URL](https://raw.githubusercontent.com/funanzz/EmbyPulse-Check-in/refs/heads/main/clients/EmbyPulse.stoverride) · [设置说明](clients/README.md#stash) |
| Quantumult X | [查看 QX 配置](https://raw.githubusercontent.com/funanzz/EmbyPulse-Check-in/refs/heads/main/clients/EmbyPulse.qx.conf) · [合并配置说明](clients/README.md#quantumult-x) |

Loon 插件需要 **Loon 3.5.1（Build 983）或更高版本**。已安装的用户可继续使用原有插件和配置。

Egern 可导入同一份 Surge 模块，签到和会话捕获待真机验证。 [Egern 设置说明](clients/README.md#egern)

## 配置与运行

1. 在客户端配置中填写门户的 HTTPS 地址。多个地址用英文分号 `;` 分隔，例如 `https://pulse1.example.com;https://pulse2.example.com`。Loon 的参数名是「实例列表」，QX 需要按上方说明编码。
2. 手动把每个站点的域名加入客户端的 MitM 列表，启用 MitM 并在设备上信任客户端的 CA 证书。 [Loon MitM 文档](https://nsloon.app/docs/MitM/)
3. 在 Safari 依次登录各站点，打开或刷新各自的个人中心，等待「已保存登录会话」通知。
4. 首次配置后可以手动运行签到并检查各站点的通知。Loon 的手动入口是「EmbyPulse 立即签到」。保持客户端运行以执行定时任务。

脚本支持 `session_id` 和 `session` 两种会话 Cookie。会话只用于原 HTTPS 站点。遇到「尚未获取登录会话」，检查实例地址和 MitM 域名，再打开对应站点的个人中心。

## 自动续期

站点默认只签到。要开启某站点的续期，在该站地址末尾加 `|renew`，例如 `https://pulse1.example.com|renew`。Loon 还需开启「签到后自动续期」。启用前确认该服支持用同一 `request_id` 重试且只扣分一次。启用后，定时和手动运行都可能扣分。

脚本在签到后刷新商城和余额。第一件是续期商品且积分足够时才兑换。同一站点的账号每天按北京时间使用一个新订单编号。超时后沿用原编号。如果重试前发现首件商品或价格变化，当天暂停兑换。实际扣分以服务器结算为准。
