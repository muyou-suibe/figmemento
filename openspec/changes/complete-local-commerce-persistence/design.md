## Context

动机和范围见 proposal.md。现有领域层已定义 Local Order、Payment、Fulfillment、Tracking、CustomerUpload 和 configured-item，但多数组合根使用 Map；部分支付/履约端口依赖同步内存原子操作。既有 Supabase 目录与定制迁移不能证明旧业务库已可重建，C1 和定制 Phase C 仍有明确的人工批准门。

2026-09-10 已检查 Docker daemon 可用，仓库本地 Supabase 配置包含 API 54321、DB 54322 和 PostgreSQL 17；未启动/重置数据库。用户确认使用另一套独立本地 Supabase PostgreSQL＋私有 Storage，并持久化现有本地测试账号/会话。必须保留现有未提交文件与正在运行的开发服务。

这是跨域安全与数据模型变更，技术设计为必需产物。15 份 delta specs 是验收契约；本文解释实现取舍，不将本地试验解释为生产迁移授权。

## Goals / Non-Goals

**Goals:** 在现有 vinext/Cloudflare 运行形态中使用 HTTP 数据适配端口完成持久化，不引入另一个商城服务端；验证实际数据库事务、私有对象与身份跨进程恢复。测试数据、凭证、业务状态和媒体均有明确的项目/授权范围。

**Non-Goals:** 不直接连接生产 PostgreSQL，不运行根目录默认 reset/seed，不写旧 orders/order_items，不实现真实收款、OTP/Google、邮件或 17TRACK。现有供应商工作台不扩展为完整持久化采购系统；本轮必须接入共享门禁或明确禁用其不兼容入口，不得保留可绕过的写路径。不会把使用 local Storage 推导为最终生产存储决策。

## Decisions

### 1. 独立 Supabase 本地工程，而非改造现有开发库

实施时在 `local/commerce/` 下建立独立 CLI workdir、项目 ID、端口和迁移/seed 清单。API、DB、Studio、Storage 等相关端口整体预检；不挤占当前 5432x 项目，也不自动终止占用进程。使用 PostgreSQL 17 和与仓库锁定 CLI 兼容的镜像。开发栈有稳定项目身份并保留 volumes；测试栈具有每轮唯一身份和一次性标记。

本轮仅为该独立工程建立 ordered migration ledger/checksum 与 synthetic namespace 的例外，不替代生产 canonical `supabase/migrations/` 工作流。迁移仍须有顺序、独立本地验证和 rollback/forward-fix 说明；旧 flat bootstrap 不视为已对账基线，不执行 root reset/seed，不批准或完成 C1/Phase C 迁移与回填。

本轮 schema 放在私有 `local_commerce` 命名空间，通过明确暴露的受限 RPC schema 访问。应用沿用 `@supabase/supabase-js` 的 HTTP/RPC/Storage 接口，不在 Worker 引入依赖 Node TCP 的数据库驱动。测试管理员可在受控 Docker 容器内运行 psql 检查事务与权限。

本地 API、Storage、RPC 和用于渲染图片的辅助服务只允许精确配置的 loopback origin；不跟随到非本地 origin 的重定向。启动前匹配配置项目身份与数据库 marker。凭证通过本地忽略文件或进程环境传入，绝不将 secret 放入页面、日志、任务文件或 URL。

替代方案：复用默认 root Supabase 容易误 reset 旧数据；SQLite/D1 改变批准的业务数据库；直接 PG TCP 不适合当前 Worker 运行边界，均不采用。

### 2. 一个明确的持久化组合，旧内存模式保持兼容

各现有 source selector 新增 `local_persistent`，明确包括 `LOCAL_CHECKOUT_SOURCE=local_persistent` 与 `PHOTOGIFT_PRODUCT_SOURCE=local_persistent`；集中解析本轮的本地连接配置与运行时模式，验证 Auth、Cart、Catalog/configuration、Checkout/shipping/coupon、Upload、Order、Payment、Fulfillment、Tracking、Admin commerce 与 Delivery 的 project/mode 一致性。缺配置、模式混用、production/staging/未知环境、项目 marker 不匹配均拒绝；不自动回退 `local_fake` 或原生产 source。各能力须独立显式选择，不因 Cart、Catalog 或 Admin 启用而自动启用 Checkout；Product 原有生产 `supabase` 和显式非生产 `fixture` 行为不变，Checkout absent/disabled 仍 unavailable。

