-- Working PhotoGift catalog seed aligned to the 21-SKU acceptance list.
-- Review business copy, prices and supplier requirements before production launch.

insert into public.products
  (slug, name, category, description, price_cents, art_key, is_digital, is_published, customization_schema)
values
  ('couple-figure', 'Custom Couple Figure', '3D keepsakes', 'Turn your favorite moment into a tiny keepsake.', 6990, 'figure', false, true, '{"photo":true,"note":true,"people":true}'::jsonb),
  ('pet-figure', 'Pet Portrait Figurine', 'Pet memories', 'A little portrait of the one who is always there.', 4590, 'pet', false, true, '{"photo":true,"note":true,"pet_name":true}'::jsonb),
  ('solo-figure', 'Photo to Mini Figure', '3D keepsakes', 'A joyful, hand-finished figure made from your photo.', 3990, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('bobblehead', 'Custom Bobblehead', '3D keepsakes', 'A playful bobblehead made from a favorite person or pet.', 5990, 'figure', false, true, '{"photo":true,"note":true}'::jsonb),
  ('brick-person', 'Photo Brick Figure', '3D keepsakes', 'A tiny brick-style keepsake built around your favorite face.', 4990, 'figure', false, true, '{"photo":true,"note":true}'::jsonb),
  ('pixel-cube', 'Custom Pixel Photo Cube', '3D keepsakes', 'A colorful desk piece built from your favorite faces.', 3490, 'cube', false, true, '{"photo":true,"note":true}'::jsonb),
  ('figurine-keychain', '3D Printed Figurine Keychain', '3D keepsakes', 'A tiny personalized keepsake you can carry with you.', 3990, 'figure', false, true, '{"photo":true,"note":true}'::jsonb),
  ('pet-portrait', 'Custom Pet Portrait', 'Pet memories', 'A thoughtful portrait of the companion who is always there.', 2790, 'pet', false, true, '{"photo":true,"note":true,"pet_name":true}'::jsonb),
  ('glass-light-picture', 'Custom Glass Light Picture', '3D keepsakes', 'Turn a meaningful image into a glowing keepsake.', 3990, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('leaf-engraving', 'Leaf Engraved Picture', '3D keepsakes', 'A delicate engraved keepsake inspired by your favorite memory.', 2190, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('fridge-magnet', 'Custom Fridge Magnet', '3D keepsakes', 'Keep a favorite face close with a custom everyday magnet.', 1290, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('custom-puzzle', 'Custom Photo Puzzle', '3D keepsakes', 'Piece together a memory made for a slow, happy afternoon.', 2490, 'cube', false, true, '{"photo":true,"note":true,"size":true}'::jsonb),
  ('crystal-frame', 'Crystal Photo Frame', '3D keepsakes', 'A polished crystal keepsake for a photo worth displaying.', 2990, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('wood-engraving', 'Custom Wood Engraving', '3D keepsakes', 'A warm engraved wood piece made for your favorite story.', 2290, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('herbal-tattoo', 'Herbal Temporary Tattoo Set', '3D keepsakes', 'A small set of personalized temporary designs to share.', 1290, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('temporary-tattoo', 'Custom Temporary Tattoos', '3D keepsakes', 'Turn your artwork or memory into a playful temporary tattoo.', 990, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('custom-pillow', 'Custom Photo Pillow', '3D keepsakes', 'A soft personalized pillow made from a photo you love.', 2490, 'portrait', false, true, '{"photo":true,"note":true}'::jsonb),
  ('phone-case', 'Custom Phone Case', '3D keepsakes', 'Carry a favorite memory with you every day.', 1490, 'portrait', false, true, '{"photo":true,"note":true,"model":true}'::jsonb),
  ('digital-portrait', 'AI Illustrated Portrait', 'Digital gifts', 'A ready-to-share illustrated portrait, delivered digitally.', 990, 'digital', true, true, '{"photo":true,"style":true}'::jsonb),
  ('ai-oil-portrait', 'AI Oil Painting Portrait', 'Digital gifts', 'A painterly digital portrait ready to download and share.', 1290, 'digital', true, true, '{"photo":true,"style":true}'::jsonb),
  ('digital-wallpaper', 'Digital Wallpaper Illustration', 'Digital gifts', 'A personalized wallpaper or couple illustration for your screen.', 790, 'digital', true, true, '{"photo":true,"style":true}'::jsonb),
  ('pet-memorial', 'Always With You Portrait', 'Pet memories', 'A gentle memorial portrait for a friend you never forget.', 2990, 'pet', false, true, '{"photo":true,"note":true,"pet_name":true}'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  price_cents = excluded.price_cents,
  art_key = excluded.art_key,
  is_digital = excluded.is_digital,
  is_published = excluded.is_published,
  customization_schema = excluded.customization_schema,
  updated_at = now();
