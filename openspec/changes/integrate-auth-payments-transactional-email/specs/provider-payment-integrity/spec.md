## Purpose

为 Stripe 与 PayPal 定义统一且可验证的支付完整性契约，保证服务器报价、订单尝试绑定、持久事件处理、网络未知结果恢复及退款账实一致。将真实测试服务结果与本地模拟权威隔离，使离线及隔离数据库验收可独立推进，同时不解除 canonical 业务接线或生产付款停门。

## ADDED Requirements

### Requirement: Isolated provider ledger and gated business authority

系统 SHALL 为 provider 支付建立独立 durable integration ledger 和 synthetic integration orders authority；真实 Stripe test / PayPal sandbox 结果 MUST 仅进入相应集成账本，不得写入 `local_fake`、未来 `local_persistent` 模拟库，也不得借旧 normalized `/api/orders` 的 503 接口接入业务。测试业务身份 MUST 绑定业务测试项目、provider、provider account/project 与 environment；相同邮箱、订单号或 provider resource ID 不构成跨域身份。production/live SHALL 始终禁用，配置缺失、未知模式或 live 凭证 MUST fail closed，不回退模拟付款。

本规范的 durable attempt/quote/operation、inbox、原子 payment/order/outbox、自动恢复及跨进程保证 SHALL 仅适用于新 ledger path（synthetic 及另获批准的 canonical bridge），不隐含旧 Stripe route 已有这些表/契约。旧路由仅适用 `stripe-checkout-adapter` 的 `Stripe legacy seam remediation and evidence boundaries` 明列的旧列安全加固：现有 Session/PaymentIntent/total/currency 列的精确金额、强关联及 approved origin，不新增 ledger/schema、不声称重启安全。旧路径 create 成功但 bind 失败 MUST 保留订单、返回 unknown/manual reconciliation、不删单盲重建或伪造 paid；缺可信绑定不能 metadata 找单。该例外不允许新 ledger path 跳过本规范任何 durable 要求。

#### Scenario: Sandbox result stays in integration authority
- **WHEN** 已授权测试身份完成其绑定账户下的 synthetic order sandbox 付款
- **THEN** 仅独立账本及合成订单付款状态改变，local 模拟订单、旧订单表和实际履约均不改变

#### Scenario: Cross-project or live configuration is rejected
- **WHEN** 身份的业务项目、provider 商户账户或环境不匹配，或运行时请求 production/live
- **THEN** 系统在支付副作用前拒绝，且不使用相同邮箱或订单号重新定位其他项目订单

### Requirement: Independent acceptance lanes and canonical bridge approval

后续实现 SHALL 可完整覆盖 provider adapters 与 local DB sandbox harness；A offline 契约及 B 隔离持久数据库验证 SHALL 不依赖 C 外部账号联调或 D 商城业务接线通过。C 缺密钥、账户、回调或官方协议证据时 MUST 如实标 blocked；D 的 canonical business bridge MUST 在 C1、Customization Phase C 和 canonical order/payment/outbox 接线批准均取得后才启用。缺该依赖 SHALL 记录 D blocked，而非阻塞可独立完成的 A/B。批准不构成 production/live 启用授权，synthetic 测试不构成真实业务端到端验收。

#### Scenario: Business dependencies are unavailable
- **WHEN** adapter 和合成订单契约可测试，但 C1、Phase C 或 canonical order 批准缺失
- **THEN** A/B 可独立验证并报告证据，D 标 blocked，canonical bridge 保持关闭，不降低测试为仅配置检查

#### Scenario: External credentials are unavailable
- **WHEN** A/B 使用离线 provider doubles 与隔离数据库通过，但没有真实测试商户及回调
- **THEN** C 标 blocked，报告不得宣称真实签名、真实 capture、webhook 或 reconcile 联调已通过

### Requirement: Exact USD Money parsing and checked arithmetic

