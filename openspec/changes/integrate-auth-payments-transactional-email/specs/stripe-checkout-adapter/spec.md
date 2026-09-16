## Purpose

定义 Stripe Checkout 测试环境适配的金额守恒、严格付款确认、签名事件接收及网络失败恢复契约，纠正旧路径数量分摊与订单回退绑定风险。通过独立 provider 账本和合成订单验证完整适配能力，但不接通本地模拟权威、不解除 canonical 业务批准门且始终禁用 production/live。

## ADDED Requirements

### Requirement: Stripe test-only adapter with isolated authority

新 ledger path 的 Stripe adapter SHALL 遵循 `provider-payment-integrity` 全部通用要求，仅为显式绑定业务 test-sandbox 项目与 Stripe test account 的 synthetic integration orders 工作，canonical bridge 另受 D 批准。请求、凭证及 webhook endpoint/account MUST 同 scope，production/live 始终禁用，不支持 Connect/多商户、订阅或未经批准的 canonical bridge。完整 adapter 与本地数据库 harness SHALL 可在 A/B 独立实现验证；真实 Stripe 测试事件属于 C，C1/Phase C/order 批准属于 D，缺依赖不得把 provider 结果导入 local 模拟库或旧 normalized 503 路由。本规范除最后的 legacy seam requirement 外，全部 requirement/scenario 的 durable attempt/quote/operation、inbox、原子提交及恢复保证均指新 ledger path；旧路由不自动继承这些尚不存在的能力，仅执行最后 requirement 明列的兼容安全加固。

#### Scenario: Account mismatch or live mode
- **WHEN** 使用 live key、事件 `livemode=true`、账户与测试身份绑定不符，或未知运行模式
- **THEN** 阻止付款副作用或隔离已接收事件，synthetic、canonical 和 local 模拟订单均不得因此 paid

#### Scenario: Business bridge remains unavailable
- **WHEN** Stripe adapter 与本地合成订单验证完成但 canonical 批准缺失
- **THEN** 可报告 A/B 当前结果，D 标 blocked，production/live 与旧 normalized 接口停门不解除

### Requirement: Exact Checkout line allocation without rounding loss

Checkout SHALL 使用 immutable server quote 的 USD integer cents，不信任 client 价格。对每个独立 quote line 的 quantity `q` 与折后净额 `T`，MUST 用整数商 `b = T div q` 与余数 `r = T mod q`，最多映射为两个 provider 单价组：`q-r` 件各 `b` cents 与 `r` 件各 `b+1` cents；零数量组不发送。拆分 MUST 保持原 line/options/customization 的内部映射，且各组总额严格等于 `T`。discount 仅计一次，shipping 与全部行合计 MUST 等于 quote total，不得再次套用改变总额的 provider promotion/自动费用。

#### Scenario: 299 cents across three units conserves cents
- **WHEN** 某行折后总额为 299 cents、quantity 为 3
- **THEN** Checkout 表达为 1 件 99 cents 加 2 件 100 cents，总额严格为 299，而不是每件 99 产生 297 cents

#### Scenario: Divisible and customized lines remain distinct
- **WHEN** 一行 300 cents/quantity 3，另有相同 SKU 但不同 customization 的一行
- **THEN** 第一行只需一个 100 cents 组，两行各自保留 quote line 映射，不因 SKU 相同而合并定制快照

#### Scenario: Multi-line discount and shipping remain conserved
- **WHEN** 服务器按确定性整数规则将折扣分配到多行且存在 shipping
- **THEN** 请求行组非负，折扣分配总和准确且加 shipping 后与 quote total/hash 绑定的期望值完全相等

### Requirement: Explicit zero and provider amount limitations

Stripe adapter MUST 移除以 `Math.max(1, ...)` 强行抬价的未来行为；零总额 SHALL 显式 `unsupported_zero_total` 且不创建 Session、不伪造免费订单 paid。非负零行以及拆分产生的零单价组 SHALL 依据实施时当前 Checkout 端点官方零价、行数与最低正付款额限制判断是否可原样表达；无法表达 MUST fail closed，不能省略金额后制造不一致、合并不同定制、抬价或假付。首发 SHALL 禁止能改变服务器 quote 总额的 provider 侧可调 quantity、promotion 或额外费用设置。

