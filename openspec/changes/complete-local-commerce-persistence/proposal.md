## Why

当前本地购物、订单、支付模拟、履约和上传依赖进程内状态，无法通过重启恢复、数据库事务或私有文件交付验收。先补齐本地可重建的业务闭环，可以在不部署、不连接远程服务的条件下验证真实的数据完整性和权限边界，而不是继续扩大模拟功能覆盖面。

## What Changes

- 引入显式 `local_persistent` 模式，使用独立 Docker 本地 Supabase 栈的 PostgreSQL 和私有 Storage；保持现有 `disabled`、`local_fake` 行为及生产拒绝规则，不允许故障后回退模拟数据。
- 用户于 2026-09-10 明确选择：独立本地 Supabase 栈；一并持久化现有本地测试账号与会话。本地 Storage 仅是验证适配器，不批准最终生产 Supabase Storage/R2 选型。
- 持久化购物车、定制草稿、上传收据、订单访问授权、不可变订单项快照、模拟支付及履约/物流状态；用数据库事务和幂等约束替代进程内原子性。重启后通过原有有效会话/游客授权恢复，不允许凭邮箱或订单号重建权限。
- 将原图、裁切参数和派生预览与订单项绑定；收据到订单项一次性转交，阻止跨用户绑定、重复消费和清理竞争。商品变更不得改写历史购买事实。
- 所有本地客户、管理员、供应商和物流写入口统一使用履约命令边界；每订单最多两次客户修改请求，最新预览版本批准、照片审核、付款及质检门禁不得绕过。
- 增加拖拽上传、拖拽排序及可视化裁切，保留键盘/按钮操作与原图；不把尺寸校验宣称为模糊、侧脸、遮挡或人数识别。
- 增加私有数字交付的版本、订单项归属授权、可配置有效期及下载次数、原子领取、撤销和审计；不沿用“订单号＋邮箱即可领取下载链接”的旧路径。
- 新增独立迁移、数据库并发测试、真实应用重启及移动端/桌面浏览器验收；开发数据保留与一次性测试库重建明确分离。

### Scope and non-goals

订单归属沿用已验证的 selected Cart purchase owner，而不是由会员 session 是否存在决定。游客 Cart 在已登录浏览器中仍产生游客订单；只有验证为 customer-owned 的 Cart 才产生会员订单。不迁移 Cart/draft/upload/receipt，不创建跨 owner grant，copy 仅限同 owner。

本次只完成本地/隔离环境的可持久化业务闭环。不会部署、变更远程数据库、回填现有业务数据、连接真实支付/邮件/承运商，或引入 D1/SQLite 业务存储。正式 Supabase Auth OTP/Google、PayPal、Resend、真实分析、生产存储决策及图像内容识别不在本轮内。测试账号仍为显式非生产身份，不按邮箱自动关联游客订单。

## Capabilities

### New Capabilities

- `local-commerce-persistence`: 独立本地栈、受限迁移与种子、运行时一致性、事务边界、跨重启授权及验收环境。
- `local-order-media-snapshots`: 私有原图/派生图、定制快照、收据一次性绑定、不可变历史与清理并发。
- `local-customization-media-experience`: 拖拽上传与排序、可视化裁切、无障碍替代、保存恢复和失败处理。
- `local-digital-delivery`: 私有交付文件、发布/替换/撤销、归属授权、有效期、并发次数控制及下载审计。

### Modified Capabilities

- `engineering-foundation`: 增加显式本地持久化 Catalog source 与隔离 ordered migration ledger 例外，保留生产 Supabase、fixture 隔离及 canonical migration 契约，不提供 Catalog CRUD。
- `customer-auth`: 新增仅本地持久化测试账号/会话模式，不改变正式认证边界。
- `shopping-cart`: 增加持久化本地购物车，维持服务器权威的定制行和价格校验。
- `local-checkout-runtime`: 增加同项目数据库合成目录、有限运费/优惠规则的只读权威；仅持久化模式支持 digital-only 地址/运输豁免及 mixed 物理分支校验，tax 保持 `not_activated/null`，不持久化 `AcceptedCheckout` 或授予订单/支付权限。
- `local-customer-upload-runtime`: 增加独立本地私有 Storage 与持久化收据，明确原有内存模式与新模式的寿命差异。
- `local-order-runtime`: 本地数据库权威订单、事务创建与跨重启 capability 验证。
- `local-payment-simulation`: 持久化模拟尝试和幂等记录，与权威订单状态原子提交。
- `local-fulfillment-runtime`: 持久化预览、修改计数与审计，统一全部本地写入口门禁。
- `local-tracking-runtime`: 持久化手动物流及其授权/幂等关系，原子执行发货门禁。
- `local-configured-item-read-authority`: 支持持久化的不可变订单项权威读取，不依赖当前目录恢复历史。
- `local-admin-acceptance-runtime`: 本地持久化订单/履约/交付操作组合与旧接口隔离，保留现有目录管理行为。

## Impact

- 复用 `app/domain/` 领域规则和 provider-neutral 应用端口，在 `app/infrastructure/` 增加本地 Supabase 适配器；部分同步内存端口必须改为异步、事务性命令，而非逐个表无事务双写。
- 涉及 Cart/Upload/Order/Payment/Fulfillment/Tracking/Auth 的 runtime composition、`app/admin/` 与本地操作工具、私有媒体路由，以及 `ProductCustomizationImageField`。开发专用配置与凭证不得进入客户端产物或仓库。
- 为本轮建立独立 local harness、受版本控制的隔离 schema/migrations、明确安全的合成 seed；不得直接运行仓库现有默认 seed/reset 并假定其可安全使用。
- C1 `build-configurable-product-catalog` 与定制工作流 Phase C 仍有未批准的迁移/回填依赖。本轮在独立本地命名空间演练相同完整性契约，不标记这些生产任务完成，不解除 `/api/orders` 的 normalized-request 503 停门，也不改写旧 `orders/order_items`。正式接入另需对账批准。
- 用户现有未提交变更全部保留。基线为 lint/typecheck/892 离线测试/build 通过、rendered 7/11；4 项既有 RSC 失败必须显式跟踪，不能通过删除或放宽测试隐藏。最终验收区分“新闭环已验证”与“完整 verify 是否通过”。
- 风险重点：跨实例事务、数据库/对象存储非原子提交、下载次数语义、未过期授权重启恢复、Cloudflare Worker 对本地服务的访问、旧旁路写入口，以及本地默认 seed 的破坏性。设计与任务需逐项设置停止门和验证证据。