系统 SHALL 仅支持 USD integer cents，所有求和、折扣分摊、数量乘法和 provider decimal-string 转换 MUST 使用无浮点舍入的整数/十进制运算并检查范围。外部十进制金额 MUST 为匹配 `^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$` 的字符串，经逐位整数解析并补足两位 cents；不得使用 `parseFloat`、浮点乘 100 或容忍指数、空白、符号、逗号、超两位小数与 JSON 浮点。内部/Stripe cents MUST 为安全范围内整数，quantity MUST 为正整数；负金额、溢出、不支持币种 MUST 拒绝而非截断。

#### Scenario: Decimal strings round trip exactly
- **WHEN** 输入 USD `"2.99"`、`"0.10"`、`"2"` 和 `"2.9"`
- **THEN** 分别得到 299、10、200、290 cents，provider 十进制输出分别为 `"2.99"`、`"0.10"`、`"2.00"`、`"2.90"`

#### Scenario: Invalid amounts fail closed
- **WHEN** 输入 `2.99` 数字、`"2.999"`、`"1e2"`、`" 2.99"`、`"-1"`、`"+1"`、超安全上限、非 USD 或非整数 quantity
- **THEN** 系统拒绝且不创建 provider 请求、不静默四舍五入或转换币种

### Requirement: Immutable server-calculated quote and line identity

系统 SHALL 在保留客户/游客 ownership 的订单下，以服务器批准的商品与定价数据计算 immutable quote。快照 MUST 包含 quote/version、currency、独立 line ID、商品/SKU、quantity、options、customization 与其附加价、单价/行小计、折扣分配、shipping、subtotal/discount/total cents，以及全部这些字段的确定性 canonical serialization hash。customization 私有资产仅保留受保护引用，不把私有照片发送 provider。所有金额 MUST 从服务器来源计算，client 不得指定价格、折扣额、运费或付款事实；hash 仅为完整性证据，不替代授权或服务器重算。quote/attempt 绑定后 SHALL 不可修改，合法重报价须新 quote，并受 active attempt 停门约束；不同定制行不得合并。

#### Scenario: Tampered browser totals are rejected
- **WHEN** 浏览器篡改单价、附加价、折扣、shipping、总额或 quote hash
- **THEN** 系统拒绝金额断言或仅接受合法业务选择后服务器重新报价，绝不采用 client 金额创建付款

#### Scenario: Same SKU has different customization
- **WHEN** 游客购买两个相同 SKU 但照片、文字或 options 不同的行
- **THEN** quote 保存两个独立 line ID 与定制快照，provider 金额映射可拆分但不得丢失各自行归属

#### Scenario: Quote changes after an attempt is reserved
- **WHEN** 客户在已有活动付款尝试后修改 quantity、customization 或折扣
- **THEN** 原 quote 及 hash 保持不变，新报价不可替换原尝试的期望金额，也不可绕过远端终结核验发起新尝试

### Requirement: Nonnegative conserved provider amount representation

provider 请求 SHALL 严格满足各行整数净额及 shipping 之和等于 quote total，所有行金额 MUST 大于等于零，discount MUST 不超过适用小计。无法由 provider 当前端点的行数、零行或最低正付款额限制准确表达的报价 MUST 返回显式 unsupported 并且不发起收费；零总额 MUST 返回 `unsupported_zero_total`，不得改为 1 cent 或伪造已付。限制的依据 SHALL 在实施时用当前官方端点证据记录，不能推定各 provider 相同；免费订单流程不在本变更中。

#### Scenario: Zero and unrepresentable small totals
- **WHEN** quote total 为零，或正总额/零净额行无法在 provider 限制下原样表达
- **THEN** 分别返回零额不支持或金额表示不支持，持久保留报价原因且不创建假付款、不抬价

#### Scenario: Allocation conserves every cent
- **WHEN** 多行折扣及 shipping 被转换为 provider 请求
- **THEN** 每行净额非负、折扣分配总和等于 quote discount，provider 请求总额与 quote total 逐 cent 相等

### Requirement: Owner-authorized payment commands