#### Scenario: Zero quote does not become a one-cent charge
- **WHEN** 折扣后含 shipping 的 quote total 为零
- **THEN** 返回明确不支持，既不发起 1 cent Checkout 也不产生已付事件

#### Scenario: Zero group or small positive payment violates endpoint limits
- **WHEN** 1 cent/quantity 3 的分组含零价组，或某正总额低于当前端点允许值，无法原样表达
- **THEN** 返回金额表示不支持并保留 quote，不把每件提高到 1 cent 或默默改变 quantity

### Requirement: Durable Checkout creation and lost-response recovery

创建 Session 前 SHALL durable reserve order attempt、quote hash、Stripe account/test scope、operation 与稳定 `Idempotency-Key` 和请求摘要；只有 reserve 成功才调用 Checkout create。返回资源 MUST 通过 mode、环境、currency、amount_total 与关联核验后 durable bind session ID，后续 PaymentIntent/charge 绑定 MUST 经该 Session 的服务端关系验证。网络超时、create 后 DB 失败或 webhook 早到 SHALL 保留 pending/unknown operation 和原订单；恢复 MUST 使用原 key 的有证据重放及 Session/PaymentIntent retrieve/reconcile，不能删单或新 key 盲 create。Stripe 每个 create/expire/refund 端点幂等与恢复能力 SHALL 在实施时记录当前官方 URL、查验日期、版本/端点及适用条件，不硬编码臆测窗口或 exactly-once 保证。

#### Scenario: Checkout create returns a bound resource
- **WHEN** 服务器保留尝试后收到账户正确、`mode=payment`、`livemode=false`、金额币种匹配的 Session
- **THEN** Session 与唯一 attempt/quote 持久绑定后才返回允许的 Checkout URL，metadata 不替代该绑定

#### Scenario: Session exists but local binding fails
- **WHEN** Stripe 已创建 Session，但响应丢失或 bind 事务失败
- **THEN** 保留订单、原 key 与 unknown 尝试，early webhook durable unmatched，恢复不执行旧路径的异常删单

#### Scenario: Key protection is no longer provable
- **WHEN** 无法证明当前端点仍能按原 key 安全恢复且 Session 身份未知
- **THEN** 阻止新的 Checkout 和跨 provider 切换，进入 reconcile/manual hold 而非猜测 Session 不存在

### Requirement: Raw-body signature timestamp and rotation validation

Stripe webhook SHALL 对受限原始 body 与原始 timestamp 文本验签，不得 JSON parse/serialize 后验签。MUST 验证 `Stripe-Signature` 中严格合法的 `t` 和至少一个匹配的 `v1`，使用受控测试 endpoint secrets 与 constant-time 验证，并验证绝对时间偏差默认不超过 300 秒；超未来容差、过期、格式错误或缺失 MUST 400。rotation SHALL 只在显式有效区间接受 active 与 retiring secrets，支持多个 `v1`，不得长期接受已撤销 secret。raw-body 上限、durable inbox 后 2xx、DB fault 5xx 和未知合法类型 ignored 记录 MUST 遵循通用契约；webhook 不依赖 Origin 或浏览器 CSRF。

#### Scenario: Raw-body tamper and missing signature
- **WHEN** JSON 语义相同但字节被改动、签名缺失、timestamp 非法/超容差或全部 `v1` 不匹配
- **THEN** 返回 400，不以重新序列化后的内容通过验证，也不更新付款

#### Scenario: Rotation overlap and retired secret
- **WHEN** 多 `v1` 中一个匹配有效 rotation secret，随后同 retiring secret 被撤销
- **THEN** 有效重叠期间可验签并持久入 inbox；撤销后不能继续接受该 secret 的新投递

#### Scenario: Valid webhook without browser Origin
- **WHEN** Stripe 在无浏览器 Origin/cookie/CSRF token 的请求中发送有效事件
- **THEN** 根据 provider 签名及 scope 验证后 durable inbox，再 2xx，不要求浏览器认证

### Requirement: Strict Session and PaymentIntent paid authority

