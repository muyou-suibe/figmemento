## 1. 本地隔离工程与执行安全门

本清单为实施规划与执行状态；Batch 1 已实现可离线验证的安全基础设施，但尚未启动或部署数据库、未执行迁移。沿用正式 `openspec instructions tasks --change complete-local-commerce-persistence --json` 的任务结构，本次重读 proposal/design/tasks、相关主规格及原有 13 份 delta，补齐 local-checkout-runtime 与 engineering-foundation 后按全部 15 份 delta specs 核对覆盖；design 无会改变实施内容的实质 Open Questions。仅在存在对应测试或验收证据时勾选任务；规划产物、代码存在或 OpenSpec planning complete 本身不构成实施完成证据。

执行纪律：按依赖推进；每组末项为该批验证门槛，相关任务须有对应测试/验收证据方可勾选。真实集成前置条件不可用时标记 `blocked` 并保持未勾选，不以 skip 或离线通过替代。离线套件禁止数据库访问。仅后续实施阶段可操作身份校验通过的独立本地栈；始终禁止 remote link、db push、deploy、远程迁移及真实支付/邮件/承运商调用，不操作旧开发库。新发现规划矛盾须停止报告，不自行补业务假设。

- [x] 1.1 固化实施前只读基线：记录现有工作区变更、开发进程/端口和项目身份，不读取旧业务数据、不覆盖环境文件、不关闭用户服务；保留既有 lint/typecheck/892 offline/build 通过、rendered 7/11 的历史记录，并记录当次实际结果及 4 项失败的名称、cause 和状态。
- [x] 1.2 建立 `local/commerce/` 独立 Supabase CLI workdir、项目 ID、PostgreSQL 17 配置及兼容锁定 CLI 的镜像清单；为 API/DB/Studio/Storage 和图片 helper 做整组端口预检，冲突或 Docker/镜像不可用时停止而非抢占现有 5432x 项目。
- [x] 1.3 实现独立开发栈保留 volumes 的启动/停止与健康检查，以及每轮唯一 run ID 的 disposable 测试栈；证明正常启停不隐含 reset、seed、删除数据或重建授权，并明确 UI/日志的 development/test-only 标识。
- [x] 1.4 建立统一连接策略：只允许精确配置的 loopback API/Storage/RPC/helper origin，拒绝非本地重定向，业务访问前核对 project ID 与数据库 marker；验证凭证仅由忽略配置或进程环境提供，不进入仓库、客户端、日志或 URL。
- [x] 1.5 实现首次初始化与破坏性重建的分离门禁：仅已确认新建的本轮项目可初始化 marker；reset 必须同时满足当前 run ID、allow-disposable、loopback、精确 project ID 和数据库 marker，缺 marker 的既有库不得被当作空库。
- [x] 1.6 给 reset 拒绝路径增加可验证用例：默认 root、旧 run、保留开发栈、远程目标、缺失/不匹配 marker、仅有 disposable 标签均在删除前拒绝；验证失败回退仅停本轮 source/服务并保留开发卷，不自动切 fake 或清理用户资源。
- [x] 1.7 本批门槛：在独立本地工程验证预检、健康检查、marker 和 reset 防护，记录目标身份、端口及拒绝证据；确认没有根默认 reset/seed、旧库读写或远程访问，缺前置条件记 blocked。

## 2. 独立 schema、异步端口与数据库原子边界

