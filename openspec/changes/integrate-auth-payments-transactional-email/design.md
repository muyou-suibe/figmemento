## Context

动机与范围见 [proposal.md](proposal.md)。规划基线：2026-09-10。当前正式 Auth、PayPal、Resend 适配未实现；旧 Stripe create/webhook 不能视作完整可信支付管线。第二优先级持久化仍是独立的模拟业务计划，不是新 provider 的数据库契约。

主要现状定位：
- [认证组合](../../../app/server/customer-auth-runtime.server.ts)、[本地认证](../../../app/application/customer-auth-local-provider.server.ts)：Map 会话/用户，直接 SHA-256 密码摘要仅开发测试，不能迁移到 Supabase 生产身份。
- [旧创建订单](../../../app/api/orders/route.ts)、[Stripe 回调](../../../app/api/webhooks/stripe/route.ts)：价格来自服务端，但有折扣 floor 丢分、非原子多表写入、缺少 expected amount/currency 与 durable event ledger。normalized customization 仍 503。
- [通知 outbox](../../../app/application/notification-outbox.ts)：目前 queued_local，无真实发送/租约持久化。
- [需求源](../../../独立站构建项目需求.md)、[项目规则](../../config.yaml) 优先；不能用实现便利改变游客购买、已验证同邮箱关联或私有媒体规则。

## Goals / Non-Goals

**Goals**：完成可运行的协议代码、严格服务端授权/支付校验、可恢复账本与 outbox、隔离集成环境及清晰交接。默认关闭；显式 test 模式开启所选适配器。未提供账号不阻止写出真实 HTTP/SDK 方法、状态机和契约测试。

**Non-Goals**：不实现生产启用/部署流水线；不把 root legacy schema 认定为 canonical schema；不推进供应商/仓库或照片 Phase C；不进行普通商品 legacy 路径到完整定制订单的隐式迁移。不承诺外部系统 exactly-once 或实际邮箱收件箱必达。

## Decisions

### D1. 四层验收与两种订单 authority

| 层 | 可交付内容 | 通过的证据 | 不代表什么 |
|---|---|---|---|
| A | provider-neutral ports、真实 SDK/HTTP adapters、routes、UI 状态、离线 fixtures | 禁外网的单测/契约/路由/组件测试 | 非真实账号接通 |
| B | 独立 PostgreSQL RPC、账本、synthetic integration order adapter、加密 session store、outbox | 两 app 进程竞争、重启、故障恢复、migration 重建 | 非本地模拟商城已接入服务 |
| C | Supabase 测试项目 OTP/Google、Stripe test、PayPal sandbox、Resend 授权测试邮件 | 实际资源 ID、回调与投递证据、脱敏环境、负向用例 | 非真实商城订单闭环/生产可用 |
| D | canonical order/customer/fulfillment producers 接到这些 ports | 获准业务 schema 和 migration、真实业务 E2E test-mode | 非上线或 live 开关批准 |

每层分服务记录 NOT_IMPLEMENTED / PASS / FAIL / BLOCKED；C 使用 EXTERNAL_BLOCKED，D 使用 BUSINESS_BINDING_BLOCKED。整体生产始终 NOT_ENABLED。不能将 A/B 完成写成第三优先级全部完成；最终报告必须列 C/D 尚待项目决策和外部证据。

选择独立 synthetic authority，而非复用 local payment simulation：provider 测试结果不能污染本地假支付订单。合成订单只提供不可变 quote、ownership 和支付状态，显著标记 integration-only，无生产照片、履约/发货 API。它实现与将来 canonical adapter 相同的原子命令语义，但没有“完整商城”的声明。

### D2. 模块/配置/API 接线