Stripe paid 判定 SHALL 同时核验 event ID/结构、可信 account scope、event 与资源 `livemode=false`、Session `mode=payment`、正确已绑定 session ID、`payment_status=paid`、USD `amount_total` 精确等于 quote，以及服务端 Session 对应 PaymentIntent ID、该 intent 的 `status=succeeded`、currency/amount/amount_received 与期望 gross cents 一致；其实际成功 charge 标识与 intent 关系 SHALL 被核验并作为收款语义去重依据。缺少字段或事件不含全部资源 SHALL 通过认证 retrieve 补证，未证实前 pending reconcile。签名有效、`metadata.order_number` 或 `client_reference_id` MUST 不允许 fallback 查任意订单 paid；资源 ID 不可被不同 attempt 重绑定。

#### Scenario: Exact bound paid Session succeeds
- **WHEN** 已绑定 Session、PaymentIntent 与成功 charge 的所有环境、账户、状态和金额币种检查一致
- **THEN** 仅向该 attempt 的 payment/order/outbox 事务提交一次 paid，记录 provider 证据

#### Scenario: Foreign Session carries a real order number
- **WHEN** 签名有效 Session 的 metadata 指向本地真实订单号，但 Session/intent 不属于该订单已保留尝试
- **THEN** 不通过 metadata fallback 付费，事件 durable unmatched 或 rejected 并由保留 operation 核对

#### Scenario: Paid payload has missing or conflicting proof
- **WHEN** payload 缺 `payment_status`、`livemode`、intent/charge 关系，或 mode、商户、金额、USD、Session/intent ID 任一不符
- **THEN** 不标 paid，缺证通过 retrieve/reconcile，冲突隔离且保留审计

### Requirement: Completion is distinct from asynchronous payment success

adapter SHALL 区分 Session completion 与付款到账。`checkout.session.completed` 且 unpaid/pending MUST 不标 paid；MVP SHALL 明确限制请求为当前官方支持的即时付款方法 allowlist，未实现延迟方法不得启用。即便受到限制，遇到 `checkout.session.async_payment_succeeded` 或 `checkout.session.async_payment_failed` SHALL durable 接收并按通用严格资源核验 reconcile：成功只有完整 paid 证据才提交，失败只能结束未付状态，不能逆转 paid。`no_payment_required` 不构成本变更的零额支付支持。

#### Scenario: Completed but unpaid Checkout
- **WHEN** 收到有效 `checkout.session.completed`，但 Session unpaid 或 PaymentIntent 未 succeeded
- **THEN** 保留未付/pending reconcile，不发送付款成功通知或开始履约，浏览器成功返回也不改变结论

#### Scenario: Async success or failure arrives after completion
- **WHEN** 先收到 unpaid completion，后收到 async success 或 async failure
- **THEN** success 必须经 Session/intent/charge 金额绑定核验才 paid；failure 仅在仍未付时生效，paid 后的 failure 不逆转

#### Scenario: Delayed method is requested before it is enabled
- **WHEN** 客户或配置尝试启用即时方法 allowlist 外的延迟付款方式
- **THEN** Checkout 创建前拒绝该方式，不把不支持的异步行为当即时成功

### Requirement: Remote terminal proof and duplicate charge hold

Stripe Session 的本地 cancel SHALL 不被当作 Stripe 端已失效；切换尝试/provider 前 MUST 使用受支持的 expire 与认证 retrieve/reconcile 核验 Session 已不能完成付款且无 pending/success/unknown PaymentIntent 收款风险。expire 请求丢失或 Session 已完成未明确付款时 MUST block。跨事件/实例同 charge SHALL 语义去重；不同成功 charge SHALL 均记资金事实并对订单 hold/manual，不再次履约或自动退款。

#### Scenario: Browser cancels while Session remains open
- **WHEN** 用户回到 cancel URL 或本地取消，但服务端取回 Session 仍 open，或 expire 结果 unknown
- **THEN** 不允许新 PayPal/Stripe active attempt，先终结/核对旧资源

#### Scenario: Paid event races expiry
- **WHEN** paid 与 expired/async failure 由两个实例乱序处理
- **THEN** 已核验付款事实不被过期逆转，同 charge 的 paid outbox 只提交一次

### Requirement: Stripe full-remaining refund and external refund reconciliation