- [x] 2.1 在独立 `local/commerce/` workdir 建立 ordered migration 清单、schema 版本和带 checksum 的独立 migration ledger，验证约束/权限并记录 rollback/forward-fix；仅限 synthetic namespace，不替代生产 canonical `supabase/migrations/`，不把旧 flat bootstrap 当已对账基线；初始化仅使用合成 seed，拒绝现有客户账号/订单/照片导出，不修改或执行旧 root reset/seed，不批准 C1/Phase C；通过 ledger 检验已执行迁移而非要求原始 CREATE SQL 任意重跑。
- [x] 2.2 建立 `local_commerce` 的项目/身份/授权、目录配置、Cart/draft、media/receipt/copy 实体及约束；验证跨 project/owner/field 的非法关系被拒绝，稳定 ID、版本、生命周期和清理租约可以持久化。
- [x] 2.3 建立订单/item/不可变 snapshot、payment/action、fulfillment/review/manifest/decision、shipment/event、digital version/grant/ticket/attempt 实体；为 receipt 单 item、action key、版本、唯一 Fulfillment→Shipment 设置数据库唯一键/外键，区分购买事实与可变生命周期。
- [x] 2.4 对全部业务表启用 RLS 并收紧 private Storage policy；受限 RPC 使用固定 search_path、显式参数类型和最小授权，必要的 security-definer 禁止 PUBLIC 调用；以 anon/普通角色验证不能直接表 CRUD 或执行服务端写 RPC。
- [x] 2.5 先完成 provider-neutral 端口兼容重构清单，将同步聚合调用者逐一改为 await，定义带授权上下文、expected version 和幂等上下文的原子命令端口；保留 Map adapters 的离线行为，禁止逐表写伪装事务或 DB/Map 双写。
- [x] 2.6 接入 Supabase HTTP/RPC/Storage 适配与统一 `local_persistent` source composition：逐能力检查所需 Auth、Cart、Catalog/configuration/pricing、Local Checkout/shipping/coupon、Upload、Order、Payment、Fulfillment、Tracking、Admin commerce、Delivery 项目一致性；明确 `LOCAL_CHECKOUT_SOURCE` 与 `PHOTOGIFT_PRODUCT_SOURCE` 独立显式配置和同项目校验；禁止 Worker PG TCP 驱动、缺配置/错模式/故障回退，保留 Checkout absent/disabled、local_fake、Product 默认 supabase/显式 fixture 及 Admin source 缺省的既有差异。
- [x] 2.7 本批门槛：通过本地 psql/HTTP 集成验证 schema、ledger、约束、RLS/RPC 权限与事务回滚，并用模式矩阵证明 staging/production/未知环境、非 loopback、混用项目均 fail closed；离线 provider sentinel 证明 fake 无 DB/远程构造，保留旧生产组合而不真实连接它。

## 3. 持久化本地账号、会话与原游客授权连续性

- [x] 3.1 为现有本地 email/password provider 增加持久化账号 adapter，沿用安全加盐密码摘要；验证规范化邮箱并发注册最多一个身份、失败不覆盖凭证，密码不以明文落库、记录或返回，不激活 Supabase Auth OTP/Google。
- [x] 3.2 持久化密码学随机 opaque session 的安全 hash、stable customer subject、创建/到期/撤销时间；保留原 cookie 安全属性，每次读取查询 durable authority，不在 DB 不可用时用缓存授权；账号/session 提交失败不签发成功 cookie。
- [x] 3.3 接通 POST sign-up/sign-in/sign-out 与 GET current-session 的安全投影；sign-out 仅过期客户 cookie 且 durable revoke 成功后才报成功，无 GET logout；验证撤销写失败返回 bounded unavailable，不声称已撤销。
- [x] 3.4 持久化游客 Cart/draft/upload/Order 的 owner-resource 绑定，保留原签名 cookie 的格式、签发、验证和 TTL；稳定保存签名配置而不随重启换 key，独立随机 capability/ticket 仅存 hash，禁止 raw bearer 入库或出现在 action binding。
- [x] 3.5 将会员订单绑定到创建时验证的 opaque subject，读取同时要求原 Order capability 和有效会员 session；验证登录/退出/相同邮箱均不 claim、merge 或转移游客 Order/Cart/draft/upload，不改游客 cookies，创建后续订单不使前序绑定失效。
- [x] 3.6 本批门槛：以真实本地 DB 检验注册竞争、提交失败、logout 跨实例立即失效、伪造/他人/已撤销授权的非枚举拒绝；用受控服务端时钟验证 session/guest expiry 前、等于、后的边界及浏览器改时无效，跨进程原 cookie 恢复须再通过 11.1。

## 4. 同项目目录权威、持久化 Cart 与草稿