- domain：Money、PaymentQuote、PaymentAttempt、ValidatedPaymentFact、RefundOperation、VerifiedCustomerIdentity、MailEvent/DeliveryState。
- application：AuthProviderPort、VerifiedGuestOrderClaimPort、PaymentProviderPort、PaymentIntegrationRepository、CanonicalOrderPaymentPort、TransactionalOutboxPort、EmailProviderPort；全部异步。禁止 provider SDK 侵入领域状态机。
- infrastructure：request-scoped Supabase Auth、Stripe/PayPal HTTP 或 SDK、Resend、Supabase RPC repositories。注入 transport/clock/ID，不靠全局 fetch mock 才能测协议。
- server：读取受校验的非公共配置，选择 disabled/test/synthetic/canonical 组合；日志只记录脱敏 resource IDs/状态/原因，不输出原 token、cookie、完整 webhook 正文或收件人。
- 认证拟新增 OTP request/verify、Google start/callback，并复用 session/logout 路由的安全投影；支付拟新增统一 checkout/attempt-status 和 PayPal capture 路由；Stripe/PayPal/Resend 各自 webhook endpoint；管理员 full-remaining refund 路由；受保护 operator reconciliation/outbox 命令。实际路径实施前做 inventory，避免与 local/legacy 同名覆盖。
- 用户 POST 必须同源/CSRF 防护 + customer 或 guest order grant + resource ownership，不能把 CORS 当授权；webhook 不依赖用户 cookie/Origin，独立验签。管理员权限来自既有可信 admin authority，Supabase customer 登录不提升为管理员。
- browser 不提供 amount、currency、recipient、provider account、paid status 或 arbitrary return URL。回调 URL 来自精确允许的环境 origin；不能信 request Host/X-Forwarded-Host。只允许内部安全 return path，拒绝协议相对 URL、编码绕过及外部地址。

规划配置名称（非要求现在写值）：CUSTOMER_AUTH_SOURCE=supabase 与独立 SERVICE_INTEGRATION_MODE=disabled/test gates、SERVICE_ORDER_AUTHORITY=synthetic/canonical、SERVICE_TEST_PROJECT_ID、SERVICE_ALLOWED_ORIGINS、SUPABASE_TEST_URL、SUPABASE_TEST_ANON_KEY、服务端 DB credential、AUTH_SESSION_ENCRYPTION_KEY、STRIPE_TEST_SECRET_KEY/WEBHOOK_SECRET/EXPECTED_ACCOUNT_ID、PAYPAL_SANDBOX_CLIENT_ID/SECRET/WEBHOOK_ID/EXPECTED_MERCHANT_ID、RESEND_API_KEY/WEBHOOK_SECRET/APPROVED_FROM/TEST_RECIPIENT_ALLOWLIST。auth source 沿用 CUSTOMER_AUTH_SOURCE，不另起配置名；supabase 必须同时满足 SERVICE_INTEGRATION_MODE=test 与测试项目门。本 change 限制 live activation、当期 customer-auth production disabled，不将 supabase 名称定义为永久 test-only。禁止新增前端 token clients，publishable key 的公开属性不授权 browser token 所有权或公开 server role/private secrets。生产密钥/URL 混入 test 直接拒绝；不能仅依 key 名判断环境，要核 provider 返回 account/project 信息。

### D3. Supabase 服务端 BFF，而非混合 token 所有权

采用 server-only BFF：浏览器只持有高熵 opaque app session cookie（DB 仅存其 hash），access/refresh token 在服务端 session repository 加密保存。HttpOnly、host-only、SameSite=Lax，生产式 HTTPS cookie Secure；纯 loopback HTTP 的显式测试例外单列。cookie 不含可直接调用 Supabase 的 token。加密 key 与 DB/签名密钥分离并带 key version，轮换/旧 key 丢失强制重新认证。

理由：保留当前 HttpOnly 安全边界，避免默认 `@supabase/ssr` browser client 必须读 token cookie 的冲突。不把 Next proxy 示例直接当 vinext 兼容结论；使用 Web Request/Response 路由边界，先做 Worker 构建/请求 cookie spike。PKCE verifier 由 SDK 经应用提供的 request-scoped 服务端 storage 生成/保存/读取，按一次短时 auth intent 隔离；跨请求只通过受保护 durable intent store 恢复匹配 verifier，不共享可变全局 Auth client。provider OAuth state 属于 Supabase/provider，应用存 verifier 或 intent 不等于替代 provider state。官方 SSR cookie 方案不是本轮实现选项；任何架构改动须另行确认，不新增前端 token client、不以移除 HttpOnly 临时绕过。

