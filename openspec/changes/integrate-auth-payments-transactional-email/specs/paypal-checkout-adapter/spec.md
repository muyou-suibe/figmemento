## Purpose

定义 PayPal Orders v2 sandbox 创建、批准后服务端 capture、官方 webhook 验证与资源对账契约，保证商户身份、金额和订单尝试关系在网络未知及并发场景下仍可信。使用独立集成账本和合成测试订单验收完整适配，不将模拟回调当真实签名证明，不接通未批准业务订单或 production/live。

## ADDED Requirements

### Requirement: Fixed sandbox service and scoped test identity

PayPal adapter SHALL 遵循 `provider-payment-integrity` 通用要求，仅面向显式绑定业务测试项目、PayPal REST app/project、sandbox merchant/payee 与 environment 的 synthetic integration orders。服务端 OAuth 与所有 Orders、capture、refund、retrieve、verify 请求 MUST 固定使用 `https://api-m.sandbox.paypal.com`，不接受 client、webhook body/header 提供的 API host，不跟随跳往非允许地址的重定向。OAuth secrets/tokens MUST 仅在服务端，测试商户与 payer 测试身份 SHALL 区分。production/live 始终禁用，无凭证不回退 local 模拟付款；D canonical bridge 仍需 C1/Phase C/order 批准，A/B 完整 adapter/local DB harness 不受该缺依赖阻塞。

#### Scenario: Sandbox merchant and buyer are correctly scoped
- **WHEN** 绑定测试项目的 buyer 为该项目授权 synthetic order 向配置 sandbox merchant 付款
- **THEN** 只调用固定 sandbox 服务并写独立集成账本，不写 local_fake/local_persistent 或旧 normalized 接口

#### Scenario: Wrong merchant project or live host
- **WHEN** 配置指向 live/未知 API host，或业务身份、REST app、merchant/payee 不匹配
- **THEN** 请求在副作用前 fail closed，不通过相同邮箱、订单号或自报 environment 补足授权

### Requirement: Exact Orders v2 server quote representation

PayPal Order SHALL 使用服务器 immutable USD quote、`intent=CAPTURE`、已批准 payer 流程及服务器允许的 return/cancel URLs；MVP SHALL 限定一个 purchase unit、一个预期全额 capture，拒绝 client 改写金额、currency、payee、intent 或目标订单。金额 MUST 从 integer cents 无浮点转换为两位 decimal strings，严格满足 item/discount/shipping breakdown 与总额关系。quantity/options/customization SHALL 保留独立 quote line 映射；需要表示非均匀单价时 MUST 使用至多两个整数单价组等精确表示，无法满足当前端点零行、最低正额或行数限制则 fail closed，不能用浮点修正差额。零总额 SHALL 显式 unsupported，不创建 1 cent 订单或假付。

#### Scenario: Create represents exact USD cents
- **WHEN** 已授权订单的 quote 总额为 299 cents，某行 quantity 3 需要分摊
- **THEN** 请求 decimal 总额为 `"2.99"`，行/折扣/shipping 分解守恒且定制行不合并，不产生 `"2.97"` 或浮点尾差

#### Scenario: Browser amount or zero quote
- **WHEN** browser 提交修改后的 amount/payee/currency，或服务器 quote total 为零
- **THEN** 不接受 client 金额/商户覆盖；零额返回 unsupported 且不创建 PayPal 收费资源

### Requirement: Reserved PayPal operations and recovery with stable request IDs

Orders create、capture 与 refund SHALL 分别 durable reserve 独立 operation、不可变请求摘要和稳定 `PayPal-Request-Id`，并绑定同一 order/attempt/quote/account/environment；不得给不同端点操作混用同一个业务 key。MUST 先 reserve 再 provider 请求再 durable bind。响应丢失、bind 失败或无法证明请求未执行时 SHALL unknown，保留订单与额度/active attempt，通过原 key 在官方保证条件内恢复及已知 Order/capture/refund 资源 GET/reconcile；不得删除订单、新 key 盲重试或假定所有端点相同幂等窗口。实施 SHALL 为各端点记录当前官方 URL、查验日期、适用版本、幂等支持/保留条件及恢复依据，未知/失效窗口 MUST hold，不编造期限或 provider exactly-once。