- [x] 4.1 建立仅供本轮使用的数据库合成 Product/SKU/options、customization/fulfillment definitions、价格及有限 shipping/coupon rules 与规则版本读取 adapter；仅 recognized dev/test 的 `PHOTOGIFT_PRODUCT_SOURCE=local_persistent` 和独立 `LOCAL_CHECKOUT_SOURCE=local_persistent` 可在同项目 marker 校验后使用，生产 Supabase/显式 fixture 行为不变；运费只覆盖受限目的地/方式/资格/金额/币种/预计展示范围，优惠保留 valid/invalid/expired/not_applicable、后三者零折扣不单独阻断、权威失败 fail closed，不扩展生产运费或促销引擎；公开商品选择和 configured-item resolution 使用同项目权威，不使用硬编码或 Admin memory Catalog 回退，不新增持久目录 CRUD/API/UI 或公共 seed/改价入口。
- [x] 4.2 接通 Cart identity、distinct line ID、quantity、accepted configuration revision/values 和 owner 绑定的持久化；验证两次显式添加即使配置相同也保持独立行，行级数量更新不影响另一份配置，保留数量/same-origin/安全投影规则。
- [x] 4.3 用原子命令同步提交 Cart 行变化与 server-owned version/CAS；验证并发修改不丢更新、失败不出现半行或假版本，clear Cart 只清行，不删除 drafts/uploads/Orders/授权；订单成功后亦保留 Cart 行与数量。
- [x] 4.4 持久化 owner-scoped draft 的稳定 slot 关联、媒体顺序、crop 参数和 confirmed revision；用 CAS 防旧 save 覆盖新版本，恢复仅返回当前授权的已确认内容，不从 object URL/browser storage 猜回未保存数据。
- [x] 4.5 Cart Add 与 Checkout Readiness 复用同一 signed guest owner、字段校验和持久 receipt 权威，Cart ID 不能代替上传授权；验证外项目/Map/过期/外 owner receipt 拒绝，text-only 路径不强制启用 Upload，readiness 保持只读和原 issue 词汇。
- [x] 4.6 保留 Cart 金额仅作 display 的语义；Local Checkout fresh-read 同项目 Cart/Catalog/规则及必要 receipt，后续订单边界仍须独立重验 Product/SKU/availability/currency/configuration/fulfillment 和服务器价格，陈旧输入返回 stale/unavailable；Checkout 只读、不改 Cart/draft/version、不 attach/消费 upload，不持久化 `AcceptedCheckout`、checkout session/ID，不代表订单/支付授权。仅 persistent digital-only 在 server classification 下豁免 physical address/method/Shipment/tracking、保留 contact email 和已提供字段校验、shipping 不适用且算术贡献为零；mixed 校验物理地址和适用运费、数字分支独立。两模式 tax 保持 `not_activated/null`，`localDemoTotal = subtotal + shipping - discount` 排除税且仅本地算术，非应付额。Cart/Catalog/Admin 单独启用不激活 Checkout、支付、优惠/税/运费等独立能力，fake 物理 fixture 与 restart-loss 语义不扩展。
- [x] 4.7 本批门槛：以本地 DB 验证配置副本、Cart CAS、草稿恢复、跨 Cart/owner 拒绝、text-only 解耦及 readiness/Checkout 无业务写入或持久 handoff；覆盖 source 缺省/disabled/invalid/禁止环境/项目混用、shipping/coupon DB 规则成功/不适用/失效/故障、digital-only 无地址但缺 contact 拒绝、mixed 缺物理地址/方式拒绝、tax 精确 not_activated/null；通过授权测试 setup 修改目录/规则证明 fresh authority 与 stale checkout，禁止 memory fallback，不新增公共改价/seed HTTP，历史读取另由第 6 组验证。

## 5. 私有原图、可信派生图与 receipt 生命周期

- [x] 5.1 复用唯一浏览器上传入口 POST `/api/uploads`，保留 source→origin→owner→field 的验证顺序；对真实 JPEG/PNG/WebP bytes、检测 MIME、解码尺寸、大小、字段数量和像素上限检查，拒绝 SVG/HTML/伪装/损坏/解压炸弹而不相信浏览器声明。
- [x] 5.2 建立设计指定的本地隔离 Node/sharp helper，用可信原图解码、方向标准化、裁切；协议校验 loopback、项目身份、服务端凭证、输入上限，拒绝任意 URL/文件路径，仅承担本地图片处理，不变成第二个商城后端或生产 renderer。
- [x] 5.3 保留不可变原图，服务器验证有限坐标、正尺寸、边界和字段约束后生成 crop revision 对应派生图；以方向/像素样例验证客户端 crop 与 sharp 结果一致，拒绝伪造 canvas/尺寸，失败不覆盖已确认原图或旧 crop。
- [x] 5.4 实现先由服务器生成并持久化 operation identity，再写私有对象、确认可读与内容、CAS 发布 ready 的 pending/ready/failed 流程；operation 绑定 project、verified owner、Product/field、slot generation/crop revision 和规范化输入，浏览器仅持 opaque selector 而非自建操作权威；DB 与 Storage 不宣称分布式事务，object 成功 metadata 失败不发 accepted receipt，保留 bounded compensation/孤儿清理及仅处理本操作对象的 reconciliation，原操作身份不可证明时不猜回成功。
- [x] 5.5 将原图/派生图读取收敛至授权同源媒体边界，持久 receipt 保存 Product/field/configuration、owner、crop/order、对象关联与 expiry；浏览器仅得 opaque 安全投影，禁止 Storage signed URL、bucket/key/path/永久 URL；缺对象返回 unavailable，不造替代图。
- [x] 5.6 实现 receipt replacement/removal/expiry 与 DB cleanup lease，和 attach/copy 共用锁顺序；区分 expirable draft 与 Order-attached retention，共享原图按全部存活引用保留，cleanup 失败可重试但不恢复资格，未选中的迟到上传走授权清理。
- [x] 5.7 本批门槛：真实 Storage 验证原图字节不变、可信 crop preview、私有访问及 owner 拒绝；运行实际 vinext/Worker→loopback helper→可信派生图 smoke，不以仅 Node 调用替代；SSRF 拒绝测试覆盖任意 URL/文件路径、非 allowlisted origin/端口、错误 project/凭证及重定向，证明不请求外部目标、不转发凭证。注入写对象/写 metadata/渲染/可读性失败证明 pending/failed 不可下单。丢响应/中断/重启后 fresh owner 验证并匹配 durable server-owned operation identity/原上下文，恢复同一在途操作只返回一次 accepted receipt，冲突输入/跨 owner/未知操作拒绝，迟到结果不覆盖新 generation；显式独立上传仍独立，不按文件名/bytes/hash/客户端 ID 静默去重，attach/copy 竞争续验 6.7、11.4。