OTP：`signInWithOtp` 发送数字码须配 `.Token` 模板（默认 Magic Link 不算完成）；`verifyOtp` 成功才发 session，显式选择 shouldCreateUser 并区分登录/注册意图；验证码错误/过期/复用、发送失败/限流、统一非枚举文案、重发冷却、尝试速率限制均纳入测试。Auth 自身生成/校验码，应用不保存码、不复制 Resend 发送流程。

Google：Supabase/provider 负责 OAuth state 管理/校验，SDK 使用上述应用 request-scoped 服务端 storage 保存的一次 intent 隔离 PKCE verifier 进行 code exchange；应用另以短时一次 auth-intent 绑定发起浏览器/session。安全 cookie 只携带 opaque intent 标识，verifier/context 留服务端，严格 redirect allowlist。callback `exchangeCodeForSession` 只接受匹配发起上下文并原子消费 intent，拒绝过期/重放/拒绝授权，不自创、替换或双重接管 provider state。拿到可信会话才建立 app session 并触发同邮箱关联。

会话：使用 `getClaims` 验 JWT 签名/issuer/audience/exp 与项目；授权不信 `getSession().user`；关联或安全敏感动作需 `getUser` 新鲜身份。刷新由带 lease/fencing/version 的单飞任务负责；避免两个 app 进程同时用同一 refresh token。先 durable 保存新加密令牌再响应；opaque cookie不随每次token刷新改变。refresh 结果不确定、加密不可读或持久化失败均不认证放行，必要时要求重新登录，不能覆盖更新 token。会话响应/刷新页面 private/no-store，静态 CDN 不能缓存用户信息。退出先撤销 app session，再请求 provider signOut；失败明确“本地已退出，远端撤销待确认”，不声称已全局退出。注销、权限变化和 refresh 竞争下过期持有者不可复活会话。

### D4. 已验证邮箱自动关联，而非游客 cookie 门槛

正式 provider identity = 项目/issuer + subject，不是 email 主键。关联用服务端 fresh verified email，仅针对同业务域获准 schema 的尚未归属游客订单；邮箱比较沿用经测试的规范化策略（trim 与项目既有大小写规则），不删除 Gmail 点或 +tag、不做模糊匹配。Google 必须证实 email verified。用户不需再持原游客 cookie/再付一次 OTP 才能关联，保持需求的自动关联体验。

`claimEligibleGuestOrders(identity, verifiedEmail)` 在事务内锁定/条件更新未归属订单，owner 唯一且审计 requestId/orderId/subject/verifiedAt。已归属订单绝不转移。并发冲突按已提交 ownership 返回安全结果；重试不重复改权。确认邮箱变更只用于新未归属匹配，不把已关联历史转移给另一个 subject。登录成功但业务库不可用：用户可登录，历史关联 pending，不读未授权订单；后台重试前重新校验身份。无 canonical adapter 时只在合成 test 数据证明此能力，账户页不合并假订单。原 guest draft owner 是五段 HMAC context，不能改写成 opaque bearer 或用 email 自动认领上传、草稿、购物车资源。

### D5. 账本与事务命令

独立 service_integrations schema；实体最小集：

| 实体 | 关键字段/约束 |
|---|---|
| integration_orders / quotes | synthetic 标记、owner/grant、不可变 line/options/customization snapshot、currency/cents/hash/version |
| auth_intents / auth_sessions | 单次 intent、过期、session hash、provider project/subject、encrypted token/key version、revokedAt、refresh fence |
| guest_order_claims | authority/order 唯一 ownership、subject、审计、幂等 request |
| payment_attempts | authority/order/quotehash/provider/account/environment、operation key、expected cents/currency、state、version |
| provider_bindings / operations | provider scope + session/order/capture/paymentIntent 唯一、create/capture/refund operation key、remote result/unknown 状态 |
| provider_events | scope+event ID 唯一、有限保留的受保护 raw payload 或最小安全投影、received/verified/processing/processed/ignored/quarantined、lease/fence |
| settlements | order 唯一 winning settlement，其他 verified captures 独立记录风险，不丢款项事实 |
| refunds | capture scope、requested/succeeded/pending cents、operation key、state、审计，成功+pending 预留不得超额 |
| notification_outbox / deliveries / suppressions | aggregate/event/version 唯一、固定 render payload/key、lease/fence、nextAttempt、provider message ID、accepted/delivered/bounced/complained/unknown |

