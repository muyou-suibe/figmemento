# 分批实施任务：Auth、Payments 与 Transactional Email

依据：[proposal.md](proposal.md)、[design.md](design.md) 及下列八份 delta specs。面向后续 5.6 Luna 分批实施；本文件仅为规划，共 **14 组、97 项**，全部未勾选。本轮仅修订本 change 规划，不实现、不执行应用测试或服务、不初始化数据库；仅允许本地 OpenSpec 规划校验。

执行与勾选规则：
- 每组是一个实施批次；默认组内按编号顺序推进，另列跨组依赖。标明可独立推进的 A、准备/报告任务以及第 12 组各服务真链不要求其他受阻项先通过；依赖以所需契约/实现为准，不把前组尚待后组的联合验证当循环前置。每项的“验收”是勾选条件；代码写完但未测试、仅有 fixture、仅整理准备清单，均不能代替相应运行验收。失败/缺依赖的实施或实测项保持未勾选，记录具体原因。
- A = 禁外网的真实协议适配代码、离线契约/路由/UI 测试；不需外部账号或网络。B = 独立本地 Supabase 的真实 HTTP/RPC、事务、多进程与恢复验证；Docker/CLI/数据库缺失记 `BLOCKED`，不得 skip-pass 或改用 Map。C = 经显式批准的外部测试服务实测，每项须本服务 A/B 通过且其 durable store 可用；缺 DB 也阻塞依赖它的 C 执行但不阻塞独立 A 或 C 准备，缺条件记 `EXTERNAL_BLOCKED` 并注明 DB/外部的实际原因。D = 获准 canonical 客户/订单/履约接线与真实业务 test-mode 验收；缺审批或原子能力记 `BUSINESS_BINDING_BLOCKED`。逐服务另列实现状态 `NOT_IMPLEMENTED/PASS/FAIL/BLOCKED`；生产始终 `NOT_ENABLED`。
- C 准备项与执行项分别勾选；准备调查完成或配置就绪均不等于 C 测试通过。无 key 不豁免真实 SDK/HTTP 方法、退款 API、状态机和 A 测试的实现；无 canonical producer 不豁免 adapter、事件 port、完整模板与 synthetic A/B 测试。
- D 开始前必须先检查并获得 C1、Customization Phase C、canonical schema/事务/授权及相关 producer 的独立批准；缺任一适用批准先 stop，不得先接线后补批。本变更、C 测试通过和 synthetic authority 均不能替代批准，不能把 root legacy schema 或 local 模拟库当 canonical。
- 保留现有 git-dirty、未提交/未跟踪内容；仅允许只读 git status/diff 核查，不清理、还原、stage、commit、push 或发布。不部署、不切 DNS、不远程迁移、不 root reset、不启用 live、不进行真实货币收费/退款、不营销或批量发送，不顺带实施其他变更。
- 外部 Google/Stripe/PayPal/Resend 回调、tunnel、endpoint 注册/转发均不得自动创建或开启；只能使用另行明确批准的范围。Supabase SMTP 和 Resend 的“测试邮件”都可能真实发送，须发送批准与自有收件人允许名单；凭证存在不构成批准。密钥仅由操作者在模型不可见的本地环境配置，禁止索取、输出或写入证据。
- 所有证据记录用例、时间、命令/运行方式、退出结果、脱敏项目/账户/scope、数据库 run 与进程身份；不记录 OTP、token、cookie、完整敏感正文、邮箱或私有文件地址。历史测试数字仅作背景，当前结论必须来自本次新运行。

## 1. 当前基线、重叠契约与工作区保护