## 6. 原子购买、完整快照与模拟支付

Owner-approved persistent capability clarification：6.1/6.2/6.4 沿用现有 POST `/api/local-orders`，首个有效 server-issued HttpOnly capability 必须通过无业务写入 round trip 先到达浏览器。客户端仅以同 key/同 payload 自动重发一次；DB 仅存 digest，grant expiry 受 fresh owner/capability/member session 上界约束。6.7 覆盖 establishment 丢响应、commit 丢响应后跨进程重放、伪造/过期 token、新 token 不 claim 旧 Order、多 Order 原 cookie 连续性及 local_fake 不变。协议修复自身不代表 6.4 完成；不增加 task count 或勾选任务。

本组 owner 裁决：Order 继承 freshly verified selected Cart purchase owner。guest Cart + member session 仍是 guest Order；只有 customer-owned Cart 才创建 member binding。6.1/6.2 事务复核同 project/owner，6.3 copy 仅同 owner，6.4 重放不能切换 owner，6.5 保留原 Order 授权，6.7 须覆盖混合 session/Cart、非法 guest authority、cross-owner receipt 与重放拒绝。此说明不改变 checkbox 或任务数量。

- [x] 6.1 实现原子创建订单 RPC：新操作锁定 Cart/version、目录配置/价格及同项目 shipping/coupon DB rules 输入版本和 receipts，独立 fresh-read/复核服务器解析结果与摘要，不信任 `AcceptedCheckout` 或浏览器回传；以整数最小货币单位计算价格和适用 discount/shipping 分摊，用 stable item 顺序确定性分配余数，各项合计与订单对应金额及 `subtotal + shipping - discount` 守恒，物理运费仅分配给适用物理项、digital-only shipping 算术贡献为零。订单与逐项 tax 保持 `not_activated/null`、无数值税额分摊，不将 null 转成真实零税或计算税额；重验 digital-only contact/地址豁免及 mixed 物理 shipping，不称本地总额为支付授权，浏览器价格/状态不能成为 authority，目录/规则改价竞争不得形成读写窗口漏洞。
- [x] 6.2 在同一创建事务写订单头、所有 stable item snapshot、receipt attach、access grant、幂等结果和必要版本状态，保留 Cart 行/数量；完整保存商品/SKU/options labels、数量/币种/费用、规则版本、定制定义/约束/值/notes、履约分类/预览要求及顺序/crop 媒体事实，任一写失败整单回滚。
- [x] 6.3 实现每 receipt 最多一个 item 的 attach 与显式同 owner copy command：quantity > 1 仅 attach 一次，第二 item 必须新授权 receipt 并记录 provenance；copy 同键同输入重放、冲突拒绝，禁止客户端伪造 copy、跨 owner 或同 receipt 多 item，共享 bytes 不共享权限。
- [x] 6.4 创建幂等先 fresh auth 再匹配 committed binding，早于新 receipt eligibility；响应丢失/重启/目录修改后同上下文重放原订单，改数量/配置/图片顺序/crop/contact/Cart context 或 owner 则拒绝，新 attempt 不能复用已消费 receipt，绑定中不保存 raw capability。
- [x] 6.5 接通 canonical Order 与 exact Order/item 的历史只读 adapter，会员/游客按原授权恢复；目录变化、删除或不可用时不重建历史，缺 purchased facts 或错 Order/item 配对返回统一 unavailable；客户/Admin/履约/物流/交付获得各自最小投影，媒体引用不直接授予 bytes 权限。
- [x] 6.6 实现模拟 payment attempt、binding、bounded audit 与 canonical Order transition 的单事务：fresh auth 后 replay-first，服务器验证 snapshot 金额/币种和 outcome，覆盖 success/failure/cancel、failed 可重试、paid 新键拒绝及不同 outcome/key 冲突；明确“Paid — Local simulation / No real money was charged”，不自动触发履约或 provider。
- [x] 6.7 本批门槛：真实 DB/Storage 验证多 item snapshot、copy/quantity 与整单回滚、历史目录漂移、创建和支付丢响应重放；覆盖 physical/digital-only/mixed 的地址与规则边界、discount/shipping 确定性余数分摊守恒及 tax not_activated/null 不数值化；两独立实例竞争同/异 creation/payment key、同 receipt、Cart version、目录/shipping/coupon 规则版本及 attach/cleanup，证明最多一个有效效果且无 Order/payment/receipt/grant 半提交。