DB 约束：整数非负 cents、USD、唯一 provider object、唯一业务事件副作用、版本 CAS、行锁、scope 复合键。PostgreSQL RPC 实现 reserveAttempt、bindProviderObject、acceptVerifiedEvent、applyPaymentFact、reserveRefund、applyRefundFact、claimGuestOrders、leaseOutbox/finishLease 等原子命令。浏览器 anon/customer 不可直接写账本；RLS/GRANT 与 SECURITY DEFINER 固定 search_path、最小权限、跨项目负向测试。服务端不能由调用者传任意 schema/SQL/table。

`applyPaymentFact` 必须在同一数据库事务更新 ledger、approved canonical order 支付投影和 outbox。不能用 sequential HTTP updates 假装事务。synthetic authority 与将来 canonical authority 各自提供满足此契约的 RPC；canonical 在异库或缺此原子能力时 D blocked，不能双写。履约只消费已提交、去重的 canonical 支付事实，provider adapter 不直接开启生产/下载。

### D6. Money 与付款状态

服务端用权威 catalog/configured snapshot、优惠资格与运费规则生成不可变 quote；价格变化产生新 quote 版本，不修改活动 attempt。USD 以 safe integer cents 表示；provider decimal string 严格解析 2 位小数，拒绝不支持币种、额外精度、NaN/科学计数/负数/溢出。免邮阈值来自获准 server rules，不修成另一处硬编码。tax 未启用与数值零区分，不自行上线税务计算。

跨行优惠按明确稳定的最大余数规则分摊；行内分为 q-r 件基础单价与 r 件加 1 cent，最多两组守恒。299 cents/3 件 => 2×100+1×99，不得 3×99。保留原 order item 身份/定制快照，provider 分组不是拆成不同定制订单。运费只算物理商品；校验所有 provider payload line sums == quote total。零价行按 provider 文档允许省略价格行而保留订单快照，或返回无法表达；不把0改1。零总额/低于 provider 最低交易金额明确 unavailable/unsupported，不假 paid。

零额决策登记：`not_confirmed_global_free_order_policy`，状态为待业务批准，decision owner=项目负责人，trigger=amount=0。`unsupported_zero_total` 是 provider-only 防误扣技术停止，不是已确认全站免费订单政策；UI 明示“不收费／联系支持”，不伪造 paid、不自动添加 cap 或优惠规则。A/B 的零额拒绝 provider 调用与安全 UI 测试可实施；实际 D 零额用户流程待项目负责人批准。本项只记录既有问题，不扩展免费履约或优惠政策 scope。

状态图以 amount/binding 经核验事实为输入：reserved → creating → awaiting_approval/payment → capture_pending/processing → succeeded；网络未知为 operation_unknown，不等于失败。expired/cancelled/failed 不覆盖已支付事实；本地取消不是远端终止证明。退款是支付成功后的单独累计投影，不能把 paid=false 丢失原付款事实。

浏览器成功回跳只读取受授权 attempt 状态，伪造 query 不影响状态。更换 provider 须先查验/过期旧 attempt；无法证明不会结算时暂停切换。只有当前官方端点/资源语义证实的 EXPIRED、VOIDED 或其他终结确认，且该对象认证 retrieve/reconcile 排除已付/pending/unknown capture，才可原子释放 active hold；不宣称各资源都有这些状态，不猜测数值 expiry。自动 reconcile 持久记录有限次数与总时窗，任一预算达到转 manual_required、停止自动循环但保留 hold。客户可见待核对、受同一预算和终结门保护的状态 retry/support，retry 不是再次付款。管理员核对记录审计与远端证据，不能无证据解锁或忽略款项事实；已验证迟到事件或受保护查询可继续解决 manual_required。hold 可能持续到 provider terminal 可证实，不能承诺固定时间后可支付。竞态仍可能双付：order 只有一个 settlement winner，第二 capture 保存真实财务事实、风险 hold/manual reconcile，不第二次出库/发 paid 邮件、不自动退款。