新增本地目录/配置读取适配器，合成 Product/SKU、customization definitions、价格及有限 shipping/coupon rules 与规则版本入本地 namespace，作为 synthetic checkout 的数据库权威。运费仅解析受限目的地、方式、资格、金额/币种和预计展示范围；优惠仅保留 valid/invalid/expired/not_applicable 语义，后三者折扣为零且不单独阻断，权威失败才 fail closed。不扩展生产运费引擎、承运商报价或促销平台。这里不扩展任何持久化目录 CRUD/API/UI：Admin 原有 local_fake 目录行为不变，持久化 commerce 模式不能把其编辑结果用于当前结账。目录变更/历史漂移测试使用独立授权的测试 setup，不能通过公共 HTTP 接受任意种子或价格。

Checkout 在两种模式中均只读：新模式仅读取同项目的 Cart、目录、规则及必要身份/receipt 权威，不改 Cart、不 attach upload、不创建 Order/Payment，不把 `AcceptedCheckout` 落库、持久化为 checkout session/ID 或作为浏览器授权。Order 仍须独立 fresh-read 并在创建事务中复核输入版本。仅 `local_persistent` 依据服务器 item classification 支持 digital-only：保留 contact email 校验，不要求 physical address、shipping method、Shipment 或 tracking，shipping 不适用且本地算术贡献为零；mixed 必须校验物理地址及物理项适用的 shipping rules，数字交付按 item 独立判断。`local_fake` 的 fixture、物理 checkout 覆盖及内存丢失行为不扩展。

两种模式的 tax 均严格为 `tax.status = not_activated`、`tax.amount = null`，不猜税率、不把 null 写成真实零税、不计算真实税。`localDemoTotal = subtotal + shipping - discount` 只用于本地开发/测试算术，排除税，不代表应付额、价格锁定或订单/支付授权；持久化输入并不使 Checkout handoff 具有持久性或支付权威。

所有端口先做兼容性梳理：将依赖同步聚合写入的使用方改为 await，并定义原子命令端口。继续保留 Map adapters 用于离线回归，不能把数据库逐表写入包装成外观相同的“事务”。

### 3. 数据实体和数据库权限

| 实体组 | 本轮数据职责 |
| --- | --- |
| project marker / migration ledger | 项目 ID、schema 版本、开发/一次性身份与迁移 checksum |
| local customers / sessions / access grants | 现有测试账号密码摘要、opaque session 的哈希、期限与撤销；游客订单/draft 访问范围 |
| catalog / variants / fields / pricing rules | 本地合成目录的可重建版本化权威，非生产回填 |
| carts / lines / drafts / configured values | 稳定行 ID、配置副本与修订、行数量、顺序、裁切和 CAS 版本 |
| media objects / receipts / derivatives / copy bindings | 私有内部 locator、真实尺寸/类型、状态、owner、来源、引用保留及清理租约 |
| orders / order items / immutable snapshots | 订单接触信息和总额、商品/SKU/选项/币种/价格/规则版本/定制/履约完整购买事实 |
| payment attempts / command bindings | 模拟支付结果及原子订单转换、幂等 selector 与规范化请求摘要 |
| fulfillment / photo reviews / manifests / decisions | 唯一聚合版本、逐项审核、订单级 v1–v3 预览、两次修改、超时决定与审计 |
| shipments / tracking events | 手动物流、唯一履约关联、事件顺序和幂等 |
| digital versions / grants / tickets / attempts | 当前发布版本、有效期、额度、一次 ticket 哈希与领取审计 |

所有业务表启用 RLS；匿名/普通客户端角色无直接表 CRUD 或执行服务端写 RPC 的权限。受限函数使用固定 search_path、最小授权、明确参数类型；必要的 security-definer 函数不可被 PUBLIC 调用。数据库外键/唯一键覆盖项目、owner、order item、receipt attach、action key 和版本关系。不可变 snapshot 不暴露更新入口；mutable lifecycle 独立于购买事实。

