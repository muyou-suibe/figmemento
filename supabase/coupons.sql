-- PhotoGift coupon setup. Run after supabase/schema.sql.
alter table public.orders add column if not exists coupon_code text;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  max_redemptions integer,
  redemption_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.coupons to service_role;

insert into public.coupons (code, discount_type, discount_value, min_subtotal_cents, max_redemptions, active)
values
  ('WELCOME10', 'percent', 10, 2000, 1000, true),
  ('FRIEND15', 'percent', 15, 3000, null, true)
on conflict (code) do update set
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  min_subtotal_cents = excluded.min_subtotal_cents,
  max_redemptions = excluded.max_redemptions,
  active = excluded.active,
  updated_at = now();
