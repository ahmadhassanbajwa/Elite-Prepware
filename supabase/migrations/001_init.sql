-- Eliteprepware schema. Run in Supabase SQL editor.
create extension if not exists pgcrypto;

create table clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  email text, billing_address text, tax_id text,
  created_at timestamptz not null default now()
);

create table pricing_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_basis text not null check (billing_basis in ('flat','per_unit','per_period')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index pricing_types_name_active on pricing_types (lower(name)) where archived_at is null;

create table intakes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  reference text,
  received_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid references intakes(id),
  client_id uuid not null references clients(id),
  name text not null, sku text,
  quantity integer not null default 1 check (quantity > 0),
  size_units numeric(8,2) not null default 1 check (size_units > 0), -- total footprint in pallet units
  velocity numeric(6,2) not null default 1 check (velocity >= 0),     -- expected turnover score
  received_at timestamptz not null default now(),
  departed_at timestamptz
);

create table item_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  pricing_type_id uuid not null references pricing_types(id),
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'USD',
  effective_from timestamptz not null default now(),
  effective_to timestamptz
);
create index on item_prices (item_id);

create table client_price_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  pricing_type_id uuid not null references pricing_types(id),
  amount numeric(12,2) not null check (amount >= 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz
);

create table storage_slots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  zone text,
  distance numeric(8,2) not null,            -- distance from loading dock
  capacity_units numeric(8,2) not null default 1,
  active boolean not null default true       -- false = rental expired / unavailable
);

create table item_assignments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  slot_id uuid not null references storage_slots(id),
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);
create unique index one_open_assignment_per_item on item_assignments (item_id) where released_at is null;

create view slot_availability as
select s.id, s.code, s.zone, s.distance, s.capacity_units, s.active,
       s.capacity_units - coalesce(sum(i.size_units) filter (where a.id is not null), 0) as free_units
from storage_slots s
left join item_assignments a on a.slot_id = s.id and a.released_at is null
left join items i on i.id = a.item_id
group by s.id;

create sequence invoice_number_seq;
create function next_invoice_number() returns text language sql as $$
  select 'INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 5, '0')
$$;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid not null references clients(id),
  status text not null default 'issued' check (status in ('draft','issued','paid','void')),
  currency char(3) not null default 'USD',
  subtotal numeric(12,2) not null, tax numeric(12,2) not null, total numeric(12,2) not null,
  period_start date, period_end date,
  issued_at timestamptz not null default now(),
  due_date date,
  pdf_path text,
  created_at timestamptz not null default now()
);

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  item_id uuid references items(id),
  pricing_type_id uuid references pricing_types(id),
  description text not null,        -- snapshot text, survives renames/archiving
  quantity numeric(10,2) not null,
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null
);

-- Backend uses the service-role key (bypasses RLS). RLS with no policies blocks anon/authenticated direct access.
alter table clients enable row level security;
alter table pricing_types enable row level security;
alter table intakes enable row level security;
alter table items enable row level security;
alter table item_prices enable row level security;
alter table client_price_overrides enable row level security;
alter table storage_slots enable row level security;
alter table item_assignments enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

insert into storage.buckets (id, name, public) values ('invoices','invoices',false) on conflict do nothing;
