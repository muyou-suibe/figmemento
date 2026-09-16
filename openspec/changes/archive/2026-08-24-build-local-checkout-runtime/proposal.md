## Why

FigMemento 当前已经完成 Cart → Checkout Readiness，但还没有一个可供本地演示的结算入口。需要把购物车中的当前商品、定制内容和私有上传收据重新校验后，组成一个只存在于本地开发/测试环境的 Checkout summary，同时明确不创建订单、不触发支付或生产副作用。

## What Changes

- 新增独立的 `local-checkout-runtime` 能力和 `/checkout` 页面。
- 复用当前 server-owned Cart、ConfiguredItemHandoff、Catalog、Variant/SKU、Customization 与 CustomerUpload receipt authority。
- 接收并校验 contact email、shipping address、shipping method selector 和 coupon code；浏览器不得提交任何权威价格或最终应付金额。
- 在服务端重新解析当前 Cart、商品资格、SKU、定制配置/版本、上传收据所有权、数量、货币和价格。
- 提供明确标记为 DEVELOPMENT / TEST ONLY 的本地 shipping 与 coupon fixture；无效、过期或不适用 coupon 返回零折扣状态但不阻断 Checkout；tax 保持未启用，不猜测税率。
- 产生一个不创建 Order 的 `AcceptedCheckout`/等价 checkout handoff 与权威 summary，其中 `tax.status = not_activated`、`tax.amount = null`，并计算不含税的 `localDemoTotal`。
- 只实现 bounded structural address validation；不建设 production address-validation engine、邮编数据库、外部地址 API、autocomplete 或号码库。
- `AcceptedCheckout` 只是 server-only、non-durable evaluation result，不是数据库实体、持久化 session、浏览器 token、Order authority 或 Payment authority。
- 保持现有 Checkout Readiness 为只读观察结果，不将其当作交易授权、价格锁定或 shipping quote。
- 为 process-memory Cart 和 CustomerUpload runtime 记录重启后的限制，并在旧 receipt 丢失时 fail closed。

本 change 的成功标准是：本地可完成有效文本商品和图片商品的 Checkout 主路径，空购物车、失效商品/SKU、无效地址、失效上传收据和无法安全判断的依赖均安全处理；invalid、expired、not_applicable coupon 以零折扣状态继续 Checkout；所有金额由服务端计算；成功 checkout 不产生 Order、OrderItem、Payment、库存或生产副作用。

## Capabilities

### New Capabilities

- `local-checkout-runtime`: 本地开发/测试环境中的 Checkout 输入、服务端重验证、本地 shipping/coupon fixture、权威 summary 和安全 handoff。

### Modified Capabilities

无。已归档的 `checkout-readiness` 继续保持只读观察语义。

## Impact

- 预计影响 `/checkout` 页面、server-only checkout application boundary、local shipping/coupon fixture adapters、请求/响应解析、离线测试和本地开发文档。
- 不创建数据库表、migration、生产持久化或 provider adapter。
- 不访问或修改远程 Supabase，不选择 Supabase Storage/R2，不接入 Stripe、PayPal、Resend、17TRACK、DNS、Cloudflare 或 production deployment。
- 后续 Local Checkout → Local Order change 必须继续复用现有 order compatibility boundaries，并另行处理订单快照和持久化 gate。
- Customization/C1 active changes 仅作为当前代码中已实现且可验证的 boundary 参考；本 change 不假设它们的全部任务已完成。