创建、capture、取消、切换及查询付款 SHALL 使用服务器验证的客户身份或受限游客 capability，且核验其对当前测试项目内订单的 ownership。浏览器 mutation MUST 使用同源与 CSRF 防护；订单号、邮箱、metadata、provider session/order ID 或 return URL 参数均不得作为授权。webhook 认证 SHALL 独立使用 provider 验证，不依赖浏览器 Origin、cookie 或 CSRF token。

#### Scenario: Guest starts their own payment
- **WHEN** 持有服务器验证 capability 的游客在同源受保护请求中选择其订单付款方式
- **THEN** 服务器为该订单既有 quote 保留尝试，不要求创建账号，也不允许 capability 访问另一订单

#### Scenario: Foreign resource and forged callback
- **WHEN** 客户提交他人的 session/order/capture ID、订单号或带 `paid=true` 的回跳参数，或跨站发起 capture
- **THEN** 请求不可产生付款或退款状态更新，并避免泄露其他客户的订单信息

### Requirement: Durable reservation and non-atomic provider recovery

系统 MUST 遵守数据库原子 reserve attempt 与 stable request key → provider create/capture → durable bind 的边界，不得声称网络和数据库原子。每项 mutation SHALL 持久记录独立 operation、不可变请求摘要、provider/account/environment、quote/attempt、stable key、发送及恢复状态；未能证明未发送或 provider 未执行的请求结果 MUST 为 `unknown`。response lost、进程崩溃或 bind 失败 SHALL 保留订单、attempt 和原 key，通过原 key 的有证据幂等重放及已知资源 retrieve/reconcile 恢复；不能删除订单、生成新 key 盲目 create/capture 或把 unknown 当失败重试。每个端点的 key 保留、重试条件、查询能力与窗口 SHALL 以实施时当前官方证据为准；不编造统一期限，窗口不明/过期且结果无法证明时 MUST hold/reconcile。

#### Scenario: Reservation database failure prevents a call
- **WHEN** attempt 或 operation key 无法 durable reserve
- **THEN** 返回 retryable failure，且 provider create/capture 不被调用

#### Scenario: Provider succeeded but response or binding was lost
- **WHEN** provider 可能已创建或 capture，但网络超时、进程终止或绑定事务失败
- **THEN** 订单与原 operation 保留为 unknown/pending reconcile，恢复使用原 key/已知资源且不重复发起新付款

#### Scenario: Idempotency protection cannot be established
- **WHEN** 原请求结果未知且当前官方端点证据无法保证原 key 的安全重试
- **THEN** 系统阻止盲目重放与新 key 替换，进入可审计人工核对，不承诺 provider exactly-once

### Requirement: Atomic active attempt and safe provider switching

系统 SHALL 跨实例原子限制每个订单最多一个 active/unknown attempt；本地 cancel、超时或浏览器关闭 MUST 不被当作远端 uncapturable 证明。重新尝试或跨 Stripe/PayPal 切换前 SHALL expire（端点支持时）、retrieve/reconcile 并取得旧资源已不可继续完成付款且无未决 capture 的可靠证据；证据不足 MUST block，不能仅释放本地唯一锁。每笔已验证成功资金事实 SHALL 持久记录；第二个不同成功收款 MUST 触发 duplicate-payment hold/manual review，禁止重复履约、重复 paid 通知或自动退款。

终结判定 SHALL 以实施时当前官方端点/资源语义及该对象认证 retrieve/reconcile 证据为依据；`EXPIRED`、`VOIDED` 或其他状态只有在当前官方证据确认对该资源真正终结、不可再收款且无已付/pending/unknown capture 时才可释放 active hold，不假定所有 provider/资源都支持这些枚举。不得猜测数值 expiry、从本地计时/重试耗尽推断远端终结。自动 reconcile SHALL 有配置并持久追踪的有限次数及总时窗，任一预算达到即转 `manual_required` 并停止自动循环；这不是 provider expiry。客户 SHALL 可见“待核对”、受相同预算/终结门保护的状态重试及联系支持入口，retry 不表示可再次支付。管理员 SHALL 审计每次核对/证据/操作，不能无远端证据解锁、忽略已核验款项或用手动失败覆盖 unknown。hold 可能持续到 provider terminal 被证实，不得承诺固定时间后可再次支付；后续可信证据仍可经受保护命令或已验证事件原子解决 manual_required。