## 7. 逐项审核、订单级 manifest 与两次修改

- [x] 7.1 持久化唯一 Fulfillment aggregate、逐项 photo review、aggregate version 与 audit；显式 operator admission 才进入 photo_review，客户 read 不创建聚合，每个新 mutation 检查 canonical paid/succeeded 与 actor，不改 Order 购买快照或另建生命周期副本。
- [x] 7.2 实现 immutable Order-wide preview manifest：每次发布包含所有 purchased configuration 要求 preview 的 exact stable items 及可信私有 ready 图，拒绝缺项/外 item/placeholder/未验证图；preview-disabled items 豁免，多个 item 图合属初始 v1 且不耗修改次数。
- [x] 7.3 实现客户 approve/request revision 的 required expected manifest version 与 bounded plain-text note；版本由服务器生成 v1→v2→v3，每 Order 最多两次修改，revision pending 的旧图不能批准，stale/缺 version/第三次或 v4 请求原子拒绝。
- [x] 7.4 将 review/manifest/decision/counter/lifecycle/action/audit 原子提交，actor 授权后 replay-first，绑定原 commit 上下文；重复 approve/revision/publication 在状态进展或重启后返回原结果，不多计次数、增版本或重复审计，冲突输入拒绝，媒体失败不发布 incomplete manifest。
- [x] 7.5 接通生产和质检命令：适用 photo review 通过且所有 required items 的最新完整 manifest 已批准方可独立进入 production；仅全项 preview-disabled 可审核后直入，不生成 dummy approval；质量检查是本能力终点，不隐式发货。
- [x] 7.6 实现现有 signed Admin 的独立 timeout confirmation：仅存储的 server deadline 已过、当前完整 pending manifest、paid/review 通过、无 revision pending 且非空 bounded reason 时原子记录真实 actor、deadline/version/time/reason/action/audit；缺 deadline/未过期/stale 拒绝，不冒充客户、不重置次数、不自动生产。
- [x] 7.7 本批门槛：本地集成覆盖 required/disabled 混合 items、photo review pending/rejected、v1–v3 和第三次拒绝、无预览生产例外、timeout 有效/无效/重放；两实例验证最后一次 revision、publication 对 approval 竞争及提交故障，快照 deep-equal 且审计/计数/版本无部分变化。

## 8. Admin、供应商与物流共用门禁

- [x] 8.1 盘点客户/Admin/operator/supplier/tracking 和旧 Order/digital 路由的全部入口，持久操作统一走 canonical commands；未适配 supplier 入口明确 server-side unavailable，且在 memory repository 构造前拒绝，不新增持久供应商管理或声称 supplier 全恢复。
- [x] 8.2 接通 existing signed Admin verifier 后的 persistent Orders/commerce reads 和控制，mutation 使用 established same-origin gate 与真实 actor；保留 source 缺省生产路径和未知 source 拒绝，浏览器不能选 backend，不新增双 Admin 角色、越权直写状态或返回 secrets。
- [x] 8.3 保留 Admin Catalog read/write 为显式 local_fake、只内存且重启丢失；证明其编辑不改变持久 storefront purchase authority，Admin 单独启用不激活 public sources，fake Products/Orders provider sentinels 仍为零，unsupported controls 在服务器拒绝而非仅隐藏。
- [x] 8.4 实现物理 shipment create/dispatch 的 shared transaction 门禁：canonical paid、适用 review、最新 required preview approval、quality_check 及 immutable physical facts 同步复核；每 Fulfillment 唯一 Shipment，使用既有 allowlisted local carrier 和 server-generated local tracking number，不复制 mutable Order/destination snapshot。
- [x] 8.5 持久化 shipment_created→shipped→in_transit→delivered、events/timestamps/action/audit，按 Shipment 当前状态给 next action，重放优先且新 create key 不能重复发货；digital-only 不建物理 Shipment，mixed 的物理/数字分支独立，delivered 不代表数字交付或触发退换等扩展。
- [x] 8.6 保留 tracking 客户只读无副作用和非枚举授权，operator 使用独立 server authority；HTTP 测试同源 GET 无 Origin/缺 Fetch Metadata 的既有允许规则、evil/cross-site GET 拒绝、POST 缺/错 Origin 拒绝，以及客户不能伪造 paid/qualityCheck/shipped 或替代 operator。
- [x] 8.7 本批门槛：遍历所有入口直接请求验证 shared production/shipping gates；两实例竞争 Shipment 唯一关系、事件顺序并注入失败/丢响应，证明无跳级/重复终态且上游快照不变；验证旧 `/api/orders` normalized 503、旧 Admin/邮箱查单/下载不能访问本轮数据，未适配 supplier 列为 unsupported。