### D7. Stripe 与 PayPal 协议及远端非原子性

新 ledger path：先持久化操作 key/quote → provider 调用 → 幂等绑定对象。超时或 bind DB 失败不删除订单/新 key 重试；使用原 operation key 与 provider retrieve/reconciliation。provider 幂等 retention 由实施时逐端点官方证据确认，有限窗口后不得盲重发。早到 webhook 先 durable 收件，暂未绑定隔离为 pending/quarantined 并可重处理，不能依 metadata 随便找单或永久 ACK 丢弃。D5–D8 的通用 durable attempt/quote/operation、inbox/原子 outbox 与跨进程恢复要求均针对新 ledger path（含另获批准的 canonical bridge），不声称旧 route 已具备这些能力。

Stripe：Checkout mode=payment、test livemode、expected account、stored Session→PaymentIntent→charge 关联、精确 amount/currency、payment_status/status 均验证；签名基于未改 raw body，timestamp/常量时间或官方 SDK WebCrypto。完成但 unpaid 不能放行；async success/failure 与后到 expired 都测试。旧 legacy path 只做列级安全加固：使用现有 Session/PaymentIntent/total/currency 列核验精确金额与强关联、approved origin 回跳及共用纯 money builder，不新增 schema/ledger/quote，不绕过 normalized 503。没有可信已保存 Session/intent 绑定或预期 total/currency 时拒绝付款确认/人工核对，不能 metadata 找单补绑。旧 create 成功/可能成功但 bind 失败保留订单、返回 unknown/manual reconciliation，不删除订单、新 key 盲重建或伪造 paid；缺证时再次创建继续 fail closed，响应 unknown 不代表 durable operation 已存在。旧 route 没有 ledger，不得声称 durable inbox、原子 outbox、自动恢复或重启安全；全面 ledger 接管旧业务必须走 D 门，不能让安全加固成为 schema 迁移捷径。

PayPal：固定 api-m.sandbox.paypal.com，服务端 client credential OAuth 缓存有 expiry/skew、并发控制与 secret 脱敏。create Orders v2(intent CAPTURE) → buyer approve → owner-authorized server capture；create/capture/refund 各自稳定 PayPal-Request-Id。APPROVED≠paid，capture COMPLETED 后仍核对 order/capture ID、payee merchant、scope、精确金额币种，PENDING/拒绝/unknown不履约。对账用授权 GET 读取权威对象，不能信浏览器 payer/status。

PayPal 无可靠 expire/cancel API 时不臆造操作；须按 D6 的官方当前终结语义及对象证据核对。EXPIRED/VOIDED 或其他终结状态的适用性须在实施时验证，数值 expiry 不猜。预算达到转 manual_required 而非释放 hold；客户 retry/support 与管理员审计都不能绕过远端终结/资金事实，可能 hold 到终结可证实，不能承诺固定付款等待时间。

PayPal webhook 使用官方 `/v1/notifications/verify-webhook-signature`，body带配置 webhook_id 与 transmission headers/event；不直接访问任意 cert_url，避免 SSRF。验证服务不可用返回可重试错误，不变成验签通过；签名正确但对象不属本 merchant/app/order 仍拒绝业务变更。PayPal 模拟 webhook 不能代替 sandbox app 的实际订单/capture event 验收。

新 ledger path 的所有 webhook：尺寸/结构限制、独立 secret、raw body、验签后 durable inbox 才2xx；DB失败5xx，错误签名4xx；可信未知事件类型记录 ignored，未知业务绑定保留重处理。后台 lease/fence 实现 at-least-once、eventID+semantic object 去重，事件 created time 不是全局排序。验证付款事实→同事务状态/outbox。内部 processor crash、租约过期并发不可重复效果。旧 webhook 只按上述 seam 的验签、精确金额、强已存绑定与安全拒绝边界验收，不虚构 durable ACK 能力。

### D8. 有界退款与核对