service credential 只证明应用有访问本地项目的权限，不代表请求者有业务权限。每个 HTTP 请求重新验证会话/guest/operator authority，再在事务内锁定并验证对应 owner/resource 关系。包括“不适用于本人”的读取不得泄露资源是否存在。

### 4. 身份连续性不等于实现正式 Auth

保留现有本地 email/password 界面与密码摘要强度，为现有 provider 增加持久化 adapter；不把明文密码或可重放 bearer 值落库。opaque session 保存哈希、customer subject、创建/失效/撤销时间；logout 撤销在重启和其他实例中立即生效。

游客 draft 签名 cookie 保留当前验证逻辑与有效期；数据库持久化绑定及资源范围，不把签名 cookie 的结构强行改成另一认证协议。订单 capability/ticket 等独立随机 bearer 只存哈希。签名配置跨重启保持稳定且保存在忽略配置中；不在启动时随意生成新 key 造成所有授权失效，也不延长现有授权 TTL。

会员历史按验证后的 stable customer subject 读取；游客历史按原本授权范围读取。禁止登录时根据邮箱自动 claim 游客订单。本地账号成功不代表 Supabase Auth 需求完成。

### 5. 原子创建订单和一次性定制附件

#### local_persistent capability pre-commit protocol（owner-approved clarification）

仅 `local_persistent` 在现有 `POST /api/local-orders` 内增加无业务写入的 capability establishment round trip。通过原 same-origin、bounded-input 和独立 source/project/marker 配置门后，无有效 capability 时返回 `204 No Content` 和 HttpOnly/SameSite cookie；不得创建 Order/item、receipt attach、grant、幂等结果或 Payment。客户端最多自动再提交一次，复用完全相同的 serialized input 与 creationAttemptId，不读取 cookie、不传 token JSON；再次收到 establishment 则进入 retryable，禁止循环。

Capability 使用独立稳定 local-only signing secret、随机 browser secret、MAC、version、issuedAt、expiresAt；不得包含 owner/Cart/Order/email。仅 regex 合法不代表 server-issued。有效未过期 token 跨 Order 保持不变；数据库只保存 canonical raw token 的 SHA-256，不能存 raw 或可逆加密副本。缺失/伪造/过期 cookie 的 establishment 只提供未来创建凭证，不能按 key/email/session/Cart/reference claim 旧订单。原 guest cookie、selected Cart owner、member session 与 `local_fake` 的签发/Map/reissue 行为不变。

提交前重新验证 selected owner；服务端 grant expiry 取 capability expiry 与 fresh owner expiry 上界，会员还受 durable session expiry 限制。RPC 显式复核 grant expiry 大于当前时间且不晚于 owner/session expiry，不内置独立 30-day TTL。已提交 binding 先 fresh auth 再匹配 key/owner/Cart/version/context/capability digest，重放不延长 grant、不追加新 bearer。第一个 establishment 响应丢失时无购买写入；cookie 已到达则重试可正常创建；commit 响应丢失后新进程用原 cookie 重放同一 Order，不从 DB 恢复 raw token。

Owner 裁决：Order ownership follows the verified purchase resource owner。保留 `readPersistentPurchaseCart` 的 guest-first exact Cart 读取：有效 guest authority 找到 Cart 后，整个创建、receipt attach、access grant、幂等绑定与后续读取均沿用该 guest owner，不因同请求有 member session 而创建会员绑定。仅 guest 下 exact Cart 为 not_found 且当前 customer 确实拥有该 Cart 时，才选择 customer purchase owner；没有 guest cookie 时也只能读取当前 customer 自有 Cart。这是身份选择，不是迁移。无效/过期/不可验证 guest authority 不能靠会员 session、邮箱或 Cart ID claim 游客资源。

新会员订单仅来自 customer-owned Cart，需原 Order capability 与 fresh matching member session。游客订单仍需原游客订单授权，不产生自动会员 grant。事务内复验 project/Cart owner/version、每项 draft/media/receipt owner，任何混用均无写入地拒绝。创建幂等包含 canonical owner kind/identity，重放不能切换 guest/customer。Task 6.3 copy 仅同 owner，不能绕过该边界；不修改已存在游客订单或资源归属。

