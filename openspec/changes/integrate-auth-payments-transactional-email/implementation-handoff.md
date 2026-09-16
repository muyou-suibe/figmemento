# 5.6 Luna 实施交接：补服务适配，暂不部署

## 当前状态与阅读顺序

本轮只完成规划，**14 组 / 97 项实施任务全部未勾选**。没有安装依赖、实现应用代码、启动数据库、应用迁移、登录外部服务、发送邮件或部署。OpenSpec 的 planning complete / ready for apply 仅表示规划文件齐备，不表示服务可用。

依次读取：
1. [需求源](../../../独立站构建项目需求.md) 与 [OpenSpec 项目规则](../../config.yaml)。
2. [提案与范围](proposal.md)。
3. [技术设计、外部协议依据与验收分层](design.md)。
4. [八份规格](specs/service-adapter-boundaries/spec.md)及 [任务清单](tasks.md)中的其他七份规格链接。
5. 前一独立 [持久化提案](../complete-local-commerce-persistence/proposal.md)和相关 delta，只核对依赖，不自动实施其 85 项任务。

接手时重新读取当前代码/main specs/active deltas；本文件不是冻结代码快照。`local_persistent`、C1、Phase C 是否完成必须重新查证，不能因规划提及就假设存在。两个 customer-auth delta 和两个 engineering-foundation migration delta 必须按当前 main 三方合并；未来目标语句见 [认证规格](specs/customer-auth/spec.md)与 [工程基础规格](specs/engineering-foundation/spec.md)，不能最后写入者覆盖前一模式。

## 推荐执行批次

不建议一次连续执行全部 97 项。每批按验收条件测试后勾选，并给出变更/测试/阻塞/下一步小结。

| 批次 | 任务组 | 主要交付与停止点 |
|---|---|---|
| 1 | 1–2 | 新鲜基线、当前契约清单、Worker/BFF spike、ports/config；兼容性失败先停止相关实现，不降低 cookie 安全 |
| 2 | 3 | 隔离 Supabase harness/schema/RPC/加密session/synthetic order；只触及本项目专属测试库 |
| 3 | 4–5 | OTP/Google/刷新退出/最小UI及verified-email guest claim，A/B证明不等于外部登录/真实历史已接通 |
| 4 | 6–7 | 精确 Money/quote/attempt 与 Stripe、legacy 安全 seam；不新增旧业务 schema，不解除 normalized 503 |
| 5 | 8–9 | PayPal真实REST方法、webhook/inbox/reconcile、并发结算、Stripe/PayPal剩余全退；补齐两支付路径联合B测试 |
| 6 | 10–11 | 13邮件映射、完整模板、Resend/outbox和跨进程/故障/重建矩阵；不发送历史 queued_local |
| 7 | 12.1–12.5 | 外部清单与负责人核对；调查可提前做，清单写完不等于实测通过 |
| 8 | 12.6–12.10 | 逐服务批准后的真实测试联调，各服务独立推进；缺账号/回调/发送授权保留未勾选 |
| 9 | 13 | canonical业务接线；缺获准 schema/C1/PhaseC/事件producer则 BUSINESS_BINDING_BLOCKED，不能自己补批 |
| 10 | 14 | 最终新鲜质量门与报告；A/B阶段报告可先交，全量验收不得越过C/D未完成项 |

依赖以 [tasks.md](tasks.md) 为准。某批 B 因 Docker/DB 阻塞时，可继续不依赖数据库运行的 A 代码/契约；C 的真实会话/账本链依赖对应 A/B 与可用 durable store，不能改用 Map 绕过。

## 五条不能误读的实现边界