#### Scenario: Provider create succeeds before binding fails
- **WHEN** PayPal 已创建 Order，但进程在保存 provider Order ID 前失败
- **THEN** 保留原 create operation/key，early webhook durable unmatched；有依据同 key 恢复或核对，不能换 key 创建新 Order

#### Scenario: Capture response is lost
- **WHEN** capture 请求发出后超时，无法证明 PayPal 未执行
- **THEN** operation 标 unknown、阻止第二次独立 capture 和 provider 切换，由原 key/Order/capture GET 恢复

#### Scenario: Idempotency facts are unavailable
- **WHEN** 当前 capture/refund 端点的安全重放条件缺乏官方证据
- **THEN** A/B 可验证保守 unknown/hold 行为，相应 C 恢复验收 blocked，不猜测窗口后重新发送

### Requirement: Same-origin owner-authorized server capture

PayPal approval 回跳 SHALL 仅展示或触发受保护的服务器 capture 命令，不代表付款。capture MUST 要求 same-origin、CSRF 防护及服务器核验客户/游客对当前测试项目订单的 ownership；目标 provider Order ID SHALL 从已保留 attempt 派生，金额/币种 SHALL 从 immutable quote 派生，不从 client 接收。服务端 SHALL retrieve/核验 Order 的账户/payee、intent、purchase unit、资源绑定及允许 capture 的状态，原子保留 capture operation 后调用服务端 capture；重复请求返回该 operation 状态，不创建新付款。

#### Scenario: Authorized guest captures their approved order
- **WHEN** 拥有有效订单 capability 的游客在同源受保护请求中确认其已批准的 PayPal Order
- **THEN** 服务器使用已绑定 Order 和 quote 发起一次可恢复 capture，不要求注册账号或 client 提交 amount

#### Scenario: Foreign Order ID or cross-site capture
- **WHEN** 浏览器传入他人的 PayPal Order ID、篡改金额、伪造 success 参数，或跨源/无 CSRF/无 owner 权限请求 capture
- **THEN** 系统拒绝且不调用 capture、不暴露他人订单、不标 paid

### Requirement: Capture completion and exact merchant-resource proof

PayPal paid authority SHALL 核验固定 sandbox API/凭证上下文、实际 payee merchant ID、payer 身份/approval 与该 Order 的服务端关系、Order ID、`intent=CAPTURE`、单一 purchase unit/reference、capture ID 对该 Order/attempt 的不可变绑定、capture `status=COMPLETED` 以及 gross amount/currency 精确匹配 quote。payer ID SHALL 从认证 provider 资源取得并与该尝试批准事实绑定，不以 client payer ID 或邮箱判断；不能把客户邮箱必须等于 PayPal payer 邮箱作为新增业务规则。PayPal 没有 Stripe 式 `livemode` 字段时 MUST 使用固定 sandbox endpoint、配置 account/project 与认证资源证明环境，不能信任 body 自报测试。平台费用/net receivable SHALL 不替代核验客户 gross amount。必要字段缺失 SHALL 认证 GET 补证并 pending reconcile，任一冲突不付费。

#### Scenario: Valid server capture response is paid authority
- **WHEN** 已授权 capture response 经服务端资源 GET 补足后证明正确 Order、payer/payee、capture COMPLETED、USD 与精确 gross amount
- **THEN** 可经通用 ledger/order/outbox 原子事务确认付款，不必等浏览器回跳，也不重复等待 webhook 再发 paid 通知

#### Scenario: Approved or pending is not paid
- **WHEN** Order 为 `APPROVED`、收到 `CHECKOUT.ORDER.APPROVED`，或 capture 为 `PENDING`，甚至外层 Order completion 但未证明 capture COMPLETED
- **THEN** 保持未付/待核对，不开始履约，不将 approval 或前端成功提示视作到账

#### Scenario: Completed capture has inconsistent proof
- **WHEN** capture COMPLETED 但 merchant/payee、payer 关系、Order/capture ID、currency、exact amount 或 purchase unit 数量不符，或字段缺失
- **THEN** 不标 paid，保存冲突/缺证并 GET/reconcile；metadata/custom_id/invoice_id 不能补成付款授权