验收层：A 基线/规划交接。依赖：无；先完成本组，再改实现。Specs：[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[engineering-foundation](specs/engineering-foundation/spec.md)。

- [ ] 1.1 建立只读工作区与范围清单，标记现有 dirty/用户改动需原样保留及本变更拟触及边界；验收：仅用只读 status/diff 检查实际状态，清单含禁止 git 写操作、禁止覆盖其他变更/未跟踪内容的规则，不执行清理或无依据声称工作区干净/暂存区为空。
- [ ] 1.2 重读当时 main specs、此变更及两个 customer-auth 活跃 delta，核对 `local_persistent` 是规划还是已落地；验收：采用 Evidence handoff 中具体未来目标句形成三方完整 requirement 重基清单，将前一 ADDED Durable membership 的禁止认领限定 local_fake/local_persistent 与模拟数据，完整保留 Member Order survives restart with its owner、Guest and member emails match、Session changes leave guest cookies intact 三个原场景及持久撤销/隔离/无本地游客迁移，唯一例外为 Supabase fresh verified-email 获准业务订单；主规范尚无该 requirement 时不伪造 MODIFIED，不改前一文件或其 0/85 勾选。
- [ ] 1.3 清点现有 Auth、legacy Stripe、checkout、admin、通知与 runtime 路由及测试入口；验收：列出可复用 seam、拟新增路由的无冲突映射、normalized `/api/orders` 503 与 local authority 停门，不把现存代码等同可信 provider 实现。
- [ ] 1.4 在后续获准实施时运行当前 lint、typecheck 与禁外网 offline 基线；验收：保存新日志、实际计数与既有失败/警告，不引用历史 892 作为当前通过、不关闭测试或掩盖类型错误。
- [ ] 1.5 执行 fresh build 后再执行 rendered 基线，确认使用该次新产物；验收：分别记录构建与 rendered 结果、错误定位和当前通过数，若已 11/11 则旧四例失败归历史；构建失败时不得拿旧产物作本轮通过证据。
- [ ] 1.6 核对新增 engineering-foundation delta 与主规范/前一持久化 delta 的完整 requirements 和场景，形成实施与 sync/archive 三方合并清单；验收：保留前一 local/commerce 例外及全部 migration 场景，本 workdir isolated ledger/checksum/有序迁移不替代唯一 production canonical workflow；适用旧支付延期归属为本 change，A/B adapter 现在可实施与 production/C1/Phase C/D/其他延期 scope 分开，不改主规范或旧 change 来替代未来合并审批。

## 2. 端口/协议兼容 spike、domain ports 与显式配置

验收层：A；公开协议核查属于实施准备，不混入禁外网 A 测试。依赖：1；本组不启动外部服务。Specs：[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[stripe-checkout-adapter](specs/stripe-checkout-adapter/spec.md)、[paypal-checkout-adapter](specs/paypal-checkout-adapter/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

- [ ] 2.1 核对实际依赖版本及官方协议，建立 Stripe create/expire/refund、PayPal create/capture/refund/GET/verify、Resend send/Svix 与 Supabase PKCE/session 的端点证据表；验收：有官方 URL、日期、版本、幂等支持/保留及限制，逐资源确认 EXPIRED/VOIDED 或其他终结语义/操作的真实适用性，不猜测数值 expiry；自动 reconcile 次数/总时窗为有限本地预算而非 provider expiry，未知值明确 hold，不编造窗口或 SDK 方法，协议核查不冒充 C 实测。
- [ ] 2.2 完成 vinext/Worker 的请求隔离、WebCrypto、raw-body、cookie 多头与 SDK/HTTP 构建/请求 spike；验收：实际构建及本地请求测试证明 BFF HttpOnly/host-only/Secure 策略、PKCE verifier 隔离可行，不改成 browser token/弱 cookie；兼容失败保留阻塞而非重开已定架构。
- [ ] 2.3 探测并固定独立集成应用及 Supabase 端口/项目 ID，规划专属 workdir、schema marker、retained/disposable run 标识；验收：记录实际空闲端口，不占 root 54321–54324、不碰 local/commerce，端口占用会安全拒绝，不启动 tunnel 或其他项目。
- [ ] 2.4 建立异步 provider-neutral domain/application ports 与类型化结果：Auth、VerifiedGuestClaim、PaymentProvider、PaymentRepository、CanonicalOrderPayment、Outbox、Email；验收：transport/clock/ID 可注入、domain 不依赖 SDK，disabled/unsupported/unknown/pending/revocation uncertainty 有类型与契约测试。
- [ ] 2.5 实现 server-only 配置校验与 composition，统一 CUSTOMER_AUTH_SOURCE=supabase 加独立 SERVICE_INTEGRATION_MODE=test gates，并隔离 synthetic/canonical、Supabase project、provider account/environment；验收：缺配置/live/跨项目/未知模式在副作用前拒绝，返回资源身份参与验证、不仅检查 key 名，local 模式不回退真实服务；当期 customer-auth production disabled，不将 supabase 名称永久定义为 test-only，不另起 auth-source 配置名、不新增前端 token clients 或公开 server secrets。
- [ ] 2.6 建立可信 origin/内部 return-path、same-origin/CSRF、customer/guest owner、独立 admin 和 operator 授权共用边界；验收：Host/forwarded-host、协议相对与编码 redirect、订单号/邮箱/metadata、外来 provider ID 均不能授权，webhook 不误依赖用户 cookie/Origin。
- [ ] 2.7 建立网络 deadline、敏感日志过滤与外部副作用 opt-in/endpoint/收件人门；验收：A 可在外网全部拒绝时运行，关闭门不调用 provider，错误响应/日志无 token/OTP/私有 URL，发送和回调配置不触发自动发送、注册或转发。

## 3. 独立 Supabase schema、HTTP RPC 与会话密钥存储

验收层：A repository 契约 + B 隔离数据库。依赖：2；Docker/DB 缺失阻塞本组 B 及依赖该 durable store 的 C 执行，不阻塞其 A 或后续可独立 A。Specs：[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)、[engineering-foundation](specs/engineering-foundation/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[verified-guest-order-association](specs/verified-guest-order-association/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

- [ ] 3.1 建立独立 local/service-integrations Supabase harness 与安全生命周期入口；验收：仅在 loopback、精确 project/ports/schema marker/current-run owner 全匹配的 disposable 库允许 reset，远程/root/其他项目/retained dev volumes/错 marker 负向测试均拒绝。
- [ ] 3.2 编写版本化 service_integrations migrations，覆盖 synthetic orders/quotes、auth intents/sessions/限流、guest claims、attempts/bindings/operations/events/settlements/refunds、outbox/deliveries/suppressions/semantic coverage；验收：本 workdir 有序迁移、独立 ledger/checksum 防重复执行及 rollback/forward-fix、空库可完整建立，保留 local/commerce 和唯一 production canonical workflow，不使用 root legacy bootstrap 代替 schema，USD/非负整数/scope 唯一/不可变性与版本约束有真实 DB 断言。
- [ ] 3.3 实现 HTTP/RPC repositories 与 reserveAttempt、bindProviderObject、acceptVerifiedEvent、applyPaymentFact、reserveRefund、applyRefundFact 原子命令；验收：A 请求/结果契约及 B 行锁/CAS/唯一约束测试通过，payment/order/outbox 同事务，Worker 无 native TCP PostgreSQL 或 sequential HTTP 假事务。
- [ ] 3.4 实现 claimGuestOrders、auth intent consume、session revoke/refresh lease 与 outbox lease/finish 等原子 RPC；验收：回滚、过期 lease、旧 fence 更新拒绝及单次 intent 在真实 DB 中成立，不靠内存锁保证唯一性。
- [ ] 3.5 实施 RLS/GRANT 与 SECURITY DEFINER 最小权限、固定 search_path 和 scope 检查；验收：anon/customer、跨项目、任意 schema/table/SQL 输入均不能读写受限账本或执行越权命令，服务端合法 RPC 正常。
- [ ] 3.6 实现高熵 opaque app-session token、仅 hash 入库、provider access/refresh token 带认证加密与 key version；验收：独立密钥/rotation/旧 key 丢失/篡改密文/DB 写失败均有测试，不签发可用未持久会话、不退回明文或内存授权。
- [ ] 3.7 实现 integration-only synthetic order adapter 与可重建 seed/测试夹具；验收：同一 ports 的 owner/grant、不可变 quote、claim/paid/outbox 原子语义可测试，显著 synthetic 标识、无真实照片或履约/下载 API，绝不读取/迁移 local 模拟订单。

## 4. Supabase OTP、Google BFF、刷新退出与最小 UI

验收层：A + 会话/限流 B；真实 provider 证明留 12。依赖：2、3 的 ports/schema；B 依赖 3 实测通过，A 不依赖 C。Specs：[customer-auth](specs/customer-auth/spec.md)、[verified-guest-order-association](specs/verified-guest-order-association/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

- [ ] 4.1 扩展 AuthProviderPort/runtime 与请求级 Supabase client，保留 local email/password、disabled 和已落地 local_persistent 分支；验收：本地密码不会落入 Supabase OTP、无 fake 密码/session 迁移、两客户并行请求不共享可变 client/token，模式与错误投影契约通过。
- [ ] 4.2 实现真实 `signInWithOtp`/`verifyOtp(type: email)` 与登录/注册 `shouldCreateUser` 意图；验收：数字码方法不要求密码，错误/过期/复用/发送超时只返回安全结果，验证且 durable session 成功后才登录，应用不保存码/自造码/重复 Resend 发码，数字 `.Token` 模板列入 C 依赖。
- [ ] 4.3 实现跨实例 per-email/per-source 发码限额、重发冷却、verify 尝试上限与安全非枚举文案；验收：A 时钟/失败测试及 B 两实例限额一致性通过，provider timeout 不触发无界自动重发，前端倒计时不能替代服务端限制。
- [ ] 4.4 实现真实 `signInWithOAuth`/`exchangeCodeForSession`、server PKCE 与一次 browser-bound auth intent；验收：OAuth state 属于 Supabase/provider，SDK 经应用 request-scoped 服务端 storage 保存/读取按单次 intent 隔离的 verifier，跨 callback 请求用匹配 durable context，不等于替代/双重接管 provider state；cookie 不带 verifier、不新增前端 token client，缺失/过期/重放/竞争消费/换浏览器或发起 session/拒绝授权/兑换失败均不建第二会话，严格回跳 allowlist 且不泄露 code。
- [ ] 4.5 实现 session read 与 `getClaims` 签名/issuer/audience/exp/project/subject 验证，敏感动作接口要求 fresh `getUser`；验收：不信 `getSession().user`、解码 JWT 或浏览器邮箱，cookie 隔离且响应 private/no-store，HTTPS Secure 与纯 loopback HTTP 明示例外有请求级测试。
- [ ] 4.6 实现 durable 单飞 refresh 的 lease/fence/version、加密 token 先提交后响应；验收：B 并发/持久化失败/不确定刷新拒绝旧授权与旧 token 覆盖，opaque cookie 不因 token 刷新改变，撤销/权限变化/过期 lease 后不能复活 session。
- [ ] 4.7 实现同源 POST logout，先 durable revoke app session、仅清 customer cookie，再真实 provider signOut；验收：无 GET logout，admin/guest cookie 不变，DB 撤销失败不得声称撤销成功，远端失败明确“本地已退出，远端撤销待确认”，刷新竞态不能恢复已撤销会话。
- [ ] 4.8 接入既有登录/注册/Account 的数字 OTP、cooldown、Google、session/logout 与 pending association 安全状态；验收：labels/autocomplete/focus/键盘/触屏及错误反馈组件/路由测试通过，保留 local 表单，不显示假历史、不声称 global logout、不视觉重做，supabase customer 不获 admin 权限。

## 5. 已验证游客订单自动关联与资源连续性

验收层：A + synthetic B；canonical 客户/历史订单关联为 D。依赖：3、4 的身份/claim 契约；不等 C/D 才实现。Specs：[verified-guest-order-association](specs/verified-guest-order-association/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)。

- [ ] 5.1 实现每次 claim attempt（含后台重试）fresh `getUser` 的短时 verified-email proof；验收：绑定有效 BFF session/project/issuer/subject，OTP 与 Google 同规则，旧 JWT、Google metadata、浏览器邮箱/订单号不证明归属，trim/case 策略保留点和 plus-tag 的负向测试通过。
- [ ] 5.2 实现 authority 限定的未归属 exact-email 查询/claim adapter 与 synthetic 契约测试；验收：无原 guest cookie/无需第二挑战即可认领合格订单，跨项目、local_fake/local_persistent、含糊 legacy 和未批准 authority 不被搜索或改权，缺 canonical 只记录 D blocked。
- [ ] 5.3 实现逐订单 conditional ownership + immutable claim audit 原子提交；验收：B 同 subject 幂等、不同 subject 竞争、事务失败、提交后崩溃重试均最多一次改权/审计，已归属订单绝不转移，审计含 proof 时间/原因/request/order/subject 不含 token。
- [ ] 5.4 实现登录成功但 claim pending 的自动恢复与邮箱变更规则；验收：库或 fresh proof 不可用仍可保持合法登录但不展示未归属历史，重试重新验身份/eligibility，revoked session 与旧 proof 不能执行，改邮箱不迁移已归属订单、旧邮箱新持有人不能获旧历史。
- [ ] 5.5 实现/测试 order-only 授权与受保护通知页面入口契约；验收：保留五段 HMAC guest context、原 cookie/草稿/购物车/上传与独立定制行快照，不把其改成 opaque bearer；无 capability 可登录后合法关联，未授权先不出私有数据，媒体/预览/下载另验权限，synthetic 不冒充 D 页面接线。

## 6. Money、不可变报价与 durable payment 命令

验收层：A + synthetic B。依赖：2、3；Auth 读取使用既定 port，guest checkout 不要求注册。Specs：[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[stripe-checkout-adapter](specs/stripe-checkout-adapter/spec.md)、[paypal-checkout-adapter](specs/paypal-checkout-adapter/spec.md)。

- [ ] 6.1 实现 USD safe-integer Money、checked 算术与严格 decimal-string 解析/格式化；验收：`2.99/0.10/2/2.9` 精确往返，拒绝 JSON 浮点、parseFloat 路径、指数/空白/符号/逗号/超两位/负值/溢出/非 USD/非整数正 quantity，property tests 通过。
- [ ] 6.2 实现服务端 catalog/configured snapshot、优惠资格与 shipping rules 驱动的 immutable PaymentQuote；验收：独立 line/SKU/options/customization/附加价/折扣/运费/总额/version 全部纳入 canonical hash，篡改金额不被采用、同 SKU 不同定制不合并，私有资产仅内部引用，不硬编码另一免邮阈值且区分未启用 tax 与零。
- [ ] 6.3 实现稳定最大余数跨行折扣和行内商余数至多两组价格映射；验收：299 cents/3 = 1×99+2×100、可整除/多行/运费/零净额/极限数量 property tests 守恒，折扣仅一次、物理商品才运费，原定制 line identity 不变。
- [ ] 6.4 实现 provider 可表达性/最低额/行数/零组限制及明确 unsupported 结果；验收：基于 2.1 各端点依据，零额返回 `unsupported_zero_total`、不能精确表达时不请求收费，不将 0 抬为 1、不伪造 paid，不启用未批准免费订单或 provider 可改总额选项。
- [ ] 6.5 实现 reserve→remote→bind 的统一 attempt/operation 状态机与不可变 key/payload 摘要；验收：reserve 失败无 provider 调用，bind 失败/超时/进程中断保留原订单/key/unknown，活动 quote 不被新报价覆盖，A fault tests 与 B 保留记录通过。
- [ ] 6.6 实现单 active/unknown attempt、cancel/requote/provider-switch 的远端终结证明门；验收：B 两实例竞争只保留一个并仅 winner 调 provider，本地 cancel/浏览器关闭/超时不能解锁；当前官方证实适用的 EXPIRED/VOIDED 或其他终结确认及对象查询排除已付/pending/unknown capture 后才原子释放 hold、新建 attempt，不猜数值 expiry；有限自动 reconcile 次数/总时窗达到即 manual_required 且不解锁。
- [ ] 6.7 实现统一 checkout、authorized attempt-status 和最小 checkout/return UI 状态；验收：customer/guest ownership 与 mutation CSRF 有路由测试，浏览器不提交金额/商户/recipient/paid authority，success query 只读状态，未知/不可用/manual_required 如实展示与受同一预算/终结门约束的状态 retry/support，不提供盲再次支付；可能 hold 到 provider terminal 证实，不承诺固定时间可支付，local 模拟不接 provider。

## 7. Stripe Checkout 与 legacy seam 安全加固

验收层：新 ledger path 的 A + synthetic B，真实 test 链为 C；7.6 单独是旧列 seam 的 A 安全回归，不继承 durable attempt/quote/operation/inbox/outbox 或重启安全保证，旧业务全面接管为 D。依赖：2、3、6；共用 inbox/processor 完整联验依赖 9，仅用于新 ledger path。Specs：[stripe-checkout-adapter](specs/stripe-checkout-adapter/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)。

- [ ] 7.1 实现真实 Stripe Checkout create、Session/PaymentIntent/charge retrieve 及受支持 expire 调用；验收：mode=payment、test account、即时付款方式 allowlist、精确 line payload、批准回跳 origin、stable Idempotency-Key 有禁外网请求契约，不接受改变 quote 的 quantity/promotion/额外费用。
- [ ] 7.2 实现 create 返回校验、durable Session 绑定与 unknown 恢复；验收：金额/currency/mode/livemode/account 不符不返回可用付款结果，response lost/bind fail 保留原 key、不删单/新 key 重建，early event 待核对与超过证据窗口 hold 可重现。
- [ ] 7.3 实现 Stripe raw-body 验签与受控 endpoint secret rotation；验收：原始 timestamp 文本、严格 t、多 v1、constant-time/兼容官方 WebCrypto、默认绝对偏差 300 秒覆盖过去/未来/畸形/撤销 secret/raw tamper，无 Origin 的合法 webhook 可验收，尺寸/持久 ACK 接入共用 inbox。
- [ ] 7.4 实现 Session→PaymentIntent→成功 charge 的完整 paid proof mapper；验收：已存 Session 绑定、payment_status=paid、intent succeeded、amount/amount_received/gross/USD/test/account/charge 关系全核验，missing 用认证 retrieve 补证，陌生 Session 即使 metadata 正确仍不 paid。
- [ ] 7.5 实现 completed unpaid、async success/failure、expired 和 no_payment_required 分支；验收：completion/回跳不等于 paid，async 成功补齐证明才结算、后到失败/过期不逆转成功，延迟方式未获支持不启用，expire unknown 阻止新 provider 尝试。
- [ ] 7.6 单独加固现存 legacy Stripe seam，移除 floor 丢分、max(1) 抬价、completed 即付、metadata fallback 与调用后异常删单；验收：只用现有 Session/PaymentIntent/total/currency 旧列证明精确预期金额、强关联和 approved origin，共享纯 Money builder 不等于新增 durable quote；create 成功/可能成功但 bind 失败保留订单并 unknown/manual reconciliation，不删单或新 key 盲重建/伪造 paid，缺可信已存绑定不得 metadata 找单且再次创建 fail closed；不新增 schema/ledger、不声称旧 route durable operation/inbox/原子 outbox/重启安全，normalized 503 保留，新 ledger B/C 不冒充旧路径恢复证据。
- [ ] 7.7 实现真实 Stripe refund API 与 refund/charge retrieve adapter，目标从已验 charge/intent 派生；验收：stable refund key、server cents、account/test/currency/amount/绑定及 succeeded/pending/failed/canceled 映射有契约测试，外部逐笔 refund 不以 refunded 布尔代替，admin/余额预留接 9 而非占位返回。

## 8. PayPal Orders、server capture、验签与退款适配

验收层：A + synthetic B；真实 sandbox 链为 C。依赖：2、3、6；完整事件与退款联验依赖 9。Specs：[paypal-checkout-adapter](specs/paypal-checkout-adapter/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)。

- [ ] 8.1 实现服务端 client-credentials OAuth 与 expiry/skew/并发缓存，以及固定 sandbox transport；验收：仅 api-m.sandbox.paypal.com，secret/token 不泄露、错误 host/跨址 redirect 被拒绝，外部 links 不触发 fetch，OAuth 故障无 fake fallback。
- [ ] 8.2 实现真实 Orders v2 create(intent CAPTURE)、Order GET 与 durable bind/recovery；验收：单 purchase unit、预期单全额 capture、两位 decimal breakdown/299 cents 守恒、安全 return/cancel URL、create 独立 PayPal-Request-Id 有请求契约，response lost/bind fail 留原 key/unknown。
- [ ] 8.3 实现 owner-authorized same-origin server capture 路由与真实 capture API；验收：从 reserved attempt 派生 Order/quote、先 retrieve 核准再 reserve/call，CSRF/他人 Order/client amount/伪 success 拒绝，重复返回原 operation，capture key 不与 create/refund 混用，APPROVED 不是 paid。
- [ ] 8.4 实现 capture COMPLETED proof 与 Order/capture/refund authenticated GET；验收：payer 来源/批准关系、payee merchant、sandbox/app、Order/purchase unit/capture、gross amount/USD/状态一致才提交，PENDING/缺字段留 reconcile，不要求客户邮箱等于 PayPal payer 邮箱，不拿 net receivable 替代 gross。
- [ ] 8.5 实现官方 verify-webhook-signature HTTP adapter 与 PayPal webhook route；验收：真实 transmission headers、受控 webhook_id、原事件正确映射，仅 SUCCESS 可通过，FAILURE 400、OAuth/验证服务暂不可用 5xx，不自行下载 cert_url，SSRF/ID 替换/恶意 link/缺 headers 测试通过。
- [ ] 8.6 实现独立 transmission freshness/官方重投策略、before-bind 与 terminal-state recovery；验收：以当前端点证据确定容差、不照搬 Stripe 300 秒，超窗仅授权 GET 补证；无可靠 expire/cancel API 不臆造，补测当前官方证实适用的 EXPIRED/VOIDED/其他终结且无已付/pending/unknown capture 才释放 hold，不猜数值 expiry；本地取消/预算耗尽仍不可切换，次数或总时窗达到即 manual_required，客户 retry/support 不等于新付款，管理员不能无证据解锁或忽略款项，不承诺固定等待时间，capture response/webhook/reconcile 共用语义事实。
- [ ] 8.7 实现真实 PayPal capture refund API 与退款 GET/事件映射；验收：独立稳定 PayPal-Request-Id、server 精确余额 decimal、COMPLETED/PENDING/失败与 merchant/capture/Order/currency/amount 验证有契约测试，timeout 保留 unknown，外部 partial 逐 refund ID 记账并接 9，不以 simulator 替代 API 代码。

## 9. Durable event reconcile、并发结算与管理员剩余全退

验收层：A + B；C 分服务另验，canonical 原子接线为 D。依赖：3、6 及 7/8 的协议 adapter 和 A 契约，不以前组等待本组的联合 B 验证为前置；本组完成后补齐联合验证。邮件发送不必先完成 10，事务 outbox port/schema 必须已存在。Specs：[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[stripe-checkout-adapter](specs/stripe-checkout-adapter/spec.md)、[paypal-checkout-adapter](specs/paypal-checkout-adapter/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

- [ ] 9.1 实现共用 bounded raw inbox/ACK 边界和 scope+event ID 去重；验收：默认 256 KiB 超限 413，无效/畸形签名 payload 400，验签服务/DB 故障 5xx，仅 durable inbox/ignored 后 2xx，未知合法类型与 before-bind 事件均不丢弃或 metadata 找单付款。
- [ ] 9.2 实现事件 lease/fence worker、unmatched 绑定恢复与受保护 operator reconciliation 命令；验收：认证 retrieve 补足资源证明、指数退避及持久有限次数/总时窗、安全原 key 恢复生效，任一预算达到转 manual_required 并停止自动循环/保留 hold；操作与远端证据有审计，客户状态 retry/support 不重置预算，管理员不能无终结证据解锁、覆写 unknown 为失败或忽略款项，已验证迟到证据可原子解决；过期 worker 不提交，幂等窗口不明/过期 hold 而非换 key 重发。
- [ ] 9.3 实现 applyPaymentFact 的 event processed + capture ledger + settlement winner + synthetic paid + paid outbox 原子事务；验收：同 event/不同 event 同 capture 语义去重，事务中途故障全部回滚并可重放，不出现 paid 无 outbox 或先 processed 后失效。
- [ ] 9.4 实现单调付款历史、跨 provider 第二笔收款与 reversal/dispute 风险投影；验收：失败/取消/过期不逆转 paid，不同 capture 均留真实财务事实且只有一个 winner，第二笔 hold/manual、不重复履约/paid 邮件/自动退款，不自动争议、重扣或重付。
- [ ] 9.5 实现可信 admin full_remaining 命令/受保护操作入口，真实接通 7.7 与 8.7；验收：普通 customer/伪 admin/跨站/client amount/任意 capture 注入均拒绝，从 captured−成功退款−pending/unknown 预留在 capture 锁内计算并审计，零余额不调用，MVP 不提供任意 partial refund UI。
- [ ] 9.6 实现退款预留、provider 结果/webhook/retrieve 原子核对与唯一退款 outbox；验收：1000 已付−300 外部成功退款仅 reserve 700，两个 admin 争最后余额仅一方调用，timeout/bind fail 留额度与原 key、只在明确失败才释放，退款资源/状态/金额验证及重放不重复累计。
- [ ] 9.7 实现外部部分退款与本地 pending 竞态、矛盾/超额证据保存及 hold；验收：逐 refund ID 成功只计一次，pending 不算成功，冲突阻止新增退款、不裁剪金额/自动补偿；退款不删订单/媒体或倒退生产，canonical 通知/履约停止策略留待 D 批准。

## 10. 全部 MVP 邮件映射、事务 outbox 与 Resend

验收层：A + synthetic B；真实发送为 C、逐 producer 业务接线为 D。依赖：2、3、5 的访问契约及 9 的支付事件；模板 A 可在支付 B 未通过时独立推进。Specs：[transactional-email-delivery](specs/transactional-email-delivery/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[verified-guest-order-association](specs/verified-guest-order-association/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)。

- [ ] 10.1 建立与 spec/design 精确对应的 11 类/13 mappings 事件 port、版本/去重/收件人表：M01 OTP、M02 下单、M03 支付、M04 补材料、M05 重传、M06 待确认预览、M07 修改已满足、M08 修改无法满足、M09 生产、M10 发货、M11 物流、M12 数字交付、M13 异常联系；验收：逐项有目标 authoritative trigger 和 A/B case，design 所有 producer 名称仅目标合成契约不是当前已有实现，M04/M05 与 M07/M08 可各共享 aggregate event 的不同 subtype 但映射不丢，M01 仅 Supabase SMTP 不入 outbox，缺 producer 仍实现契约并逐项 D blocked，不发明修改/退款审批或改变两次修改规则。
- [ ] 10.2 实现 M02–M13 完整 HTML/纯文本模板及共用安全渲染器；验收：快照/内容断言覆盖全部变体、HTML escape/CRLF/header/长度/收件人校验，批准 HTTPS protected-page 链接，两种正文等价，无私图/附件/Storage 或 presigned URL/ticket/guest secret/OTP/token，点击不改变业务或消耗下载次数。
- [ ] 10.3 实现同库 event/state/outbox 原子生产与异库 durable publish-intent→consumer inbox/projection/outbox adapter 契约；验收：synthetic 故障/重放测试证明双侧 durable commit，不用 post-commit best-effort 或扫描任意旧订单；异库通知契约不能放宽 payment/order/outbox 同事务硬门，local queued 永不 drain 到 Resend。
- [ ] 10.4 实现业务 event/version/mapping/recipient scope 唯一 intent 和冻结 recipient/template/payload/hash/send-key；验收：下单/支付/发货取 authoritative order email、重试不随模板或邮箱变化，M10/M11 在两事实共同提交且政策选择时 MAY 合并、不强制，coverage 账本持久标记两个 mapping/event-version→message/intent 的覆盖且不重复单发，新 tracking version 可独立通知，key 长度不超 256。
- [ ] 10.5 实现 lease/renew/fence dispatcher 与真实 Resend send API；验收：enqueue 和每次 dispatch/retry 都检查发送批准/环境/允许名单/suppression，两个 worker 仅当前租约可提交，旧 worker 返回不覆盖新状态，API 2xx 有有效 message ID 仅标 accepted、缺 ID 留 unknown。
- [ ] 10.6 实现 Resend 24h retention 安全余量、原 payload/key 的有限重试及人工核对状态；验收：timeout/send 后落库前 crash 视为可能已接受，窗口内 bounded 重试、到期 `status_unknown` 不换 key，429 honor Retry-After、5xx deadline/budget/jitter、永久 4xx/配置错误/409 mismatch 停止，预算耗尽且可能已接受不得假称确定失败。
- [ ] 10.7 实现 Svix raw-body/id/timestamp/signature 验证及 durable delivery inbox/correlation；验收：invalid/replay/early message ID/DB fault/乱序有测试，可靠提交后才 ACK，区分 queued/in-flight/retry/accepted/delivered/bounced/complained/dead-letter/unknown，delivered 仅 provider 报告而非阅读/收件箱保证。
- [ ] 10.8 实现 hard bounce/complaint durable suppression、每次重试复查与安全 operator 处理；验收：晚到 accepted/delivered 不抹除不良事实，新 event/version 不能绕开 suppression，撤销允许名单或发送授权立即阻塞排队发送，解除 suppression/不确定后新发送需独立审计批准；退款 outbox 保留已批准事件语义、不擅自扩展十三项 MVP 模板类别。

## 11. A/B 完整矩阵、真实双 PID、crash 与重建证据

验收层：A + B，独立于 C/D。依赖：2–10 中对应实现；测试计划/runner 可先建，勾选各运行项须实际通过。Specs：[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[verified-guest-order-association](specs/verified-guest-order-association/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[stripe-checkout-adapter](specs/stripe-checkout-adapter/spec.md)、[paypal-checkout-adapter](specs/paypal-checkout-adapter/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

- [ ] 11.1 建立八 spec requirement/scenario→实施/交接任务→A/B/C/D case/evidence 矩阵与独立测试入口；验收：每场景可定位适用的正向/负向/幂等/错误或文档核对用例，foundation 保留的历史场景只作原范围合并核对、不冒充当前运行；无凭证跳过被算 PASS 的分支，C 不进入默认 offline 链，缺 Docker 明确 B 及依赖该库的 C BLOCKED，新 ledger 保证不覆盖 legacy seam。
- [ ] 11.2 在外网全部禁止条件下运行 A 协议/路由/UI/Money/security 全矩阵；验收：真实方法的 request shape/headers/body、签名 fixtures、tamper/missing/wrong mode/live/amount/currency/account/resource、CSRF/owner/admin、timeout/429/5xx、零额/分摊均有新通过证据，不访问公网/JWKS/provider，不把 fixtures 写成真实签名联调。
- [ ] 11.3 在专属 disposable run 从空库完整 migration 重建并验证 HTTP/RPC、RLS/unique/up/rollback/再建；验收：记录 run/marker/版本与重建日志、最终约束可重复通过，unsafe reset 测试拒绝外部/其他项目，retained dev 数据保留，Map/单元 mock 不计数据库证明。
- [ ] 11.4 启动两个独立 app PID 对同一 B 库竞争 active attempt、支付 event/semantic capture、paid commit 与第二笔跨 provider 事实；验收：记录不同 PID/运行身份，只有唯一应有副作用、两笔收款事实不丢，capture response/webhook/reconcile 竞态与成功后 expire 不逆转，同进程双调用不能代替本项。
- [ ] 11.5 对 reserve 前后、remote-return 前后、bind、inbox、payment/order/outbox 提交窗口注入 DB 故障和终止进程，再新 PID 恢复 retained 测试数据；验收：原 key/unknown/unmatched 可核对、事务无半提交/异常删单/重复副作用，日志指明 crash 位置与新旧 PID，而非仅重建对象模拟重启。
- [ ] 11.6 以真实双 PID 验证 claim 同/不同 subject、OTP 限流、session refresh/logout 和 last-refundable 竞争；验收：唯一 ownership/audit、新 fresh proof 才重试、限流跨实例有效、旧 refresh fence 不复活 session、最后 700 cents 仅一次退款请求、外部 partial+pending 冲突保持 hold。
- [ ] 11.7 以真实双 PID、受控 clock/transport 与进程 crash 验证 outbox/inbox/异库通知 adapter 恢复；验收：两 worker lease/过期 fence/send 后 accepted 落库前 crash、24h 边界、early webhook/重放/bounce/complaint、生产 publish-intent/消费 commit 窗口全部有 B 数据断言，保留原 payload/key 且不真实发送，不能拿 synthetic producer 结果通过 D。

## 12. C 外部 prerequisites 与逐服务实际执行（分别勾选）

验收层：C 准备与 C 实测严格分开。依赖：12.1–12.5 仅需 1–2 的环境/协议清单，可独立调查；12.6–12.10 各需本服务 A/B 通过、12.1 及对应准备项实际就绪/获批。Specs：[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[stripe-checkout-adapter](specs/stripe-checkout-adapter/spec.md)、[paypal-checkout-adapter](specs/paypal-checkout-adapter/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

准备项的勾选只证明清单核查/交接完成，可记录缺失和责任人；不表示已获批准或实测 PASS。任何缺失仍阻塞对应执行项，账号/凭证/回调“已配置”也不能替代运行证据。执行项须所有所列真实链分项取得证据才能勾选；允许报告其中实际通过的子用例，其余保持未通过。

12.6–12.10 互不作为前置；例如缺 SMTP 不阻塞条件齐备的 Google，缺 PayPal callback 不阻塞 Stripe。12.2 的 OTP 与 Google 准备证据分别取用，单项缺失仅阻塞对应真实链。

- [ ] 12.1 整理公共外部 opt-in、允许 endpoint、回调/forwarding 使用范围、时间窗口与 side-effect 批准清单；验收：逐项注明就绪/缺失/批准来源、执行负责人及停止条件，Google/Stripe/PayPal/Resend 无批准不得自动 tunnel/注册/转发，无部署/DNS/remote migration/live/git，密钥配置渠道不经过模型。
- [ ] 12.2 整理 Supabase 测试 project/issuer、Google client/consent/redirect、Site URL/allowlist、custom SMTP 与 `.Token` 数字码模板及自有邮箱发送授权；验收：每项核查记录不含 secret，SMTP 实际发送须单独批准，magic-link-only 或缺 SMTP/Google callback 明确各自 C blocked，不认为应用 Resend API 可替代发码。
- [ ] 12.3 整理 Stripe test merchant/account、test key/webhook secret、允许即时方式、批准 test callback/CLI forwarding 与端点幂等证据；验收：付款/退款/重投/retrieve 使用范围及缺项独立列出，fixture trigger 不当真实 Checkout，准备完成不等于开启转发或接通支付。
- [ ] 12.4 整理 PayPal sandbox app、merchant/buyer 两测试账号、webhook ID、批准 HTTPS callback 及 create/capture/refund 重试/时间窗依据；验收：scope 与账户角色明确，缺入口/端点证据分别 blocked、不自动开 tunnel，simulator 单列而不视为真实交易验签前提已通过。
- [ ] 12.5 整理 Resend approved sender/已授权域配置、API key、Svix secret、可达 callback、自有收件人 allowlist 和明确发送批准；验收：官方 test addresses 的模拟 delivery 事件与自有邮箱真实收件计划分别列出，缺域/回调不自动部署或 DNS 配置，没有批准即使有 key 也不得发送。
- [ ] 12.6 在 12.1/12.2 条件实际齐备后运行 Supabase 数字 OTP 真链及 BFF 会话用例；验收：经批准 SMTP 真实发码、verify、cookie/session、fresh verified-email、刷新/退出有脱敏证据，错误/过期/复用/限流按真实可触发与 fixture 分栏；不入应用 outbox、不记录验证码，不将 synthetic claim 说成历史业务关联。
- [ ] 12.7 在 12.1/12.2 条件实际齐备后运行真实 Google→Supabase PKCE callback、BFF 刷新/退出链；验收：批准的真实回调与 provider subject/confirmed-email 证据成立，取消/失效 intent/重放/安全回跳/remote revoke uncertainty 逐项记录实际或 fixture，cookie/Worker 请求隔离不降级；无 Google callback 就保持本项 blocked。
- [ ] 12.8 在 12.1/12.3 条件实际齐备后运行 Stripe test Checkout→测试付款→真实 webhook 验签→独立 retrieve/reconcile→admin full_remaining refund；验收：实际 Session/intent/charge/event/refund IDs 脱敏可关联、精确金额与账本一致，真实重投/恢复/可触发失败独立记证，unpaid/async/pending 等 fixtures 不冒充实测，未验证子链不勾整项。
- [ ] 12.9 在 12.1/12.4 条件实际齐备后运行 PayPal sandbox buyer approval→server capture→真实 webhook 官方验签→独立 GET/reconcile→admin full_remaining refund；验收：真实 Order/capture/payer/payee/event/refund 关系及金额可追溯，capture 成功不替代 webhook/recovery，pending/失败/partial/replay 区分真实可触发证据和 fixtures，simulator 不计真实签名 PASS。
- [ ] 12.10 在 12.1/12.5 条件实际齐备并再次检查发送授权后运行 Resend 真链；验收：授权允许名单 send 的 accepted/message ID、真实 Svix callback/delivery/suppression 有关联证据，官方测试地址模拟 bounce/delivery 与自有邮箱实际收件分开记录；accepted、provider-delivered、邮箱观察不混同，缺任一所需证据则对应子链未通过且本项不勾。

## 13. D conditional canonical wiring 与不可替代的审批停门

验收层：D。依赖：对应 A/B 完成；业务 E2E 还依赖对应 C 真链。**13.1 先行且必须实际获批；缺 C1/Phase C/canonical 或 producer 依赖立即停止本组实施并记 BUSINESS_BINDING_BLOCKED，13.1–13.6 保持未完成。** Specs：[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[verified-guest-order-association](specs/verified-guest-order-association/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[stripe-checkout-adapter](specs/stripe-checkout-adapter/spec.md)、[paypal-checkout-adapter](specs/paypal-checkout-adapter/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

- [ ] 13.1 核验并取得独立的 C1、Customization Phase C、canonical schema/customer/order/payment/outbox/producer 接线批准；验收：审批来源/范围、canonical ownership/snapshot/资源授权与事务能力均可追溯，不接受本 tasks 或 synthetic/C PASS 代批；缺一先 stop，仅可在 14.3 报告 blockers，不能以“完成检查”为本项勾选。
- [ ] 13.2 在 13.1 获批后编写并审阅 canonical migration/bridge 方案及实现所需迁移文件；验收：明确旧数据映射/回填、unknown 付款隔离、稳定 dedup keys、RPC 同事务与关闭/回滚路径，获准的本地隔离副本可验证；远程 migration/push 不执行，异库不能原子 payment/order/outbox 就继续 blocked、不 best-effort 双写。
- [ ] 13.3 在批准的 canonical authority 实现真实 customer ownership/verified guest claim 与 Account/通知保护页接线；验收：合法 OTP/Google 无原 guest cookie 自动关联真实合格业务测试订单，既有 owner/私有媒体/下载策略仍受保护，不认领模拟历史/独立上传草稿购物车，synthetic adapter 测试不得抵此项。
- [ ] 13.4 接线真实 canonical quote/checkout、provider attempts、payment/order/outbox 原子命令与获准 legacy 迁移 seam；验收：真实业务 test-mode 订单价格/定制快照/guest grant 与已核验资金一致、重放不重复效果，仅当 normalized 自身前提另获批准并证明成立才调整 503，否则该路径继续 unavailable 并记录未完成范围。
- [ ] 13.5 接入获准 canonical fulfillment/customer domain-event producers 与逐映射邮件、退款通知/履约停止策略；验收：M02–M13（含 M04/M05、M07/M08、M10/M11）均有真实 committed producer/version→durable outbox 证据、M01 仍仅 Auth SMTP，缺 producer 的映射保持 D 未完成，不以 UI 点击/synthetic event 替代，不直接由 provider adapter 开生产/下载。
- [ ] 13.6 在所有适用批准和对应 C 实测齐备后运行真正 canonical 业务 test-mode E2E；验收：游客购买/登录关联、真实两 provider 付款和退款、私有页面、获准履约事件与事务通知的正负向/重放证据完整，订单非 synthetic/local 模拟且有业务 producer 证明；无部署/live/remote migration 需求才可执行，否则保持 blocked 而非绕门。

## 14. 最终质量检查、分阶段 evidence 与未完成交接

验收层：A/B 质量与分层交接；全量完成另需 C/D。依赖：14.1–14.3、14.5 可在已实施 A/B 范围执行，不要求 C/D PASS；14.4 需 14.5 事实同步及全部适用 C/D 真实验收通过后完成。Specs：[service-adapter-boundaries](specs/service-adapter-boundaries/spec.md)、[engineering-foundation](specs/engineering-foundation/spec.md)、[customer-auth](specs/customer-auth/spec.md)、[verified-guest-order-association](specs/verified-guest-order-association/spec.md)、[provider-payment-integrity](specs/provider-payment-integrity/spec.md)、[transactional-email-delivery](specs/transactional-email-delivery/spec.md)。

- [ ] 14.1 对最终实现重跑 lint、typecheck、offline、fresh build→rendered 并对照 1 的当前基线；验收：新运行质量门通过、警告/历史失败与新回归有可追溯比较，未降 strictness/加宽 any/禁用测试，不能用旧 build 产物、历史数字或“代码仅写未测”勾选；失败可被 14.3 如实报告但本项未完成。
- [ ] 14.2 完成安全/默认关闭/authority 隔离与恢复策略审查；验收：secret redaction、RLS/CSRF/owner/admin、私有链接、local modes/503、test/live拒绝、关闭适配器后 inbox/outbox 可受控恢复及财务历史保留均有证据；无未经批准部署/迁移/发送/git 行为，Worker cookie/crypto 不兼容仍阻塞，不以降低边界修复。
- [ ] 14.3 输出可独立交付的 A/B 阶段报告和后续批次交接；验收：逐服务列实现状态、A/B 当前证据、C EXTERNAL_BLOCKED 与 D BUSINESS_BINDING_BLOCKED/精确缺项/责任人/下一动作，逐 M01–M13 producer 状态、准备与实测/fixture 区分、生产 NOT_ENABLED 清晰；可在 C/D blocked 时完成此报告，不把报告完成写成全部服务/全部 tasks 通过。
- [ ] 14.4 在未完成实施/实测/审批项真正解决后形成全量验收交接与 sync/archive 前三方重基审查；验收：全部 C/D 真实证据及逐 producer 业务链齐备、两个 customer-auth delta 对当前 main 的合并方案保留各自语义，未隐式执行另一个变更或发布/归档/git；C/D 仍 blocked 时本项及对应任务必须未勾，不能用 A/B 报告结束整个变更。
- [ ] 14.5 在后续实施交接时更新已有 [customer-auth-production-handoff](../../../docs/customer-auth-production-handoff.md)、[customer-auth-foundation-audit](../../../docs/customer-auth-foundation-audit.md)、[customer-auth-local-development](../../../docs/customer-auth-local-development.md)、[deferred-assumptions](../../../docs/deferred-assumptions.md)、[engineering-baseline](../../../docs/engineering-baseline.md) 与 [database-migrations](../../../docs/database-migrations.md) 等相关文档；验收：统一 CUSTOMER_AUTH_SOURCE 与独立 test gate、BFF/PKCE、完整 foundation migration 例外、当前可实现/已验 adapter 和仍延期的 production/D/其他 scope，逐服务/mapping/legacy seam 的实际证据不越界；旧 892 offline、7/11 rendered 及旧历史 tests 仅标历史，不能冒充当前结果，不删除原延期事项以制造完成，不改主 spec 或旧 change；本轮只规划此任务、不写这些文档。