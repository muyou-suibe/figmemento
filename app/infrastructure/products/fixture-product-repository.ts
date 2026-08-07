import type { ProductRepository } from "../../application/product-catalog";
import type { Product } from "../../domain/product";

export const developmentProductFixtures: readonly Product[] = [
  { id: "couple-figure", name: "Custom Couple Figure", category: "3D keepsakes", price: 69.9, tag: "Best seller", description: "Turn your favorite moment into a tiny keepsake.", art: "figure" },
  { id: "pet-figure", name: "Pet Portrait Figurine", category: "Pet memories", price: 45.9, tag: "Made for them", description: "A little portrait of the one who is always there.", art: "pet" },
  { id: "solo-figure", name: "Photo to Mini Figure", category: "3D keepsakes", price: 39.9, description: "A joyful, hand-finished figure made from your photo.", art: "portrait" },
  { id: "bobblehead", name: "Custom Bobblehead", category: "3D keepsakes", price: 59.9, description: "A playful bobblehead made from a favorite person or pet.", art: "figure" },
  { id: "brick-person", name: "Photo Brick Figure", category: "3D keepsakes", price: 49.9, description: "A tiny brick-style keepsake built around your favorite face.", art: "figure" },
  { id: "pixel-cube", name: "Custom Pixel Photo Cube", category: "3D keepsakes", price: 34.9, description: "A colorful desk piece built from your favorite faces.", art: "cube" },
  { id: "figurine-keychain", name: "3D Printed Figurine Keychain", category: "3D keepsakes", price: 39.9, description: "A tiny personalized keepsake you can carry with you.", art: "figure" },
  { id: "pet-portrait", name: "Custom Pet Portrait", category: "Pet memories", price: 27.9, description: "A thoughtful portrait of the companion who is always there.", art: "pet" },
  { id: "glass-light-picture", name: "Custom Glass Light Picture", category: "3D keepsakes", price: 39.9, description: "Turn a meaningful image into a glowing keepsake.", art: "portrait" },
  { id: "leaf-engraving", name: "Leaf Engraved Picture", category: "3D keepsakes", price: 21.9, description: "A delicate engraved keepsake inspired by your favorite memory.", art: "portrait" },
  { id: "fridge-magnet", name: "Custom Fridge Magnet", category: "3D keepsakes", price: 12.9, description: "Keep a favorite face close with a custom everyday magnet.", art: "portrait" },
  { id: "custom-puzzle", name: "Custom Photo Puzzle", category: "3D keepsakes", price: 24.9, description: "Piece together a memory made for a slow, happy afternoon.", art: "cube" },
  { id: "crystal-frame", name: "Crystal Photo Frame", category: "3D keepsakes", price: 29.9, description: "A polished crystal keepsake for a photo worth displaying.", art: "portrait" },
  { id: "wood-engraving", name: "Custom Wood Engraving", category: "3D keepsakes", price: 22.9, description: "A warm engraved wood piece made for your favorite story.", art: "portrait" },
  { id: "herbal-tattoo", name: "Herbal Temporary Tattoo Set", category: "3D keepsakes", price: 12.9, description: "A small set of personalized temporary designs to share.", art: "portrait" },
  { id: "temporary-tattoo", name: "Custom Temporary Tattoos", category: "3D keepsakes", price: 9.9, description: "Turn your artwork or memory into a playful temporary tattoo.", art: "portrait" },
  { id: "custom-pillow", name: "Custom Photo Pillow", category: "3D keepsakes", price: 24.9, description: "A soft personalized pillow made from a photo you love.", art: "portrait" },
  { id: "phone-case", name: "Custom Phone Case", category: "3D keepsakes", price: 14.9, description: "Carry a favorite memory with you every day.", art: "portrait" },
  { id: "digital-portrait", name: "AI Illustrated Portrait", category: "Digital gifts", price: 9.9, tag: "Instant delivery", description: "A ready-to-share illustrated portrait, delivered digitally.", art: "digital" },
  { id: "ai-oil-portrait", name: "AI Oil Painting Portrait", category: "Digital gifts", price: 12.9, description: "A painterly digital portrait ready to download and share.", art: "digital" },
  { id: "digital-wallpaper", name: "Digital Wallpaper Illustration", category: "Digital gifts", price: 7.9, description: "A personalized wallpaper or couple illustration for your screen.", art: "digital" },
  { id: "pet-memorial", name: "Always With You Portrait", category: "Pet memories", price: 29.9, description: "A gentle memorial portrait for a friend you never forget.", art: "pet" },
];

export class FixtureProductRepository implements ProductRepository {
  async listPublishedProducts(): Promise<Product[]> {
    return developmentProductFixtures.map((product) => ({ ...product }));
  }
}
