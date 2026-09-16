## Why

当前只有本地账号/支付/通知模拟与部分旧 Stripe 路由，缺少 Supabase OTP/Google、PayPal、Resend 适配及完整支付金额/币种核验。需要将可无凭证开发的协议适配、可重建数据库验证、真实测试账号联调和业务接线分别规划，避免把未实现代码解释为“只缺密钥”，也避免把模拟支付升级成真实支付权威。

## What Changes

- 为 Supabase Auth 实现邮箱验证码、Google OAuth/PKCE、服务端会话验证/刷新/退出及安全页面接线；测试身份与正式 provider subject 不混用、不迁移现有 fake 密码。按需求实现已验证同邮箱的游客订单自动关联，限定同项目、未归属且获准接入的业务订单；不认领本地模拟订单，不以浏览器邮箱声明作为证明。
- 抽取 Money/不可变 PaymentQuote/PaymentAttempt/provider ports；修正旧 Stripe 折扣按数量整除丢分与最低 1 cent 强行收费问题。新 Stripe/PayPal 均校验金额、币种、付款状态、商户/环境、资源与订单尝试绑定，前端回跳只展示状态。
- 完成 PayPal Orders v2 创建、客户批准后服务端 capture、webhook 验证/对账；强化 Stripe raw-body 验签、异步付款状态、事件账本、重复/乱序处理；实现授权管理员“全额退还剩余可退金额”（`full_remaining`）命令，并据实记录 provider 侧部分退款和待核对状态，不扩展任意部分退款运营 UI。
- 设计独立 durable integration ledger、事务性支付结果/订单支付状态/outbox、幂等与跨进程恢复。SDK/HTTP 适配不直接写旧订单表或 local 模拟库；完整商城接线必须取得获准 canonical order adapter。
- 实现 Resend 事务邮件模板、durable outbox、租约/退避/投递状态及退信投诉处理；OTP 由 Supabase Auth 发码与 SMTP 发送，不由应用 Resend API 再发送一份。邮件只提供受保护页面入口，不发送私有照片或永久下载地址。
- 分开提供 A 代码/离线契约、B 隔离数据库、C 外部测试服务联调、D 商城业务接线验收。缺账号、密钥、回调入口、发件配置的 C 项明确 blocked；不影响已证实的 A/B，但不能宣称 C/D 通过。
- 提供面向后续 5.6 Luna 实施的批次、依赖门禁、外部准备清单及交接说明。本轮仅规划，不执行任何实现、DB 初始化、外部账户操作或发送。

### Scope boundaries

首发 USD，整数 cents；不引入多币种/汇率、订阅、Connect/多商户或自动争议处置。零额安全停止仅是 provider-only 技术边界：amount=0 时不发起收费、不抬为 1 cent、不伪造 paid，UI 明示“不收费／联系支持”。决策登记为 `not_confirmed_global_free_order_policy`（待业务批准），decision owner 为项目负责人，trigger 为 amount=0；A/B 防误扣实现可做，实际 D 零额用户流程待批，不自动添加 cap 或优惠规则，也不把该停止状态升级为已确认的全站免费订单政策。不部署、不 DNS 切换、不 real-money/live 模式启用、不真实营销发送、不扩展供应商/仓库持久化、不重做 HTML 视觉。

保留 `complete-local-commerce-persistence` 的 0/85 规划及其模拟付款语义，不将新 provider 接到 local_fake/local_persistent authority。C1/Customization Phase C、旧 normalized `/api/orders` 503 和生产迁移批准门不因本提案解除。可以独立验证 adapter + 合成集成测试订单；它不是商品上传到生产发货的真实业务验收。

## Capabilities

### New Capabilities

- `service-adapter-boundaries`: 测试环境/配置、独立账本、canonical order 接线门禁、分层证据与停止条件。
- `verified-guest-order-association`: Supabase 已验证同邮箱身份到获准业务游客历史的幂等归属关联。
- `provider-payment-integrity`: 金额与绑定校验、durable 尝试/事件、乱序/并发、跨 provider 重复收款风险和退款对账。
- `stripe-checkout-adapter`: Stripe Checkout 请求金额准确性、验签、付款确认及旧路由安全加固。
- `paypal-checkout-adapter`: PayPal Orders/capture、验签、商户环境校验及失败恢复。
- `transactional-email-delivery`: Supabase OTP SMTP 职责、Resend 应用通知、outbox 与可靠投递证据。

### Modified Capabilities

- `customer-auth`: 在保留 disabled/local_fake（及经其他变更实际落地的 local_persistent）语义的基础上，增加显式受测试环境门控制的 Supabase 认证、会话和 provider-only 同邮箱关联例外。
- `engineering-foundation`: 保留完整相关 requirement 与前一持久化 migration 场景，增加本 workdir 的独立 migration 例外但不替代唯一 production canonical workflow；将适用旧支付延期归属更新为本 change，区分现在可实施的 adapter A/B 与仍延期的生产激活/业务接线，不删除其他延期 scope。

## Impact

- 主要范围：`app/config/`、`app/domain/`、`app/application/`、`app/infrastructure/`、认证/支付/邮件 HTTP 路由与 account/checkout 的最小功能接线；不同时展开视觉重构。
- 复用现有 Supabase JS、Web Request/Response 与领域分层；新增依赖须在实施时验证 vinext/Worker 兼容性，优先官方 Supabase SSR、Stripe SDK 和 Resend SDK/验签组件，PayPal 使用官方 REST 协议，不臆造 SDK 方法。
- 独立 `local/service-integrations/` harness、合成订单 authority 与受版本控制 migration 验证；不重置现有数据库，不把根 legacy bootstrap 当作完整 schema。真实业务 ownership/payment/outbox 的接线迁移只编写/审阅，获准前不应用到远程库。
- 历史 892 offline、rendered 7/11 等仅是先前会话观测。实施首批必须按当时工作区重新 build 后运行 rendered；若 11/11 则记录当前通过，旧四例归历史，不维持失败。
- 风险：Supabase SSR cookie 与 Worker 差异、已验证邮箱关联冲突、provider 创建成功但本地保存失败、金额分摊误差、webhook 先于绑定/乱序、跨 provider 双付、有限 provider 幂等窗口，以及 Resend 无完全隔离的“假发送”模式。设计必须给可执行处理策略而非“配置好以后验证”。