## 9. 私有数字交付、同源 ticket 与原子次数

- [x] 9.1 实现仅授权 Admin 对 exact digital Order/item 发布 immutable private version，校验 local paid、适用 item photo-review/preview gate 与 bytes+metadata ready；publication pending/failed 不可下载，同 operation 重放而 conflicting file/item/version 拒绝，失败/迟到结果不能覆盖后续 ready publication。
- [x] 9.2 建立 owner/item-scoped grant：显式有限正 duration、正整数 maxDownloads、server expiry/consumed/revoked；无配置、零/负/非有限/小数次数拒绝，示例政策仅 test-only；digital-only 不要求地址/Shipment/tracking 但保留 contact 校验，mixed 按 ready digital item 独立判定。
- [x] 9.3 实现 authenticated same-origin POST 签发短期 opaque ticket，绑定 grant/owner/item/current version、expiry 不晚于 grant，durable 仅存 hash；签发不扣/预占次数、不用可预取 GET 发票据，不返回 Storage signed URL 或 redirect，原 session/guest 验证持续有效才可签发。
- [x] 9.4 实现显式下载 GET 的 open→claim→stream 顺序：先打开精确私有对象可读流，再单事务复核当前 owner/paid/ready/version、ticket single-use/expiry、grant expiry/revoke/quota并提交 ticket use、一次 consumption 与 claim audit，任何客户文件字节必须晚于 commit。
- [x] 9.5 定义 GET/HEAD/prefetch/range 与响应安全：HEAD/已识别 prefetch/preload/probe 不发 bytes、不 claim，已消费 ticket 的 GET/自动 retry/range 不可复用；返回 attachment、nosniff、private/no-store、no-referrer，UI 不预取下载地址，body/headers/redirect 不泄露 provider locator。
- [x] 9.6 实现 replace/revoke 与 claim 的 grant/version 锁顺序：替换发布新版本使旧 tickets 失效但保留原 expiry/limit/consumed，replacement 失败保留旧 ready，revoked 不因替换复活；撤销/替换先 commit 则旧 claim 拒绝，claim 先 commit 的 stream 不承诺收回。
- [x] 9.7 分离 durable claim/quota 与 stream-result 审计：Storage open 或 DB commit 前失败不发 bytes/不扣次数；commit 后断线/stream failure 仍算一次、不退款/不复活 ticket，崩溃可记 unknown 而非完整下载；publication/ticket/denial/replacement/revoke 日志隐去 token/cookie/URL/locator/非必要 PII。
- [x] 9.8 本批门槛：真实本地交付集成验证会员/游客、伪造/跨用户/邮箱/未付拒绝、有限策略和 server expiry 边界、重复 GET/HEAD/prefetch/range、两实例多 tickets 争最后额度、revoke/replace 对 open 后 claim 竞争；逐一注入 publication/open/commit/stream 故障，核对 bytes、次数和脱敏审计，缺栈记 blocked。

## 10. 稳定 slot 上传、裁切与桌面/移动浏览器旅程