流程：验证 caller → 定位同项目 Cart 和 creationAttemptId → 先查已提交幂等绑定 → 对新操作锁定 Cart/version、目录配置版本与所需收据 → 在事务内复核已解析配置及价格来源 → 写订单头、所有 item snapshot、媒体 attach、access grant、幂等结果和 Cart version / creation-context validation state → 单次提交。Order success does NOT consume, clear, delete, or change Cart lines or quantities.

若价格由 TypeScript 领域函数计算，RPC 必须锁定/核对其权威输入版本与摘要（包括同项目 shipping/coupon rules），禁止先读取后提交期间被目录或规则改价。金额以整数最小货币单位计算；discount 按符合条件的行小计比例，向下取整后按最大余数补齐，平局按稳定 item 顺序；shipping 同法只分配给需运输的物理项，权重全零时等权，digital-only shipping 为零。逐项分摊合计与订单金额守恒。tax 状态及订单/逐项 tax amount 保持 `not_activated/null`，不存在数值税额分摊；不得为了守恒把 null 转成已计算税额或真实零税。任何 item/receipt 失败都回滚整单。成功重试先授权再重放，不能因为 receipt 已 attach 或 Catalog 已修改而创建另一订单。

每 receipt 最多绑定一个 item。单 item quantity > 1 只绑定一次；配置复制到另一个 item 时，走显式同 owner 的 copy command，新建授权记录，必要时共享不可变私有原图的 object record，原图清理依据所有存活引用。复制本身有幂等键，不能信任客户端传来的第二个 receipt ID。

### 6. 私有图像和非分布式事务

#### Task 6.5 — explicit purchased preview authority (owner decision)

Only `local_persistent` recognizes `catalog_products.fulfillment_definition.requiresProductionPreview` as an explicit boolean, protected by the same-project Product version and the existing commit locks. A bounded persistent mapper separates this extension before invoking the unchanged strict shared fulfillment parser. Catalog browsing does not require the extension on unrelated Products; every selected new Order item does. No missing/null/malformed default is allowed.

Capture one `item.fulfillment.requiresProductionPreview` per stable Order item, regardless of quantity or receipt count. True requires that exact item in a future complete preview manifest; false disables preview only, not payment, photo review, production, or shipping gates. Never infer this fact from classification, shipping, production mode, images, fields, receipts, SKU, Supplier, or browser data.

Historical complete reads use immutable Order facts only. Pre-0016 items lacking the fact remain unavailable to preview-dependent exact-item consumers, even if current Catalog later supplies it. A bounded customer summary may omit the unsupported policy without claiming production readiness. No historical backfill, second snapshot store, production Catalog schema change, or Task 7 implementation is authorized by this clarification. New synthetic acceptance Products explicitly declare their policy.

Storage 桶全部 private；浏览器仅使用经授权的同源媒体入口，不拿 Storage signed URL、bucket 或 object key。上传端对实际 bytes/可解码尺寸/MIME/文件大小/数量/像素上限检查，拒绝 SVG/HTML、畸形和解压炸弹；文件名只作为脱敏显示元数据。

原图不可改写。裁切基于可信解码后的方向标准化尺寸，保存归一化坐标和 crop revision；最终预览由可信服务器渲染器从原图生成，不能信任浏览器 canvas。为了不将原生图片库塞进 Worker，本地渲染采用仅本轮使用的隔离 Node helper，使用 sharp 解码/旋转/裁切；通过 loopback 私有请求调用，验证项目身份、服务端凭证和输入上限，无任意 URL 获取或任意文件路径参数。该 helper 不提供客户认证、结账或数据库权威，不是第二个商城后端。生产 renderer 适配另议。