### Requirement: Official webhook signature verification without certificate fetching

PayPal webhook SHALL 在 raw-body 读取上限内保留原文，验证所需 `PAYPAL-AUTH-ALGO`、`PAYPAL-CERT-URL`、`PAYPAL-TRANSMISSION-ID`、`PAYPAL-TRANSMISSION-SIG`、`PAYPAL-TRANSMISSION-TIME` 的存在、格式与时间戳策略，然后使用服务端 OAuth 调用固定 sandbox 的 `/v1/notifications/verify-webhook-signature`。请求 SHALL 从这些真实 headers 映射 `auth_algo`、`cert_url`、`transmission_id`、`transmission_sig`、`transmission_time`，`webhook_event` 来自收到的原始事件；`webhook_id` MUST 取本测试 app/account/environment 的受控配置，绝不信任 body 的 webhook ID。系统 MUST 不自行 fetch/download `cert_url` 或事件 links，避免 SSRF；证书 rotation SHALL 由官方验证服务处理，配置 webhook ID rotation 仅允许同 scope 的显式有效列表。仅 `verification_status=SUCCESS` 可通过；FAILURE/无效输入 400，网络/OAuth/验证服务不可用 5xx retryable，禁止开发环境放行。

#### Scenario: Official verifier confirms a real sandbox delivery
- **WHEN** 真实 sandbox webhook headers 与未改动事件用配置 webhook ID 提交官方验证，返回 SUCCESS
- **THEN** 系统再执行 durable inbox 与资源核验流程，不因签名有效就直接付费

#### Scenario: Certificate URL attempts SSRF or webhook ID substitution
- **WHEN** header cert_url 或事件 link 指向内网/任意地址，或 body 声称另一 webhook_id
- **THEN** 不发起对该地址的 fetch，拒绝不合法 header，官方验证仍只能使用固定服务与受控 webhook ID，不跟随输入地址

#### Scenario: Verification unavailable or failed
- **WHEN** 官方验证超时、OAuth/服务故障、响应格式不可用或返回 FAILURE
- **THEN** 不信任事件；暂不可用返回 retryable 5xx，明确验证失败返回 400，不能以 mock/local fallback 放行

### Requirement: PayPal transmission freshness and durable inbox semantics

PayPal webhook SHALL 检查 transmission timestamp 合法性、未来偏差及有限新鲜度策略；实施 MUST 根据当前官方重投/重发语义记录具体容差与证据，区别 event create_time 与 transmission_time，不臆造 PayPal 与 Stripe 相同窗口。过期/未来/畸形投递 MUST 不直接更新付款，合法重投 SHALL 按已验证事件身份去重；超窗历史事件只能由独立授权服务端 retrieve/reconcile 补证，不能关闭时间校验。官方验证成功且 durable inbox 提交后才 SHALL 2xx，DB fail MUST 5xx；未知合法 type SHALL durable ignored 后 ack；before-bind 事件 SHALL unmatched pending reconcile。该入口 MUST 不依赖 browser Origin、cookie 或 CSRF，capture 入口则仍执行相应浏览器防护。

#### Scenario: Early capture event arrives without a browser Origin
- **WHEN** 官方验证有效的 capture 事件在 create/capture bind 前到达且没有浏览器认证字段
- **THEN** durable unmatched 后 2xx，后续认证资源核对恢复，不能因没有 Origin 拒绝或凭 custom_id 给订单 paid

#### Scenario: Database unavailable or unknown valid type
- **WHEN** 官方验证通过但 inbox 无法写入，或事件为尚未支持的合法类型
- **THEN** DB 故障返回 5xx，未知类型只在 durable ignored 后 2xx，不悄然丢弃有效事件

#### Scenario: Stale timestamp cannot bypass freshness checks
- **WHEN** transmission timestamp 畸形、超未来容差或超已记录的有限新鲜度窗口
- **THEN** 该投递不作为付款依据；需要历史恢复时使用认证 GET/reconcile，不能用 event 创建时间替换 transmission 时间或无限放宽窗口

