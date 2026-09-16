-- DISPOSABLE LOCAL TEST FIXTURE ONLY.
-- NOT A PRODUCTION MIGRATION.
-- NOT AUTHORITATIVE HISTORICAL MIGRATION PROVENANCE.
-- SCHEMA ONLY — ZERO BUSINESS DATA.
-- DO NOT APPLY TO REMOTE OR CONNECTED DATABASES.
--
-- This fixture reconstructs only the high-confidence pre-C1 FigMemento
-- business schema required for local migration verification. Local Supabase
-- platform initialization must already provide public, auth.users, anon,
-- authenticated, and service_role. Historical RLS, policies, grants, default
-- ACLs, and event-trigger behavior are intentionally excluded.

begin;

create extension if not exists "pgcrypto";

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.products (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  category text not null,
  description text not null default ''::text,
  price_cents integer not null,
  currency text not null default 'USD'::text,
  art_key text,
  image_urls text[] not null default '{}'::text[],
  customization_schema jsonb not null default '{}'::jsonb,
  is_digital boolean not null default false,
  is_published boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint products_pkey primary key (id),
  constraint products_slug_key unique (slug),
  constraint products_price_cents_check check (price_cents >= 0),
  constraint products_currency_check check (currency = 'USD'::text)
);

create table public.orders (
  id uuid not null default gen_random_uuid(),
  order_number text not null,
  customer_email text,
  customer_id uuid,
  status text not null default 'pending_payment'::text,
  payment_status text not null default 'unpaid'::text,
  fulfillment_status text not null default 'awaiting_payment'::text,
  subtotal_cents integer not null default 0,
  shipping_cents integer not null default 0,
  discount_cents integer not null default 0,
  coupon_code text,
  total_cents integer not null default 0,
  currency text not null default 'USD'::text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  tracking_number text,
  tracking_carrier text,
  tracking_status text,
  shipping_address jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint orders_pkey primary key (id),
  constraint orders_order_number_key unique (order_number),
  constraint orders_stripe_checkout_session_id_key unique (stripe_checkout_session_id),
  constraint orders_stripe_payment_intent_id_key unique (stripe_payment_intent_id),
  constraint orders_customer_id_fkey
    foreign key (customer_id) references auth.users(id)
    on update no action on delete set null,
  constraint orders_status_check check (
    status in ('pending_payment', 'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded')
  ),
  constraint orders_payment_status_check check (
    payment_status in ('unpaid', 'paid', 'failed', 'refunded')
  ),
  constraint orders_fulfillment_status_check check (
    fulfillment_status in ('awaiting_payment', 'awaiting_review', 'in_production', 'quality_check', 'shipped', 'delivered', 'issue')
  ),
  constraint orders_subtotal_cents_check check (subtotal_cents >= 0),
  constraint orders_shipping_cents_check check (shipping_cents >= 0),
  constraint orders_discount_cents_check check (discount_cents >= 0),
  constraint orders_total_cents_check check (total_cents >= 0),
  constraint orders_currency_check check (currency = 'USD'::text)
);

create table public.order_items (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  product_id uuid,
  product_name text not null,
  unit_price_cents integer not null,
  quantity integer not null default 1,
  customization jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint order_items_pkey primary key (id),
  constraint order_items_order_id_fkey
    foreign key (order_id) references public.orders(id)
    on update no action on delete cascade,
  constraint order_items_product_id_fkey
    foreign key (product_id) references public.products(id)
    on update no action on delete set null,
  constraint order_items_unit_price_cents_check check (unit_price_cents >= 0),
  constraint order_items_quantity_check check (quantity > 0)
);

create table public.order_uploads (
  id uuid not null default gen_random_uuid(),
  order_item_id uuid not null,
  storage_key text not null,
  original_filename text,
  content_type text,
  file_size_bytes integer,
  review_status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  constraint order_uploads_pkey primary key (id),
  constraint order_uploads_order_item_id_fkey
    foreign key (order_item_id) references public.order_items(id)
    on update no action on delete cascade,
  constraint order_uploads_file_size_bytes_check check (file_size_bytes > 0),
  constraint order_uploads_review_status_check check (
    review_status in ('pending', 'approved', 'needs_reupload', 'rejected')
  )
);

create table public.coupons (
  id uuid not null default gen_random_uuid(),
  code text not null,
  discount_type text not null,
  discount_value integer not null,
  min_subtotal_cents integer not null default 0,
  max_redemptions integer,
  redemption_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint coupons_pkey primary key (id),
  constraint coupons_code_key unique (code),
  constraint coupons_discount_type_check check (discount_type in ('percent', 'fixed')),
  constraint coupons_discount_value_check check (discount_value > 0),
  constraint coupons_min_subtotal_cents_check check (min_subtotal_cents >= 0)
);

commit;