- [x] 10.1 在现有 image slot reducer 上增加多文件 drag/drop 和 file button、逐文件 remaining capacity 提示；超限文件明确标识且不破坏现有 slots，保留 labeled move up/down 和 visible focus/order/progress/error，不把 desktop drag events 作为唯一操作。
- [x] 10.2 让 upload/preview/save 结果携带 stable slot ID、generation/revision/cancel 状态，只作用于匹配的 live slot；测试逆序完成同时重排、删除/取消/替换后迟到 success 或 failure，旧响应不能复活 slot、覆盖新图或关联错 receipt/crop。
- [x] 10.3 实现 mouse/touch/pointer 拖动重排和可视化 crop move/resize，保留键盘数字 position/width/height 与 reset-to-original；验证 overlay、归一化参数、方向标准化原图和服务器预览一致，无效 crop 保留上一确认版本。
- [x] 10.4 实现 per-image decoding/uploading/server-derived pending/confirmed/failed、仅当前失败 slot 的 retry 和同一在途操作恢复；丢响应时 reconciliation 已有操作而不重复已接受 receipt/选中图片，独立新上传仍独立，其他 text/images/order/crops 不丢失，未确认 required media 阻止最终提交。
- [x] 10.5 接通 persisted draft refresh/重启恢复与 stale save/preview guard，仅展示当前 owner 最新 confirmed order/crops；清楚区分本地预览与已保存，未上传/未保存数据不保证恢复，尺寸提示不宣称识别 blur/face/侧脸/遮挡/人数。
- [x] 10.6 执行真实桌面浏览器旅程：合成数据库商品→多图 drop/reorder/crop→Cart→创建/模拟支付→授权审核/manifest→客户修改及批准→物理跟踪或 digital download；核对页面安全状态、实际私有 bytes、键盘/button 等价路径和跨用户/伪造 cookie 拒绝。
- [x] 10.7 执行 375px 移动/coarse-pointer 浏览器旅程：触摸排序/裁切、数量限制、逐 slot retry/取消/替换/迟到响应、键盘参数替代、刷新和新应用进程后恢复；使用真实 `/admin/login`、`/admin/products`、`/admin/orders` 的 signed Admin，覆盖长内容、reduced-motion、安全错误与无横向溢出，区分 fake Catalog 与持久 commerce。
- [x] 10.8 本批门槛：保存 desktop/mobile/keyboard 浏览器步骤、结果与截图/网络证据，并用数据库禁用的交互测试覆盖 race reducer；真实保存/重启证据必须关联第 11 组的新进程，browser-only 可用不算 persistence 通过，数据库/Storage 不可用则相应 browser integration blocked。

## 11. 真进程恢复、栈保留、重建与故障证据

- [x] 11.1 建立并运行真实进程 A→终止 A→新启动 B 的恢复测试，记录不同 PID/启动记录和同一 project；用原有效 customer session/guest cookies 恢复 Cart/draft、顺序/crops/原图及派生 bytes、Order snapshots/多订单 grants、payment/action history、review/manifest/revision/timeout、shipment 和 digital grant/ticket/quota，禁止用 Map reset、fixture 重播或重新登录发凭证替代。
- [x] 11.2 实际 stop/start 本轮保留开发 Supabase 数据库和 private Storage，保存前后数据/对象摘要及身份核验；验证账号、授权、订单各域历史及 consumed quota 保留、过期/撤销仍拒绝，缺 bytes 仅 unavailable；同时证明 Admin fake Catalog 编辑仍按原语义丢失。
- [x] 11.3 在当轮全新 disposable 栈执行独立 migrations/合成 seed，核对 ledger/checksum 后 rerun 无重复迁移；另经过完整 reset 安全门重新 disposable 重建，再跑 schema/权限/基础流程，并以证据区分从零重建与 retained-data 恢复；迁移中断恢复仅重建该 disposable 项目。
- [x] 11.4 运行两个同时存活、独立应用实例的并发套件，按 3.6/4.7/6.7/7.7/8.7/9.8 对应测试收集 registration、Cart/price version、receipt attach/copy/cleanup、Order、payment、revision/approval/publication、Shipment/events、最后 download quota 的外部结果与 DB 约束证据，禁止进程内 mutex/Map 代替跨实例互斥。
- [x] 11.5 运行可定位故障注入矩阵：应用终止/丢响应、DB outage/transaction rollback、Storage 写/读失败、helper failure、metadata/orphan reconciliation、cleanup retry、claim 前/后和 stream partial failure；逐案例核对不泄漏、不部分提交、不返回伪 ready、不静默 fake 回退及恢复可重试性。
- [x] 11.6 审计安全字段与权限矩阵：customer/guest/Admin/operator/supplier、cross-order item、forged/revoked/expired credentials、Origin/source tampering、RLS/RPC/Storage direct access、旧 lookup/write 全覆盖；检查页面/响应/headers/redirect/log/audit/客户端构建产物无 password/session hash/raw token、service credential、locator/SQL/非必要私密信息，证明无 remote provider 调用。
- [x] 11.7 本批门槛：整理 restart、stop/start、fresh ledger/rerun/rebuild、两实例竞争、故障和 browser 证据索引，逐 scenario 标 passed/failed/blocked；更新本地启动/停止/安全重建/rollback/helper 使用说明及 unsupported supplier 清单，列明 C1/Phase C、正式 Auth/支付/邮件/承运商/Storage 生产决策仍待批准，不把代码存在当功能验收。