### Requirement: Authenticated resource retrieval and independent reconciliation

PayPal webhook 与恢复 SHALL 使用固定 sandbox 的认证服务端 Order/capture/refund GET，核对实际资源、payer/payee、gross 金额币种及绑定，而非信任 payload links、custom_id/invoice_id 或 event type 名。有效 capture COMPLETED webhook SHALL 只有在能证明 capture→Order→reserved attempt/quote 关系后付款；暂时查不到资源或网络不可用 SHALL durable pending reconcile 并退避重试，不标失败/已付或新建 Order。server capture response 可作为付款权威，但 C 验收 MUST 分别实测真实 webhook 验证及独立 GET/reconcile 恢复，不能用一次 capture 成功替代其余证据。

#### Scenario: Capture webhook refers to an unrelated Order
- **WHEN** 签名验证有效且 payload 的 custom_id 看似匹配，但 GET 的 capture/Order/payee 不属于已保留尝试
- **THEN** 事件隔离而不付费，不用 metadata 查询任意订单建立绑定

#### Scenario: Provider GET temporarily fails after durable receipt
- **WHEN** inbox 已提交，但 Order/capture GET 暂时不可用或资源尚未可见
- **THEN** 保留 pending reconcile 并可恢复重试，不把已 durable 接收误称已业务处理，不产生假 paid

#### Scenario: Capture passed but webhook and recovery are untested
- **WHEN** 真实 sandbox capture 已通过，但无真实 webhook 验证或独立 reconcile 故障恢复证据
- **THEN** C 对 capture 单独记录通过，webhook/reconcile 保持未通过或 blocked，不宣称 PayPal 集成验收完成

### Requirement: PayPal terminal-state proof and concurrent settlement safety

PayPal approval/order 的本地取消 SHALL 不证明远端 uncapturable；切换 Stripe 或新 PayPal attempt 前 MUST 通过当前端点支持的终结操作及 Order/capture retrieve/reconcile 证明已不能付款、无 pending/unknown capture。端点无可靠 expire/cancel 能力时 SHALL 等待可验证终结或人工核对，不臆造 API、不仅删除本地 attempt 解锁。capture response、webhook 与 reconcile SHALL 使用 scoped capture ID 语义去重并跨实例原子提交 payment/order/outbox；不同成功 capture MUST 记录第二笔资金并 hold/manual，不重复履约或自动退款。迟到 denied/failed/expired 不得逆转 paid。

`EXPIRED`、`VOIDED` 或其他终结确认 SHALL 仅在实施时当前官方资料确认其适用资源/端点及不可再收款语义、且该 Order/capture 的认证远端证据排除已付/pending/unknown capture 时才作为 active hold 释放依据；这些名称不是宣称 Orders v2 当前必有某个状态或操作，不猜测数值 expiry。自动 reconcile SHALL 持久追踪有限次数/总时窗，任一上限达到即 `manual_required`、停止自动轮询并保留 hold；客户端显示待核对、受预算与终结门约束的状态 retry/support，不把 retry 当新付款许可。管理员核对 SHALL 有证据/操作审计，但不能无远端证据解锁或忽略款项事实。可能一直 hold 到 provider terminal 可证实，不承诺固定时间后可支付；已验证迟到事实或受保护人工查询仍可核对并原子解决该状态。

#### Scenario: Approved Order remains capturable after local cancel
- **WHEN** 用户取消本地流程但 PayPal Order 仍 APPROVED，或 capture unknown 无法排除到账
- **THEN** 阻止新 provider 尝试并继续核对，不声称本地 cancel 已撤销 PayPal 授权

#### Scenario: Officially confirmed terminal Order permits switching
- **WHEN** 当前官方证据支持的 EXPIRED、VOIDED 或其他终结事实被认证 Order/capture 查询证实，且没有已付/pending/unknown capture
- **THEN** 原子记录终结证据、结束旧 attempt 并释放 active hold 后才允许新尝试，不基于本地计时或猜测 expiry 放行