对象与数据库不能一起提交：媒体使用 `pending/ready/failed` availability，加 owner receipt 生命周期；先由服务器生成并持久化 operation identity，绑定 project、verified owner、Product/field、slot generation/crop revision 与规范化输入，再写不可变对象，验证可读和内容后 CAS 发布 ready。客户端仅可持有 opaque selector，不能自行命名或凭该 ID 授权；丢响应/重启后须 fresh owner 验证并匹配原操作上下文，恢复同一在途操作的已存结果，不重复接受 receipt。若原操作身份无法证明则安全 unavailable，不凭文件名、bytes/hash 或客户端 ID 猜测去重；显式独立上传仍创建独立操作。裁切时旧的已确认版本可保留展示，新版 ready 前不可宣称已保存或参与以新版为内容的订单提交。中断后幂等 reconciliation 只处理属于自己的对象，迟到结果不能覆盖后续 generation。

helper 验收须包括实际 vinext/Worker → loopback helper → 可信 crop 的 smoke，不用 Node 单元调用替代。以无外网副作用的拒绝测试覆盖任意 URL/文件路径、错误 origin/端口/project/凭证及到非 allowlisted origin 的重定向，证明 SSRF 防护和凭证不转发；helper 不可用时保持 bounded unavailable/pending，不回退客户端 canvas。

清理先在 DB 获取可回收记录租约，attach 与 cleanup 在同一序列化边界竞争，cleanup 获胜后不能 attach；attach 获胜后不能删 bytes。共享原图按引用保留。对象缺失时安全 unavailable，不重建假数据。

### 7. 统一预览、生产和发货门禁

复用 Local Fulfillment 状态机，数据库命令原子更新聚合版本、动作绑定、审核、manifest、客户决定和审计。每订单最多两次客户修改请求，不改成每 item 两次；初始 v1，最多产生 v2/v3。一个不可变订单级 manifest 覆盖所有 purchased configuration 要求预览的稳定 item，各 item 可以有自己的私有预览图。缺图/placeholder 不能满足持久化预览要求。

approve/revision 必带 expected manifest version；授权优先，已提交同等动作重放优先于当前状态验证。新的 stale 动作或第三次修改原子拒绝。生产必须 local paid、适用照片审核通过、最新完整 manifest 批准；全部 items 都关闭 preview 时允许审核后生产，不伪造批准。

管理员仅可在配置的 server deadline 后，对当前完整 pending manifest 以非空理由进行独立 timeout confirmation，记录真实管理员和版本；不能重置次数、批准旧版本或在 revision pending 时确认，不能自动进入生产。未配置 deadline 不启用该操作。

发货必须在同事务内检查 canonical paid、审核/预览门禁及 quality_check，再绑定唯一 Shipment。物理项检查承运商/单号；数字-only 不要求物理 shipment，混合单数字交付按 item 独立评估。所有 Admin/operator/supplier/tracking 入口调用同一命令边界，未适配 supplier 入口在 persistent 模式明确 unavailable，不以隐藏按钮替代服务器拒绝。

旧 `/api/orders`、`/api/admin/orders`、旧数字交付与 email lookup 不被用于本轮数据，也不能根据 local reference 找到本轮表。旧正常 production 行为不在此轮重新定义。

### 8. 数字交付额度是一次领取尝试，而非已下载字节数

管理员向精确 digital item 发布 immutable version，发布/替换均复核 canonical local paid、适用照片审核、最新 required manifest 批准；关闭预览的 item 不引入 dummy preview，数字-only 不要求 shipment/tracking。pending/failed 不可下载。授权策略需显式配置有限有效期和正整数次数；测试种子可有标注为测试的数值，但没有隐含运营默认值。grant 绑定 owner、item、expiry、limit、consumed、revoked；更换文件版本不重置计数或延期。

同源 ticket 短期、opaque、仅存哈希，期限不晚于 grant；签发 ticket 不扣次数且必须 same-origin/authenticated POST，不通过可被预取的 GET 发放。下载 GET 验证真实 caller、当前版本、paid/ready/expiry/revocation，先成功打开对应私有对象的可读流，再调用事务 claim 复核所有条件、ticket single-use 和剩余额度，提交后才能向客户发送任意文件字节。

commit 前 Storage/DB 失败不扣次数；提交后断线算一次尝试，不自动返还，也不声称最后一字节已接收。HEAD/识别出的 prefetch 不扣次数，客户端不预取下载 URL；不支持通过 range 重用已领取 ticket。多个 ticket 争最后一次额度只有一个事务成功。grant/version 锁规定与撤销/替换的线性顺序：撤销先提交则旧 claim 失败，claim 先提交的 stream 不承诺收回。