本轮实现管理员“全额退还剩余可退金额”命令（非任意部分退款 UI），服务端从 captured−successfulRefunds−pendingReservations 计算，拒绝零额/未付/非owner资源及无admin权限。事务预留后调用 Stripe refund 或 PayPal capture refund，固定 key；超时为 unknown 并占用预留，不新 key 补退。verified callback/retrieve 原子结算/释放确定失败的预留。provider 后台手动部分退款据实累计；重复/乱序事件不能超额或将部分退款写成全额。退款不自动删除订单/媒体，也不擅自倒退生产流程；通知与履约停止策略通过 canonical events 路由，未批准则 D blocked。

退款/撤销/争议等无法确定事件保存风险 hold 并列操作员核对，不自动赔付或自动再次扣款。测试环境可做退款；任何 live 退款/真实付款不在授权内。

### D9. 事务邮件责任与投递可靠性

以下严格对应 spec 的 11 类、M01–M13 共 13 个映射。每个事件/producer 名称都是待实现的目标合成契约，不声称当前已有 canonical producer；A/B 用 synthetic contracts 验证，D 必须逐项证明真实 committed producer/version，缺 producer 明确 D blocked。差异可用同一 aggregate event 的 subtype 表达，但 mapping 与去重覆盖不可丢失。

| Mapping | 需求类别 | 目标契约／来源与去重键 | 实施边界 |
|---|---|---|---|
| M01 | 邮箱登录验证码 | Supabase signInWithOtp / Auth challenge | provider 创建校验数字码并 SMTP 发送，不入应用 outbox |
| M02 | 订单创建 | OrderCreated + order/version | canonical order commit，发 order email |
| M03 | 支付成功 | PaymentSettled + order/winner/version | 已核验付款与订单投影同事务，发 order email |
| M04 | 照片需补充或重新上传 | PhotoReviewActionRequested subtype=additional_material + review/version | 补材料的已提交审核事实；缺 producer D blocked |
| M05 | 照片需补充或重新上传 | PhotoReviewActionRequested subtype=reupload + review/version | 重传的已提交审核事实；与 M04 单独覆盖 |
| M06 | 生产预览待确认 | PreviewPublished + manifest/version | 已提交且客户可见的预览版本，不内嵌私图 |
| M07 | 生产预览修改结果 | PreviewRevisionResolved subtype=fulfilled + request/version | 修改已满足且有修改后预览，不发明审批/退款流程 |
| M08 | 生产预览修改结果 | PreviewRevisionResolved subtype=unfulfillable + request/version | 修改无法满足的说明/联系结果，不改变两次修改规则 |
| M09 | 订单进入生产 | ProductionStarted + order/version | 仅门禁后的真实已提交生产状态 |
| M10 | 订单发货 | ShipmentDispatched + shipment/version | 已提交发货事实，发 order email |
| M11 | 物流单号和查询链接 | TrackingDetailsAvailable + shipment/tracking-version | 已提交 tracking 详情；MAY 与 M10 合并 |
| M12 | 数字商品可下载 | DigitalDeliveryPublished + item/version | 已核验 paid 且私有文件 ready，只页面入口，不消费次数 |
| M13 | 订单异常或需要人工联系 | OrderExceptionRaised + exception/version | 已提交异常/联系事实，固定模板与授权人工操作 |

M10/M11 仅在两项事实共同提交且政策选择时 MAY 合并一封，不强制合并；coverage 账本持久记录 message/intent 对两个 mapping/event-version 的覆盖与唯一性，重放不能再单发同一事实。后来新提交的 tracking version 可按获准政策独立通知。所有 M02–M13 的 producer 不存在时仍实现模板与事件 port/测试，但逐项 D blocked，不用合成事件冒充已接线。newsletter、contact auto reply、abandonment、review invite、points 不扩进本轮 MVP 事务生产接线。历史 queued_local 绝不 drain 到真实 Resend。

