/**
 * Produits StickerStreet avec images
 * Images : stickers (stickers1, stickers2), cartes (cartes1, cartes2), flyers (flyers1, flyers2)
 */
const IMG = {
  sticker1: "/images/stickers1.png",
  sticker2: "/images/stickers2.png",
  carte1: "/images/cartes1.png",
  carte2: "/images/cartes2.png",
  flyer1: "/images/flyers1.png",
  flyer2: "/images/flyers2.png",
  // Images spécifiques par produit
  skullGraffiti: "/images/skull-graffiti.png",
  flyerEventA5: "/images/flyer-event-a5.png",
  holoSticker: "/images/holo-sticker.png",
  megaPackFlyers: "/images/mega-pack-flyers.png",
  menuRestaurant: "/images/menu-restaurant.png",
  carteRonde: "/images/carte-ronde.png",
};

export const PRODUCTS = [
  { id: 1, name: "Skull Graffiti", cat: "stickers", price: 2.5, ton: 0.4, xof: 1500, emoji: "💀", img: IMG.skullGraffiti, grad: "linear-gradient(135deg, #FF6B6B, #EE5A24)", sizes: ["5×5cm","8×8cm","10×10cm"], pricesBySize: { "5×5cm": { price: 2, ton: 0.35, xof: 1200 }, "8×8cm": { price: 2.5, ton: 0.4, xof: 1500 }, "10×10cm": { price: 3.5, ton: 0.55, xof: 2100 } }, desc: "Sticker crâne style graffiti, vinyle haute qualité résistant UV", custom: true },
  { id: 2, name: "Pack Urban Mix", cat: "stickers", price: 8.0, ton: 1.2, xof: 5000, emoji: "🎨", img: IMG.sticker2, grad: "linear-gradient(135deg, #A29BFE, #6C5CE7)", sizes: ["5×5cm","8×8cm"], pricesBySize: { "5×5cm": { price: 6, ton: 0.9, xof: 3800 }, "8×8cm": { price: 8, ton: 1.2, xof: 5000 } }, desc: "Pack de 10 stickers urbains assortis, designs exclusifs", custom: false },
  { id: 3, name: "Tag Personnalisé", cat: "stickers", price: 3.5, ton: 0.5, xof: 2000, emoji: "✏️", img: IMG.sticker1, grad: "linear-gradient(135deg, #FFEAA7, #FDCB6E)", sizes: ["5×5cm","8×8cm","10×10cm","15×15cm"], pricesBySize: { "5×5cm": { price: 2.5, ton: 0.4, xof: 1500 }, "8×8cm": { price: 3.5, ton: 0.5, xof: 2000 }, "10×10cm": { price: 5, ton: 0.75, xof: 3000 }, "15×15cm": { price: 8, ton: 1.2, xof: 4800 } }, desc: "Ton propre tag transformé en sticker premium vinyle", custom: true },
  { id: 4, name: "Flyer Event A5", cat: "flyers", price: 15.0, ton: 2.3, xof: 9000, emoji: "📄", img: IMG.flyerEventA5, grad: "linear-gradient(135deg, #55EFC4, #00B894)", sizes: ["A5","A4"], pricesBySize: { A5: { price: 15, ton: 2.3, xof: 9000 }, A4: { price: 22, ton: 3.3, xof: 13000 } }, desc: "100 flyers A5 recto, papier 350g mat toucher velours", custom: true },
  { id: 5, name: "Flyer Promo A4", cat: "flyers", price: 25.0, ton: 3.8, xof: 15000, emoji: "📰", img: IMG.flyer2, grad: "linear-gradient(135deg, #74B9FF, #0984E3)", sizes: ["A4","A3"], pricesBySize: { A4: { price: 25, ton: 3.8, xof: 15000 }, A3: { price: 38, ton: 5.7, xof: 23000 } }, desc: "100 flyers A4 recto/verso, papier glacé 400g premium", custom: true },
  { id: 6, name: "Holo Sticker", cat: "stickers", price: 4.0, ton: 0.6, xof: 2500, emoji: "✨", img: IMG.holoSticker, grad: "linear-gradient(135deg, #FD79A8, #E84393)", sizes: ["5×5cm","8×8cm"], pricesBySize: { "5×5cm": { price: 3, ton: 0.45, xof: 1800 }, "8×8cm": { price: 4, ton: 0.6, xof: 2500 } }, desc: "Sticker holographique effet rainbow iridescent", custom: true },
  { id: 7, name: "Mega Pack Flyers", cat: "flyers", price: 45.0, ton: 6.8, xof: 27000, emoji: "📦", img: IMG.megaPackFlyers, grad: "linear-gradient(135deg, #FAB1A0, #E17055)", sizes: ["A5","A4","A3"], pricesBySize: { A5: { price: 38, ton: 5.7, xof: 23000 }, A4: { price: 45, ton: 6.8, xof: 27000 }, A3: { price: 55, ton: 8.3, xof: 33000 } }, desc: "500 flyers, choix du format et finition pro", custom: true },
  { id: 8, name: "Die-Cut Premium", cat: "stickers", price: 5.0, ton: 0.75, xof: 3000, emoji: "⭐", img: IMG.sticker2, grad: "linear-gradient(135deg, #00CEC9, #00B894)", sizes: ["Custom"], desc: "Sticker découpé à la forme, vinyle premium waterproof", custom: true },
  { id: 9, name: "Menu Restaurant", cat: "flyers", price: 20.0, ton: 3.0, xof: 12000, emoji: "🍽️", img: IMG.menuRestaurant, grad: "linear-gradient(135deg, #D4A574, #8B6914)", sizes: ["A5","A4","A3","Triptyque"], pricesBySize: { A5: { price: 15, ton: 2.3, xof: 9000 }, A4: { price: 20, ton: 3, xof: 12000 }, A3: { price: 28, ton: 4.2, xof: 16800 }, Triptyque: { price: 35, ton: 5.3, xof: 21000 } }, desc: "Menu personnalisé pour restaurant, papier premium mat ou glacé", custom: true },
  { id: 10, name: "Carte Classique", cat: "cartes", price: 12.0, ton: 1.8, xof: 7000, emoji: "🪪", img: IMG.carte1, grad: "linear-gradient(135deg, #636E72, #2D3436)", sizes: ["85×55mm","90×50mm"], pricesBySize: { "85×55mm": { price: 12, ton: 1.8, xof: 7000 }, "90×50mm": { price: 14, ton: 2.1, xof: 8400 } }, desc: "100 cartes de visite recto/verso, papier 350g couché mat", custom: true },
  { id: 11, name: "Carte Premium", cat: "cartes", price: 22.0, ton: 3.3, xof: 13000, emoji: "💼", img: IMG.carte2, grad: "linear-gradient(135deg, #B8860B, #DAA520)", sizes: ["85×55mm","90×50mm"], pricesBySize: { "85×55mm": { price: 22, ton: 3.3, xof: 13000 }, "90×50mm": { price: 25, ton: 3.8, xof: 15000 } }, desc: "100 cartes de visite finition soft touch + dorure à chaud", custom: true },
  { id: 12, name: "Carte Ronde", cat: "cartes", price: 18.0, ton: 2.7, xof: 11000, emoji: "⚪", img: IMG.carteRonde, grad: "linear-gradient(135deg, #DFE6E9, #B2BEC3)", sizes: ["55mm","65mm"], pricesBySize: { "55mm": { price: 16, ton: 2.4, xof: 9500 }, "65mm": { price: 18, ton: 2.7, xof: 11000 } }, desc: "100 cartes de visite rondes originales, impression HD", custom: true },
  { id: 13, name: "Pack Pro 500", cat: "cartes", price: 35.0, ton: 5.3, xof: 21000, emoji: "📇", img: IMG.carte2, grad: "linear-gradient(135deg, #0C2461, #1E3799)", sizes: ["85×55mm","90×50mm","Custom"], pricesBySize: { "85×55mm": { price: 32, ton: 4.8, xof: 19000 }, "90×50mm": { price: 35, ton: 5.3, xof: 21000 }, Custom: { price: 40, ton: 6, xof: 24000 } }, desc: "500 cartes de visite, choix de finition et papier premium", custom: true },
];
