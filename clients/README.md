# EmbyPulse 客户端配置

各客户端共用同一份签到和续期脚本。 [embypulse-checkin.js](../embypulse-checkin.js)

## 通用设置

实例列表用英文分号分隔。默认只签到。确认该站支持用同一个订单编号安全重试后，可在地址末尾加 `|renew`，启用签到后的首件续期商品兑换。

```text
https://pulse1.example.com;https://pulse2.example.com|renew
```

将每个门户加入客户端的 MitM 域名列表，并启用 MitM 和信任该客户端的 CA 证书。然后用 Safari 依次登录各门户并打开个人中心。收到各站点的「已保存登录会话」通知后，可以手动运行 **EmbyPulse 每日签到**。默认每天 08:00 执行，使用设备本地时间。更换代理客户端后需要重新获取会话。

## Surge

导入 [EmbyPulse.sgmodule](EmbyPulse.sgmodule)，在模块参数中填写 `instances`。通过 `cron` 调整签到时间。支持请求选项 `auto-cookie` 和 `auto-redirect` 的最低版本为 iOS 5.9.0、macOS 5.5.0。请使用支持模块参数的版本。 [模块参数](https://manual.nssurge.com/profile/module.html) · [脚本接口](https://manual.nssurge.com/scripting/api.html)

## Stash

导入 [EmbyPulse.stoverride](EmbyPulse.stoverride)，填写「实例列表」和「签到时间」。Stash 官方文档将覆写参数标为 Beta，支持 iOS/tvOS 3.7+ 和 macOS 4.4+。 [覆写参数](https://stash.wiki/en/configuration/override)

如果客户端没有参数表单，编辑本地覆写文件。删除顶部的 `arguments-version` 和 `arguments` 两段，把两处 `${args.instances}` 换成相同的实例列表，保留前面的 `proxy:`，再把 `${args.cron}` 换成 `0 8 * * *` 或自定义时间。可在「MitM → Hostname」加入门户域名。 [MitM 文档](https://stash.wiki/en/http-engine/mitm)

## Quantumult X

使用支持关闭脚本自动 Cookie 的 Quantumult X（Build 934 或更新）。将 [EmbyPulse.qx.conf](EmbyPulse.qx.conf) 的三个区段分别合并到当前配置，保留原有的规则、任务和 MitM 域名。 [Quantumult X 官方配置示例](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf) · [任务脚本接口](https://github.com/crossutility/Quantumult-X/blob/master/sample-task.js)

将 `[rewrite_local]` 和 `[task_local]` 两处 `#instances=` 后的值替换为同一份实例列表的 URL 编码。可直接用域名，用 `%3B` 分隔，需续期的域名加 `%7Crenew`。例如 `pulse1.example.com%3Bpulse2.example.com%7Crenew`。如果填写完整 HTTPS 地址或带端口的地址，可对整个列表调用 `encodeURIComponent`。同步替换 `[mitm]` 中的示例域名。

## Egern

Egern 官方支持在「工具 → 模块」导入 Surge 模块，可尝试使用同一份 `.sgmodule`，填写相同的参数并加入 MitM 域名。会话捕获和任务执行需在 Egern 中实测。 [Egern 模块导入说明](https://egernapp.com/docs/faq/)