#### Scenario: Two instances reserve different providers concurrently
- **WHEN** 同一订单的 Stripe 与 PayPal 尝试由两个实例并发创建
- **THEN** 只有一个活动尝试被原子接纳，失败方不调用 provider

#### Scenario: Local cancel cannot authorize switching
- **WHEN** 本地取消旧 Checkout/PayPal approval，但旧资源仍可能付款、capture 状态 unknown 或无终结证据
- **THEN** 新 provider 尝试被阻止，旧 attempt 保留 pending reconcile

#### Scenario: Confirmed terminal resource permits a fresh attempt
- **WHEN** 旧远端资源经服务端核验已不可收款、无已付或未决 capture，并完成本地终结事务
- **THEN** 可原子保留新尝试和新 operation，保留旧尝试全部审计历史

#### Scenario: Reconciliation budget ends without terminal proof
- **WHEN** 自动 reconcile 次数或总时窗达到上限但远端仍可收款或状态未知
- **THEN** attempt 转 manual_required 且 active hold 保留，客户可查看/受控重试状态或联系支持，管理员无远端终结证据不能解锁，也不承诺固定时间后可支付

#### Scenario: Verified provider terminal status releases the hold
- **WHEN** 认证资源查询返回当前官方语义证实的 EXPIRED、VOIDED 或其他终结确认，并排除已付、pending 与 unknown capture
- **THEN** 经原子核对记录证据后可终结旧 attempt 并释放 active hold，而非根据猜测 expiry 或管理员 override 放行

#### Scenario: A distinct second payment succeeds
- **WHEN** 竞争、迟到事件或外部操作使同一订单出现第二个不同的已核验成功 capture
- **THEN** 两笔资金事实均记录，订单进入人工 hold 并阻止进一步重复履约，不将第二笔当事件重放丢弃或自动退款

### Requirement: Verified durable webhook inbox and unmatched reconciliation

系统 SHALL 对 webhook 原始 body 设置读取上限（默认 256 KiB，超限 413），在解析或改变字节前取得验签所需原文，验证签名、必需 headers、provider 规定的时间戳及受控 rotation 信任配置。无效签名、缺失字段或畸形已签 payload MUST 返回 400；验证服务暂不可用 MUST 返回 retryable 5xx，不能放行。只有验证通过且事件已 durable inbox 后 SHALL 返回 2xx；DB 失败 MUST 5xx。合法未知事件类型 SHALL 先持久记录 ignored 再 ack。验签通过但 before-bind/unmatched 的事件 MUST durable pending reconcile，不能直接丢弃或凭 metadata 给任意订单付费。敏感原文 SHALL 受访问控制与保留策略约束，日志不得含密钥或私有资产。

#### Scenario: Early valid event arrives before resource binding
- **WHEN** 签名有效的付款事件先于 create 响应或本地资源 bind 到达
- **THEN** 事件持久保存为 unmatched/pending reconcile 后 2xx，后续通过保留的 operation 与服务端资源核对绑定，不能通过订单号 fallback 直接付费

#### Scenario: Invalid or oversized webhook
- **WHEN** body 被篡改、签名缺失/过期、必要字段缺失，或原始 body 超过上限
- **THEN** 前者返回 400、超限返回 413，均不改变付款状态；原始 body 不被无限缓冲

#### Scenario: Database failure and unknown event type
- **WHEN** 合法 webhook 的 inbox 写入失败，或合法类型尚未支持
- **THEN** 写入失败返回 5xx；未知类型只有 durable ignored 记录提交后才 2xx，不触发付费

### Requirement: Strict paid authority and resource bindings