响应使用 attachment、nosniff、private/no-store、no-referrer；审计分开记录 claim 与 stream 结果，进程崩溃后可保留 unknown stream 状态，不能自动记为完整下载。系统不允许浏览器直接请求 Storage 或通过旧邮箱查单获取文件。

### 9. 上传交互沿用稳定 slot 模型

保留现有 image slot reducer、crop validation 和 move-up/down 可访问按钮，增加 drag/drop 多选上传、pointer/touch 可视化裁切和重排。拖动不能依赖 desktop drag events 作为唯一移动端操作；键盘和数字参数替代继续可用。每异步上传/派生操作带稳定 slot ID、操作版本和取消状态，防止迟到响应复活已删除图或覆盖重排后的别图。

UI 明确区分浏览器即时预览、上传中、服务器派生中、已保存、失败。中途失败保留其他已确认图片/文字/顺序；恢复仅使用当前 owner 的 persisted draft。裁切方向/比例与服务端 renderer 保持一致。保留尺寸提示，但不新增“已识别清晰人脸”等未经实现的声明。

## Risks / Trade-offs

- [旧需求无持久化与新模式冲突] → 十一份既有能力 delta 明确按 mode 划分，连同四份新能力共 15 份；fake 行为不变，新增本地例外不解除生产 stop gate。
- [本地库变成影子生产模型] → 独立 namespace、明确转换/对账文档，不自动标记 C1/Phase C 完成；正式接入是后续批准变更。
- [多入口双写和并发漏洞] → async port 清单、RPC事务和两实例测试；数据库失败不双写 Map。
- [原图共享与清理误删] → 对象引用/保留关系、cleanup lease 和 attach/copy 锁顺序测试。
- [无法保证下载最后一字节] → UI 明示次数是成功领取尝试，保留 claim/stream 独立审计。
- [镜像下载、端口冲突或 Docker 不可用] → 前置检查先停止并报告，不伪造 integration pass，不使用远程项目替代。
- [辅助图片渲染服务增加本地运行复杂度] → 只本地工具，单一受限请求协议，统一启动/停止日志与健康检查；不依赖浏览器提交图片作为最终权威。
- [既有渲染测试失败] → 保留当前 4 个失败的名称、cause 证据和状态；修复涉及本轮路由时可在对应任务处理，但不关闭断言换取通过。

## Migration Plan

1. 实施首批仅新增本轮 local harness 与安全检查。检查并记录现有库/服务身份，不读取其业务数据，不覆盖环境文件，不关闭用户服务器。
2. 创建独立开发项目和每轮 disposable 测试项目；对全新库建立 marker，在任何 reset 前必须同时校验 run ID、allow-disposable、loopback、project ID 与数据库 marker。首次初始化仅允许已确认新建的本轮项目，不能把缺 marker 的既有库当成空库。
3. 执行本轮独立 migration 清单和合成 seed，核验 RLS、grant、约束、RPC search_path 与 Storage private policy。migration ledger/checksum 使再次执行无重复迁移；不要求原始 CREATE TABLE SQL 可以随意重复运行。
4. 先接身份/Cart/Upload/目录，再接原子 Order/Payment、Fulfillment/Tracking、Digital Delivery；每批完成对应 integration 才更新 tasks checkbox。
5. 真实测试“进程 A 写入→停止 A→启动 B→原 cookie 恢复”、两实例并发、数据库和 Storage stop/start 保留 bytes。另单独 reset 一次性项目证明从零重建，而不是将重建当恢复。
6. 回退：将本轮 source 关闭，停本轮服务并保留开发卷供诊断；数据库故障不自动切 fake。只可删除身份验证通过且本轮明确标识的 disposable 测试资源。失败迁移恢复以重新构建该一次性项目为主，禁止删除/重置现有开发库。
7. 输出 migration、restart、权限、媒体字节、并发额度和浏览器验收证据，以及 offline/full verify 的独立结果。不执行 deploy、db push、remote link 或生产启用。