outbox 由业务提交同事务生成（不是先发邮件再写订单）；租约+fencing 防双 worker，固定收件人/模板版本/渲染payload+payloadhash+sendkey。发送前检查 suppression、approved environment recipient。HTML escape、纯文本备份、防 header injection；不将用户原文作为任意 HTML，不记录邮箱/OTP/token。链接到获准 origin 的受保护业务页面，不含永久对象 URL或可消耗下载ticket。游客无原grant可登录验证同邮箱后自动关联访问；原guestgrant不可被 order number/email替代。

Resend幂等窗口官方为24h，key≤256字符。已成功 accepted 保留 message ID；timeout后同 payload/key 在窗口内有限退避；超过窗口仍未知必须 unknown_delivery/manual reconciliation，禁止换key“保证送达”。429 honor Retry-After+上限抖动，5xx有限重试，永久4xx/config错误dead-letter；409 payload mismatch不能换payload重用key。重试需 lease fence；租约失效后返回成功不能覆盖新state。

API 2xx=accepted，delivery webhook=delivered，二者不等于用户阅读/收件箱验证。Svix rawbody + id/timestamp/signature 验证，scope/event幂等，乱序 delivered不能抹除 bounced/complained、suppression。外部测试邮件即真实side effect，允许名单和显式授权；官方测试地址仅验投递模拟事件，不是用户邮箱收件证明。

### D10. 验证设计和隔离生命周期

拟建立 local/service-integrations 独立 Supabase workdir，端口实施前探测并固定空闲段，不占 root54321-54324，也不碰 local/commerce。按新增 engineering-foundation delta 使用有序版本化 migration、独立 ledger/checksum、合成 seed 和 rollback/forward-fix；保留前一 local/commerce 例外，两个 isolated workflow 都不替代唯一 production canonical supabase/migrations。应用通过 Supabase HTTP/RPC，不能在 Worker 里使用 native TCP PostgreSQL。retained dev volumes 与 disposable test run 分开；项目ID/loopback/端口/schema marker/run owner多重确认后才reset。Docker/CLI/DB不可用阻塞 B 及依赖该 durable store 的 C，A 可独立运行，不mock成DBpass。现有.env只由进程读取，不向模型/日志展示值。

A 禁外网，真实协议请求shape/headers/body+返回映射+签名样本；routes授权/cookie/redirect；Money property tests，篡改、过期、错误币种、陌生Session、错误商户、乱序/重放、provider 429/5xx/timeout。B：完整migration从空库重建、unique/RLS、两个独立 app PID 并发、reserve→remote-return→bind各窗口中断、支付提交/outbox/退款预留/guestclaim/sessionrefresh恢复、租约过期fencing。不得用同进程重复调用冒充重启。

C 独立 opt-in 执行，不与 npm test:offline 默认链绑定；每个服务执行 C 前须本服务 A/B 通过且依赖 durable store 可用，准备清单可独立整理。Stripe test真实Checkout→付款→实际webhook；PayPal sandbox买卖两个账号→批准/capture→实际webhook；两者退款与pending/失败/重放用实际可触发case+受控协议fixtures区分。Stripe CLI test转发可无需部署；PayPal/Resend通常需已批准的可达HTTPS回调，缺入口就单独blocked，不自动创建tunnel。Supabase测试OTP实际SMTP/Google回调/刷新/退出，Resend测试地址事件与允许名单邮箱收件分别记证据。

D 只有 canonical schema/C1/PhaseC/domainevent producers 获准且可迁移时，才实施实际商城 bridge、旧路由切换和真实游客到定制订单接线。缺依赖先停止该批，而非删除D任务。最终检查 lint、typecheck、offline、build→rendered，保留历史失败信息但只以新跑结果判断回归。

## Risks / Trade-offs

- [BFF比默认SSR多session库和token加密] → 以HttpOnly与清晰令牌所有权换复杂度；优先spike并测并发刷新，不降级cookie。
- [独立harness可能被误当商城完成] → 页面/订单/证据均synthetic标记，D单独验收，真实provider不接模拟订单。
- [远端成功、本地失败无法跨系统事务] → 稳定operation key、durable intent/inbox、查单对账和unknown停止门，禁止盲补发。
- [邮箱重用/改邮箱涉及历史归属] → 只认领未归属且verified exact-match，既有owner不重分配并保留审计；身份迁移需另行批准。
- [供应商生产门禁和旧业务能力不齐] → 不允许payment adapter绕过；D列缺失 producer/authority，不承诺发货闭环。
- [外部retention/SDK不断变化] → 实施记录实际版本和官方端点证据，不把本次查阅当永久协议。