付款 SHALL 仅由已验证 provider webhook、授权 server capture response 或认证服务端 retrieve/reconcile 的资源事实确认，并 MUST 核验实际 paid/captured 成功状态、mode/liveflag 或 provider 环境证明、account/payee、USD、exact gross captured amount，以及 session/provider order、payment intent/capture ID 到已保留 order/attempt/quote 的绑定。各 provider 对不适用字段 MUST 提供明确等价证明而非把 missing 当匹配；需要字段缺失 SHALL pending reconcile 或 reject，绝不付费。metadata/reference 仅作相关性提示，不能授权任意订单查询后标 paid。批准、未付 completion、pending、浏览器成功回跳或有效签名本身 MUST 不构成到账。

#### Scenario: Exact bound success marks the intended order paid
- **WHEN** 已保留尝试的服务端资源满足所有账户、环境、ID、quote 金额币种与成功状态核验
- **THEN** 只为该尝试绑定订单确认一次付款事实，保留完整验证来源及 provider 资源标识

#### Scenario: Signed but inconsistent payment is quarantined
- **WHEN** 签名有效但 liveflag/mode、币种、金额、merchant、session、intent/capture 或尝试绑定任一错误或缺失
- **THEN** 事件保留并标拒绝/待核对，订单不 paid，metadata 中正确的订单号不能绕过核验

### Requirement: Scoped deduplication and atomic business effects

inbox SHALL 以 `(provider, account/project, environment, event_id)` 唯一去重，并另以同 scope 的实际成功 capture/charge 资源标识及语义转移去重，覆盖不同 event ID 的同笔到账。两个实例 MUST 原子提交 processed 状态、payment ledger、synthetic order paid state 和唯一业务 outbox；canonical bridge 获准后，approved canonical order payment state MUST 同属该原子提交边界，否则 bridge 不得启用。inbox 接收可先提交，但业务事务失败 MUST 保持可恢复待处理，不可先标 processed。通知/履约消费者 SHALL 根据稳定语义 key 幂等；这不是外部 provider 或邮件端到端 exactly-once 保证。

#### Scenario: Duplicate and semantically equivalent events race
- **WHEN** 两实例处理同 event ID，或不同 event ID 描述同一 capture 的成功
- **THEN** 仅一次付款状态迁移与一个 paid outbox 记录提交，另一方可重放且不重复履约

#### Scenario: Fault inside the business commit
- **WHEN** payment 写入后而 order/outbox 写入前发生 DB 故障
- **THEN** 整笔业务事务回滚、inbox 待处理且可恢复；不得出现 paid 无 outbox 或 order paid 无付款事实

#### Scenario: Canonical store cannot share the approved transaction
- **WHEN** 获准业务库与集成账本尚无法保证 payment/order/outbox 原子性
- **THEN** D bridge 保持 blocked，不用跨库 best-effort 双写宣称已满足事务一致性

### Requirement: Monotonic payment facts and reversal holds

系统 SHALL 保留不可逆的已收款历史；迟到 expire/fail/cancel MUST 不把 paid 改为 unpaid/failed。退款 SHALL 独立反映 pending、partial、full refunded 金额与状态而不抹去原付款事实。reversal、争议及未知资金逆转事件 SHALL durable 记录并 hold/reconcile，禁止自动争议处理、自动重付或自动重新履约。

#### Scenario: Failure or expiry follows a success
- **WHEN** paid 后收到早期失败、取消或过期事件
- **THEN** 原 paid/capture 事实与已发 outbox 不变，记录乱序事件但不逆转订单付款事实

#### Scenario: Refund or reversal follows payment
- **WHEN** 已付 capture 被部分退款、全额退款或收到 reversal/dispute 事件
- **THEN** 退款事实追加且保留原收款；资金逆转进入 hold/reconcile，不自动执行争议流程

### Requirement: Authorized full-remaining refunds with durable reservations