1. **真实 adapter 不等于真实商城已接通。** 新的 synthetic integration orders 只验证协议/事务，不能当 local_fake/local_persistent 的订单或真实客户订单。后两者依旧是模拟支付，不允许写入真实 provider 付款结果。
2. **缺密钥不等于可以留占位方法。** Supabase发码/验码/OAuth/刷新/退出、Stripe/PayPal create/retrieve/capture/refund/verify、Resend send/verify 的真实HTTP/SDK实现与A测试必须完成；缺密钥只使相应C无法执行。
3. **已验证邮箱自动关联是需求。** fresh provider verified email 对同项目合格未归属业务订单自动关联，不额外要求原guest cookie/二次OTP，不认领照片草稿/上传/购物车，不重新分配已有owner。原五段HMAC guest context不改成opaque token。
4. **付款/投递不确定不能假成功或盲重试。** 金额币种、账户环境、Session/Order/capture绑定全部核验；unknown保留原operation key与额度/hold，dual-payment只一个业务winner但两笔财务事实都保存。Resend幂等24h，超窗unknown不得换key盲发。accepted≠delivered≠真实收件箱观察。
5. **旧Stripe只做有界加固。** 既有列可支撑精确金额/强关联；不能声称旧路径具备新ledger的事务恢复/幂等。legacy create可能成功但绑定失败进入人工核对，不异常删订单；normalized 503仍保留。零额仅安全阻止误扣，不是已经批准“全站免费订单不可用”的业务规则。

退款范围为管理员 **full_remaining（全额退还剩余可退金额）**；记录外部部分退款，不扩任意部分退款UI。免费/零额订单的正式客户流程由项目负责人在D前决定；未批准时不收1cent、不伪造paid、不暗中限制优惠配置。

## 外部准备清单（当前均未在本轮配置或验收）

| 服务 | 项目负责人/账户操作者提供 | 实施者无凭证先完成 | C真实验收 |
|---|---|---|---|
| Supabase OTP | 独立测试项目、SMTP、数字码 `.Token` 模板、允许收件人/发送批准 | BFF/数字码/限流/session加密与refresh/logout代码、契约 | 实际发码→验码→会话→刷新→退出 |
| Google via Supabase | Google OAuth client/consent、Supabase配置、允许的callback/origin | SDK PKCE+server storage+一次intent/安全回跳 | 真实登录/回调/subject/verified email及取消异常 |
| Stripe | test商户/密钥、expected account、endpoint secret、已批准转发范围 | create/retrieve/expire/refund、raw验签、金额/绑定/ledger | Checkout实际test付款→实际webhook→核对→测试退款 |
| PayPal | sandbox merchant/buyer、app credentials、webhook ID、可达批准HTTPS入口 | Orders/capture/GET/refund/官方verify API完整方法 | 实际批准/capture→实际webhook验签→核对→sandbox退款 |
| Resend | approved sender、key、Svix secret、callback、邮箱允许名单和发送批准 | 模板/outbox/send/验签/retry/suppression | accepted→真实callback；官方测试地址事件与自有邮箱观察分栏 |

凭证只由操作者放入模型不可见的环境，不发给聊天、不写进文档或日志；准备项写明配置名即可。外部账号值存在也不是发送/转发授权。没有批准不自动建立tunnel、注册webhook、配DNS、发布应用、远程push schema或执行live收费/退款。

## 必须采用的证据表

每个服务分别记录：实现 NOT_IMPLEMENTED/PASS/FAIL/BLOCKED；A、B、C、D各自状态/日期/用例/日志/脱敏环境；production NOT_ENABLED。初始无实现/测试证据，不能预填A/B PASS。C缺凭证=EXTERNAL_BLOCKED；C缺B库注明实际依赖原因；D缺业务authority=BUSINESS_BINDING_BLOCKED。

历史offline892与rendered7/11只作历史背景；开始与结束均先build再rendered，当前若11/11就报告当前通过。失败不删除测试、扩大any或降低strictness；不得拿旧产物验证新代码。双进程测试记录不同PID与DB run，不把同进程重复调用当重启恢复。

允许只读git status/diff核对当前dirty与staged；禁止清理/还原/stage/commit/push。没有执行git add并不能证明暂存区为空。保持其他变更与用户文件原样，不擅自重做视觉或宣布前一变更冻结/完成。

## 可直接交给实施模型的请求

> 按 integrate-auth-payments-transactional-email 的实施交接、proposal/design/specs/tasks 进行实施，先完成第1–2组并给出新鲜基线和兼容性证据。后续按依赖分批推进；仅测试通过的任务勾选。不得部署、远程迁移、live收费/退款、擅自外发邮件或开启tunnel；不实施另一个持久化变更。缺凭证或canonical依赖分别报告C/D阻塞，仍完成可独立实现和验证的A/B，不把模拟/fixture证据说成真实联调。