## Migration Plan

1. 只读清点工作区及当前 main/active deltas，保留已有 dirty/未跟踪内容，后续实施遵循 tasks 禁止 git 的规则、不 stage/commit/push。先运行新鲜基线与 Worker 兼容 spike。
2. 新增可重建isolated harness迁移与marker；原schema/数据不动。迁移up/rollback只在当前run disposable库验证，保留每步ledger证据。
3. 实施A/B，默认关闭适配器；C仅在外部清单和side-effect opt-in满足后运行。适配器停用后不丢inbox/outbox，reconcile可受控继续；auth可撤销会话，不删除财务事实来“回滚”。
4. D迁移必须先文档化canonical authority、旧数据映射/回填、未知付款隔离、去重键、事务RPC与回滚路径并获批准；本变更不授权远程push或root reset。
5. 同时涉及 customer-auth 与 engineering-foundation 的活跃 delta 在实施与 sync/archive 前做三方对照，保留已经落地的 local_persistent 模式及前一 migration 全部场景。对前一 ADDED 的 Durable membership does not claim guest commerce，采用 verified-guest-order-association 的 Evidence handoff 具体目标句，将其禁止认领限定 local_fake/local_persistent 与模拟数据，保留全部原三个场景，唯一例外为 Supabase fresh verified-email 的获准业务订单；当前主规范无此要求，不能本轮伪造 MODIFIED。未落地时不新增假实现，不改前一文件/任务勾选。后续同步已有 auth production handoff/deferred 等文档，将 adapter 实现事实、当前测试证据与仍延期的生产/业务接线分开，不删除其他延期范围。

## External prerequisites and deferred values

账号ID、密钥值、可用端口、Google client ID、允许名单收件人、已获准回调域名和实际SDK版本由实施环境提供；均不改变上述架构/范围。没有配置也必须先完成 A 代码与测试；缺 DB 阻塞 B 以及依赖该 durable store 的 C 执行，每个服务 C 均需本服务 A/B 通过；C 准备仍可整理，缺外部授权不阻塞 A/B，但其真实链不能验收也不能用于 D 通过。canonical schema/C1/PhaseC 不是可随便填的参数，是 D 明确的审批依赖。零额 D 用户流程另待项目负责人批准，不影响 A/B 防误扣实现。

## Official protocol references

原规划记载的公开官方资料核查日期：2026-09-10；本轮修订未访问外网或账户 API，不作为本轮重新核验声明。后续实施再确认 endpoint、终结状态/expiry 依据与依赖版本，未知值不猜。

- Supabase：[Next SSR](https://supabase.com/docs/guides/auth/server-side/nextjs)、[advanced SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide)、[email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[Google](https://supabase.com/docs/guides/auth/social-login/auth-google)。BFF是本设计选择，不把默认SSR文档说成现成HttpOnly token方案；spike 验证 Supabase/provider state 所有权与 SDK 经应用 request-scoped server storage 的逐 intent verifier 隔离，不改成应用接管 state。
- Stripe：[webhooks](https://docs.stripe.com/webhooks)。raw验签、重复/乱序、重试；事件trigger fixture不等于实际交易链。
- PayPal：[Orders V2](https://developer.paypal.com/docs/api/orders/v2/)、[webhooks](https://developer.paypal.com/api/rest/webhooks/rest/)、[idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)、[refund API](https://developer.paypal.com/docs/api/payments/v2/)、[environments](https://developer.paypal.com/api/rest/production/)。此次未取得各端点完整幂等retention数字，不填猜测值。
- Resend：[24h idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)、[Svix verification](https://resend.com/docs/webhooks/verify-webhooks-requests)、[test addresses](https://resend.com/docs/dashboard/emails/send-test-emails)、[at-least-once delivery](https://resend.com/docs/webhooks/introduction)。测试地址非真实收件箱验收。