应用退款命令 SHALL 仅允许服务器验证的 authorized admin 对已核验 paid capture 执行 `full_remaining`；client 不得提交退款金额或任意 capture ID，MVP 不提供任意 partial refund UI。系统 MUST 在 capture 级锁/等价原子事务内，依据 captured gross 减去成功退款及所有 pending/unknown 退款预留计算余额，并保留退款 operation、金额、稳定 key 与授权审计；可用余额为零时不得调用 provider。网络超时 SHALL 标 unknown 并保留额度，不得新 key 重退；明确 provider 失败证据才释放预留。退款结果 SHALL 校验绑定、账户、环境、币种、金额与实际成功状态，并使用退款资源及事件语义去重和事务性 outbox。

#### Scenario: Admin refunds the remaining paid amount
- **WHEN** 已付 1000 cents，已验证外部成功退款 300 cents，无 pending 预留，授权管理员请求 full_remaining
- **THEN** 服务端原子预留 700 cents 并以稳定退款 key 请求，成功后累计退款为 1000 cents 且仅一个对应退款 outbox

#### Scenario: Customer or amount injection attempts a refund
- **WHEN** 普通客户、未授权管理员或跨站请求退款，或 client 试图指定金额/他人 capture
- **THEN** 命令被拒绝且不 reserve、不调用 provider，不扩展任意部分退款操作界面

#### Scenario: Two admins compete for the last refundable balance
- **WHEN** 两个实例同时对同一 capture 的最后 700 cents 请求 full_remaining
- **THEN** 只有一个 700 cents 预留成功，另一个报告余额已预留/无可退款额，成功加 pending/unknown 预留不得超 captured

#### Scenario: Refund response is lost
- **WHEN** provider 可能已退款但响应丢失或本地 bind 失败
- **THEN** 原 key 与余额预留保持 unknown，由 retrieve/reconcile 或有证据同 key 恢复确认，重复命令不产生第二次退款

### Requirement: External partial refund truth and bounded reconciliation

系统 SHALL 通过已验证 webhook/retrieve 对 provider 外部部分退款逐笔记账，包含 provider refund ID、capture、状态、gross cents 与币种；pending 不可当成功，同一 refund replay 不可重复累计或 outbox。已验证累计成功退款 MUST 不超过 capture，外部退款与本地 pending 并发冲突 SHALL 阻止新增退款并 reconcile，不能假定本地锁能锁住商户后台。发现 provider 证据矛盾/超额 MUST 保存原始资金事实证据、hold 并人工核对，不裁剪伪造余额或自动补偿退款。

#### Scenario: External partial refund and replay arrive
- **WHEN** 同一 300 cents 外部成功 refund 由多次 webhook 和 retrieve 返回
- **THEN** 累计退款只增加 300 cents、对应 outbox 仅一次，full_remaining 使用更新后的余额

#### Scenario: External refund races a local reservation
- **WHEN** 新外部退款使本地成功加 pending 预留与 capture 余额冲突，或报告累计退款超 capture
- **THEN** 保存各来源证据、阻止新退款并 hold/reconcile，不重复发退款或静默把超额改小

### Requirement: Evidence-separated integrity acceptance matrix

验收 SHALL 对两 provider 分别列出 A offline、B local DB、C real test-service 与 D approved business evidence，记录用例结果、缺失依赖与 blocked，不把本规范场景当已执行测试。A MUST 覆盖报价 tamper、missing fields、wrong mode/live、amount/currency、foreign resource、wrong merchant、签名及权限失败、零额/分摊、超时 unknown；B MUST 覆盖 early event、event/semantic duplicate、out-of-order、两实例 active attempt/payment commit、inbox/bind/order/outbox DB fault、跨 provider 第二笔成功、last-refundable concurrency 与退款 replay；C MUST 独立验证真实服务签名、capture、webhook、reconcile 及当前端点幂等证据，D MUST 另证实获准业务原子接线。

#### Scenario: Matrix contains blocked external cases
- **WHEN** A/B 有实际证据而 C 真实签名或 D 业务批准尚缺失
- **THEN** 分层报告实际通过与 blocked 项，禁止以 mocks、synthetic 订单或历史测试数量替代当前 C/D 通过证明