#### Scenario: Automatic reconciliation reaches its bound
- **WHEN** 自动 reconcile 次数或总时窗达到上限而 PayPal 远端仍可 capture 或无法证明终结
- **THEN** 转 manual_required 并保留 hold，客户可见受控状态重试/联系支持且没有固定可支付时间承诺，管理员不能通过 override 忽略款项或无证据解锁

#### Scenario: Capture response and webhook race
- **WHEN** 两实例同时处理同 capture 的已核验 server response 与 webhook，随后 reconcile 重放
- **THEN** 一个付款迁移与一个 paid outbox 提交，后续重放不重复履约，DB 中途故障可安全恢复

#### Scenario: A second distinct capture is discovered
- **WHEN** 另一个 capture 或跨 Stripe 的第二笔真实测试成功收款被核验
- **THEN** 保留每笔资金事实、订单 hold/manual，不能当重复 event 丢弃或自动退第二笔

### Requirement: Authorized capture refunds and external partial truth

PayPal refund SHALL 仅对服务器取得的已核验 COMPLETED capture 执行 authorized admin `full_remaining`，并遵循通用余额锁、成功加 pending/unknown 预留、稳定 `PayPal-Request-Id` 与超时恢复。请求 decimal amount MUST 精确来自服务器可退 cents；返回/refund webhook/GET MUST 核验 refund ID、capture/Order 关系、merchant/sandbox、currency、amount 与 `COMPLETED` 成功状态，PENDING 不算成功，只有明确失败证据才释放预留。外部部分退款 SHALL 按真实 refund ID 累计且不超 capture，不假定收到 `PAYMENT.CAPTURE.REFUNDED` 就是全额；replay 与 outbox SHALL 语义去重。reversal/争议仅 hold/reconcile，不提供任意 partial UI 或自动争议处理。

#### Scenario: Last refundable balance is requested concurrently
- **WHEN** 两管理员实例同时对同 capture 请求最后一笔 full_remaining
- **THEN** 仅一个预留通过并调用 refund，另一个报告余额已预留；timeout 保留 unknown，不再次独立退款

#### Scenario: External partial refund and local timeout converge
- **WHEN** GET/webhook 返回真实部分退款或某 unknown operation 对应的 COMPLETED refund，并随后重复投递
- **THEN** 按 refund ID 只累计一次、结算匹配预留并原子生成对应 outbox，保留原 paid capture 和精确可退余额

#### Scenario: Wrong merchant or capture on a refund
- **WHEN** 已验证事件中的 refund 属于其他 merchant/capture，或 amount/currency 与预留不一致
- **THEN** 不将该退款结算到当前订单，保存证据并 hold/reconcile，不能凭 reference/metadata 绕过绑定

### Requirement: Real PayPal evidence is distinct from simulator mocks

PayPal 验收 SHALL 将离线 mocks、PayPal webhook simulator 与真实 sandbox 商户交易明确分开；simulator/mock MUST 不作为真实签名验收证明。A SHALL 覆盖 decimal parse/299 cents 分摊、tamper/missing/wrong environment/amount/currency/order/capture/payer/payee、SSRF/签名/headers/timestamp、owner/CSRF、APPROVED/PENDING 不付及请求 unknown；B SHALL 覆盖 early inbox、event/capture/refund duplicate、乱序、两实例事务、DB fault 与最后可退余额并发；C SHALL 使用真实 sandbox buyer/merchant 完成 Orders、server capture、真实 webhook 官方验签、认证 GET/reconcile 与适用幂等恢复证据。缺账号/回调/官方端点依据 SHALL 分项 blocked，不阻塞可独立完成的 A/B，D canonical 业务验收另受批准门约束。

#### Scenario: Simulator verification is the only webhook evidence
- **WHEN** mocks/simulator 场景通过但没有真实 sandbox 交易产生的已验证 webhook
- **THEN** 仅记录模拟契约证据，真实签名 C 项保持 blocked/未验收，不声称 PayPal 真实事件已通过

#### Scenario: Full sandbox evidence does not enable production
- **WHEN** A/B/C 均有当前实际证据，但 D 缺 C1、Phase C 或 order bridge 批准
- **THEN** D 标 blocked，synthetic 验收不扩张为业务上线，production/live 始终禁用