## 12. 独立质量检查与最终完成判据

- [x] 12.1 单独运行 lint 并记录命令、退出码、warnings/errors 与基线差异；修复本轮相关问题而不关闭规则，失败保持可见。
- [x] 12.2 单独运行 typecheck 并记录结果；异步端口、HTTP/RPC 投影和 UI 类型不得用 broad any、ts-ignore 或降低 strictness 掩盖。
- [x] 12.3 单独运行 production build 并记录结果与客户端凭证/Node helper 隔离检查；build 不部署、不连接远程、不意味着 local_persistent 可在 staging/production 使用。
- [x] 12.4 单独运行 `test:offline`，以数据库访问禁止/网络 provider sentinels 证明全程无数据库与远程依赖，记录实际测试数和结果；保留 fake restart-loss 和主 spec `local-order-runtime` 明定的 fixture 契约：local_fake 物理浏览器覆盖使用真实 glass-light-picture 的 image＋optional text，shipping-required text-only 用 deterministic domain/HTTP integration，不将 digital-portrait 伪造为物理 shipping fixture；浏览器证据单列，不算作 offline 已执行，persistent synthetic physical/digital/mixed 集成另列。
- [x] 12.5 在 build 后单独运行 `test:rendered`，逐项保留既有 4 个 RSC 失败的名称、cause、状态和新回归；只能在正常修复后保留原断言复测，不删除、不改 skip、不放宽断言以换取通过。
- [x] 12.6 最后单独运行完整 `verify` 并记录其各阶段和整体退出状态；若前置阶段使后续阶段未执行，明确写未执行而引用独立执行结果，不能因 offline、新闭环或 planning complete 通过便声称 full verify 通过。
- [x] 12.7 最终门槛：复核 15-spec 追踪及每批实际证据后才逐任务勾选；任何未运行/失败/blocked 集成不算完成，报告分别列新闭环验收与 lint/typecheck/build/test:offline/test:rendered/full verify。只保护 C1/Customization Phase C 尚未获批的生产迁移、回填与对账范围：本轮局部持久化证据不授予 BACKFILL AUTHORIZED、不代为完成 blocked 工作，不将历史 completed counts 或 Auth/Brand/Domain/Visual 等其它变更的数字冻结为永久完成判据；独立批准的后续进展按其自身契约记录。旧 orders/order_items、normalized `/api/orders` 503 和 legacy stop gates 保留，remote/部署/真实 provider 禁令不解除。

规划输入与覆盖索引（本轮均从磁盘完整重读，不以文件列表或旧摘要代替正文；表中组号用于追踪，不表示实施已完成）：

| 已重读的 delta spec | 主要任务组 |
| --- | --- |
| [engineering-foundation](specs/engineering-foundation/spec.md) | 1、2、4、11、12 |
| [customer-auth](specs/customer-auth/spec.md) | 2、3、11、12 |
| [shopping-cart](specs/shopping-cart/spec.md) | 2、4、6、11、12 |
| [local-checkout-runtime](specs/local-checkout-runtime/spec.md) | 2、4、6、11、12 |
| [local-commerce-persistence](specs/local-commerce-persistence/spec.md) | 1–12 |
| [local-customer-upload-runtime](specs/local-customer-upload-runtime/spec.md) | 2、4、5、6、10、11 |
| [local-order-media-snapshots](specs/local-order-media-snapshots/spec.md) | 5、6、11 |
| [local-customization-media-experience](specs/local-customization-media-experience/spec.md) | 4、5、10、11 |
| [local-order-runtime](specs/local-order-runtime/spec.md) | 3、4、6、8、11、12 |
| [local-configured-item-read-authority](specs/local-configured-item-read-authority/spec.md) | 4、6、7、8、9、11 |
| [local-payment-simulation](specs/local-payment-simulation/spec.md) | 2、6、11、12 |
| [local-fulfillment-runtime](specs/local-fulfillment-runtime/spec.md) | 7、8、11 |
| [local-tracking-runtime](specs/local-tracking-runtime/spec.md) | 8、11 |
| [local-admin-acceptance-runtime](specs/local-admin-acceptance-runtime/spec.md) | 7、8、9、10、11 |
| [local-digital-delivery](specs/local-digital-delivery/spec.md) | 9、10、11 |

同时完整重读 [proposal](proposal.md) 与 [design](design.md)，以上任务保留其独立本地工程、HTTP/RPC 原子边界、sharp local helper 和既有生产批准门约束。