Stripe 退款 SHALL 遵守通用 authorized admin、full_remaining、capture 级原子预留、稳定 operation/key 及 unknown 停门；目标 MUST 从已核验成功 charge/PaymentIntent 关系在服务器派生，不能采用 client 指定目标/金额。返回及 webhook/retrieve 的 refund ID、charge/intent、account/test、currency、amount 和状态 MUST 核验，只有 `succeeded` 才累计成功退款；pending 保留预留，明确 failed/canceled 经核验才释放。外部部分退款 SHALL 按实际 refund ID 逐笔对账，不能仅用 charge refunded 布尔值假设全额；同 refund 不同事件去重且原子 outbox。reversal/dispute SHALL hold/reconcile 而非自动化处置。

#### Scenario: Refund timeout and webhook recover one operation
- **WHEN** full_remaining 请求超时，随后匹配原 charge、金额、test account 的成功 refund webhook 到达
- **THEN** 原 unknown 预留结算为该笔成功退款，重复命令/事件不再次退款或追加重复 outbox

#### Scenario: External partial refund updates remaining balance
- **WHEN** Stripe 后台对已付 charge 部分退款，且同 refund 经 webhook 与 retrieve 重复返回
- **THEN** 仅累计实际成功金额一次，保留原 paid 事实，下次授权 full_remaining 扣除该金额及全部 pending 预留

### Requirement: Stripe legacy seam remediation and evidence boundaries

后续实现 SHALL 将已观察到的旧 `floor(discountedTotal / quantity)` 丢分、`max(1)` 抬价、completed 即付、metadata fallback 与 provider 请求后异常删单行为列为必须消除的安全兼容风险。legacy seam SHALL 仅使用现有旧列 Session、PaymentIntent、total、currency 核验服务端预期精确金额/币种与 Stripe 对象强关联，并使用 approved origin 构建回跳；共享纯 Money 分摊函数不等于持久化新 PaymentQuote。旧列缺失/不可信时 MUST unavailable 或人工核对，不能补造 attempt/quote/operation 或新增 schema 来冒充兼容修复。认证 retrieve 须核验已保存 Session→PaymentIntent 关系、成功付款事实、test account/environment 与精确金额；缺少可信 Session 绑定 MUST NOT 以 metadata/order_number/client_reference_id 找单或写 paid。验签与 unpaid/零额不付等安全拒绝回归 SHALL 保留。

旧 route 没有 integration ledger，MUST NOT 声称 durable reservation/inbox、原子 outbox、自动恢复或重启安全。create 成功/可能成功但旧列 bind 失败时 MUST 保留旧订单，返回 `unknown`/manual reconciliation，停止盲自动重试和新订单/新 key 重建，不删除订单、不伪造 paid；缺乏可恢复证据时付款确认及再次创建继续 fail closed，不能把响应中的 unknown 当已持久化 operation。后续全面 ledger 接管、跨进程恢复或业务切换只能另走 D canonical 批准/迁移，不以安全加固绕过。

A SHALL 分列旧路径安全回归与新 ledger 契约，覆盖 299/3、零额/零行、tamper、missing/wrong live/mode/currency/amount/session/intent/account、签名时间戳/rotation 与 unknown 停止；新 ledger B SHALL 覆盖 early event、duplicate/乱序、两实例 commit、DB fault、第二笔成功、退款最后余额并发；C SHALL 用真实 Stripe test Session/事件分别证明付款、签名、webhook 和 retrieve/reconcile。官方幂等及端点限制证据缺失 SHALL 标相应验收 blocked，不将 mock 视为官方行为实测，也不把新 ledger B/C 结果转称旧路由重启安全。

#### Scenario: Legacy create succeeds but column binding fails
- **WHEN** 旧 route 的 Stripe create 已成功或可能成功，但 Session/PaymentIntent 旧列保存失败
- **THEN** 订单保留并返回 unknown/人工核对，不异常删单、新 key 盲重建或标 paid，不宣称已 durable reserve 或能跨进程自动恢复

#### Scenario: Legacy event has metadata but no trusted binding
- **WHEN** 旧 route 收到签名有效且 metadata 含真实订单号的事件，但没有可信已存 Session/intent 强关联或精确 total/currency
- **THEN** 拒绝付款确认并人工核对，不以 metadata 查订单补绑，不绕过 normalized 503 或新增 ledger/schema

#### Scenario: Offline fixtures pass without external verification
- **WHEN** A/B mocks 与本地 DB 场景通过，但未取得真实 Stripe test webhook 与资源对账证据
- **THEN** 仅报告 A/B 证据，C 保持 blocked，D 依批准独立记录，不声明旧路由或生产支付已修复/启用