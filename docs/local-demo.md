# FigMemento 本地商品目录 Demo Runbook

这份 Runbook 用于向项目负责人演示当前已经真实运行并验证通过的 storefront。Demo 使用本地 development fixtures，不连接生产服务，也不代表网站已经上线或可以正式接单。

## 1. Demo 前提

- Node.js `>=22.13.0`。
- 项目 dependencies 已安装。
- 必须使用 development mode。
- 不需要 live Supabase。
- 不需要创建或执行 migration。
- 不需要 production deployment、DNS 或 Cloudflare 配置。

### Fixture 配置

在项目根目录被 Git 忽略的 `.env.local` 中设置：

```dotenv
PHOTOGIFT_PRODUCT_SOURCE=fixture
```

本 Demo 所需的 fixture 配置只有这一项。不要设置 `NODE_ENV=development`，运行模式由 vinext/Vite 决定。

Demo 环境中不要放入 production secret、live Supabase credential、Stripe secret、PayPal credential、DNS 或 Cloudflare value。不要提交 `.env.local`。

Fixture catalog 仅是 development/test data：

- 不是 production catalog；
- 22 个 Product 不是最终生产商品资料；
- 不得导入生产环境；
- 不得作为 migration 或 backfill 数据源。

## 2. Demo 前验证

先在项目根目录执行完整工程检查：

```bash
npm run verify
```

当前 `npm run verify` 依次包含：

- lint；
- TypeScript typecheck；
- offline tests；
- production build；
- rendered test。

然后执行本地 Demo 专项验证：

```bash
npm run test:local-demo
npm run test:local-demo:smoke
```

`test:local-demo:smoke` 会在隔离环境中启动真实 development runtime，检查以下 4 个 public routes：

- `/`
- `/shop`
- `/category/3d-figures`
- `/product/couple-figure`

Smoke 使用仅计数、不模拟数据库成功响应的 local Supabase sentinel。预期结果是：

```text
observedSupabaseRequestCount: 0
liveProviderUsed: false
cleanup: PASS
```

## 3. 启动现场 Demo

```bash
npm run dev
```

推荐打开：

```text
http://localhost:3000
```

如果终端显示了不同端口，以终端实际 URL 为准。

不要使用 `npm run start`。Fixture source 必须在 production runtime 中被拒绝，正式现场 Demo 只能使用 development mode。

页面应显示以下提示：

> Development fixture catalog — this content is not a production catalog source.

如果没有看到该提示，停止 Demo，不要把页面内容当作 fixture data 继续讲解。

## 4. 8–10 分钟演示流程

### 0:00–1:00｜Homepage

打开 `/`。

展示：

- 首页可以正常打开；
- development fixture notice；
- 商品目录入口和 Custom Couple Figure。

建议讲解：

> 当前展示的是隔离的本地 Demo 数据，用于验证真实 storefront 与商品模型。生产商品数据、正式域名和部署将在后续阶段接入。

### 1:00–2:30｜Shop

打开 `/shop`。

展示：

- 22 Product fixture catalog；
- 当前可工作的 Category filter 和商品搜索；
- Custom Couple Figure 商品入口。

建议讲解：

> 当前目录已经通过统一 Product、Category 和 Variant 模型渲染；这些 fixture 是演示数据，不是最终生产商品资料。

### 2:30–3:30｜3D Figures Category

打开 `/category/3d-figures`。

展示：

- MVP 单层 Category；
- Custom Couple Figure；
- 其他 3D Figures fixture 商品。

### 3:30–7:00｜Product 与 Variant

打开 `/product/couple-figure`。

先展示：

- Product：`Custom Couple Figure`；
- Listing price：`From $69.90`；
- required Option：`Size`；
- Option Values：Mini、Standard、Deluxe。

依次操作：

1. 选择 **Mini**：
   - Selected SKU：`DEV-COUPLE-FIGURE-MINI`
   - Price：`$69.90`
2. 选择 **Standard**：
   - Selected SKU：`DEV-COUPLE-FIGURE-STANDARD`
   - Price：`$89.90`
3. 指出 **Deluxe** 显示为 unavailable：
   - Deluxe 不会成为可购买 Variant；
   - 不会回退到 Mini/default SKU。

建议讲解：

> SKU 与价格由 Variant 数据决定，不使用浏览器提交的价格。Deluxe unavailable 只代表当前 C1 的 availability boolean，不代表精确库存数量。

### 7:00–8:30｜Fulfillment

在 Product Detail 展示：

- Delivery format：`Physical`；
- Shipping：`Required`；
- Production：`Custom Manufacturing`；
- Production lead time：`5–10 business days`。

建议讲解：

> 这些信息来自真实 catalog FulfillmentConfig model，不是为了 Demo 在页面中写死的展示文字。

### 8:30–10:00｜当前成果与下一阶段

已经完成并可说明：

- Catalog；
- 单层 Category；
- Product；
- Variant / SKU；
- Variant-authoritative pricing；
- availability；
- ProductAsset controlled fallback；
- Fulfillment；
- Admin Catalog implementation 已完成离线验证，但本次不演示 persistence 操作。

下一阶段计划：

- Cart / Order compatibility；
- Customization workflow；
- production database 与 deployment；
- FigMemento 最终 branding/domain cutover。

不要把下一阶段计划描述成已经完成。

## 5. Demo 1 明确不演示

以下功能或操作不要在现场打开、点击或声称已经可用于生产：

- `/admin/products` persistence；
- Save product content；
- Save category content；
- SKU Graph save；
- ProductAsset save；
- Fulfillment save；
- Publish、Unpublish、Retire；
- Supabase database；
- migrations；
- production mode；
- production deployment；
- DNS / Cloudflare；
- `figmemento.com` live site；
- cart；
- checkout；
- order creation；
- Stripe / PayPal；
- CustomizationField；
- customer photo upload；
- inventory quantity；
- fixture import to production。

可以说明 Admin Catalog 已实现并经过离线测试，但不要现场点击任何保存或生命周期操作。Admin persistence 需要兼容的 Supabase database 和尚未执行的 C1 migrations。

不要使用以下表述：

- “后台完全可用”；
- “网站已上线”；
- “支付已完成”；
- “已经可以正式接单”。

## 6. Troubleshooting

### 页面显示 catalog unavailable

检查 `.env.local` 是否包含：

```dotenv
PHOTOGIFT_PRODUCT_SOURCE=fixture
```

然后停止并重新执行：

```bash
npm run dev
```

### 页面没有 fixture notice

停止 Demo，不要继续假装当前页面来自 fixture data。重新检查 `.env.local` 和终端启动输出。

### 端口不是 3000

使用终端实际打印的 URL，不要固定假设端口。

### Product 页面没有 Mini、Standard、Deluxe

停止 Demo，并执行：

```bash
npm run test:local-demo
npm run test:local-demo:smoke
```

确认测试通过，并检查当前 checkout/worktree 是否存在异常后再重新启动 Demo。

### 不要临时连接 live Supabase

不要通过连接 live Supabase、执行 migration、填入 provider credential 或修改 production configuration 来临时“修复”本地 Demo。若专项验证不能通过，应停止演示并排查本地环境。
