-- PhotoGift MVP database schema
-- Run this once in Supabase SQL Editor after reviewing the project setup.

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  art_key text,
  image_urls text[] not null default '{}',
  customization_schema jsonb not null default '{}'::jsonb,
  is_digital boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_email text,
  customer_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  fulfillment_status text not null default 'awaiting_payment' check (fulfillment_status in ('awaiting_payment', 'awaiting_review', 'in_production', 'quality_check', 'shipped', 'delivered', 'issue')),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  coupon_code text,
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  tracking_number text,
  tracking_carrier text,
  tracking_status text,
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null default 1 check (quantity > 0),
  customization jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.order_uploads (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  storage_key text not null,
  original_filename text,
  content_type text,
  file_size_bytes integer check (file_size_bytes > 0),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'needs_reupload', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  action text not null check (action in ('fulfillment_status', 'tracking', 'photo_review', 'digital_delivery')),
  from_value text,
  to_value text,
  reason text,
  actor text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists products_published_category_idx on public.products (is_published, category);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_email_idx on public.orders (customer_email);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coupons_active_idx on public.coupons (code, active);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_uploads_item_idx on public.order_uploads (order_item_id);
create index if not exists order_status_logs_order_idx on public.order_status_logs (order_id, created_at desc);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_uploads enable row level security;

drop policy if exists "published products are readable" on public.products;
create policy "published products are readable"
  on public.products for select
  using (is_published = true);

-- The server-only Supabase secret key uses service_role for order and upload work.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.products to service_role;
grant select, insert, update, delete on public.orders to service_role;
grant select, insert, update, delete on public.order_items to service_role;
grant select, insert, update, delete on public.order_uploads to service_role;
grant select, insert, update, delete on public.order_status_logs to service_role;
grant select, insert, update, delete on public.coupons to service_role;

-- Orders, order items, and uploads are intentionally backend-only for the MVP.
-- The server will use the Supabase secret key for checkout, webhooks, and admin operations.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at
before update on public.coupons
for each row execute function public.set_updated_at();
