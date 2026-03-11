// Force update
import React, { useState, useEffect, useRef, Dispatch, SetStateAction, createContext, useContext } from 'react';

// --- TYPES ---

type ViewState = 'home' | 'product' | 'cart' | 'orders' | 'chat' | 'admin' | 'favorites';
type PaymentMethod = 'stars' | 'ton' | 'xof';
type Category = 'all' | 'stickers' | 'flyers' | 'business_cards' | 'photo_retouch';
type OrderStatus = 'pending' | 'confirmed' | 'production' | 'shipped' | 'delivered';

interface Product {
  id: number;
  name: string;
  category: 'stickers' | 'flyers' | 'business_cards' | 'photo_retouch';
  priceStars: number;
  priceTon: number;
  priceXof: number;
  emoji: string;
  image?: string;
  sizes: string[];
  customizable: boolean;
  description: string;
}

interface CartItem extends Product {
  cartId: string;
  selectedSize: string;
  quantity: number;
  uploadedFile?: string;
}

interface Order {
  id: string;
  date: string;
  status: OrderStatus;
  items: CartItem[];
  totalStars: number;
  totalTon: number;
  totalXof: number;
  paymentMethod: PaymentMethod;
}

interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
}

// --- CONSTANTS & DATA ---

const COLORS = {
  bg: '#0D0D0D',
  card: '#1A1A1A',
  accent: '#FF3366', // Rose néon
  secondary: '#00FF88', // Vert néon
  tertiary: '#FFE156', // Jaune vif
  cyan: '#00D4FF',
  text: '#F0F0F0',
  textDim: '#888888',
  border: '#333333',
  ton: '#0098EA',
  stars: '#FFD700',
  xof: '#FFA500', // Orange for XOF
};

const THEMES = {
  dark: {
    bg: '#0D0D0D',
    card: '#1A1A1A',
    accent: '#FF3366',
    secondary: '#00FF88',
    tertiary: '#FFE156',
    cyan: '#00D4FF',
    text: '#F0F0F0',
    textDim: '#888888',
    border: '#333333',
    ton: '#0098EA',
    stars: '#FFD700',
    xof: '#FFA500',
    input: '#1A1A1A',
    nav: '#0D0D0D',
    overlay: 'rgba(0,0,0,0.5)',
  },
  light: {
    bg: '#F5F5F5',
    card: '#FFFFFF',
    accent: '#FF3366',
    secondary: '#00CC6A',
    tertiary: '#FFD700',
    cyan: '#00B5D8',
    text: '#1A1A1A',
    textDim: '#666666',
    border: '#E5E5E5',
    ton: '#0098EA',
    stars: '#FFD700',
    xof: '#FFA500',
    input: '#FFFFFF',
    nav: '#FFFFFF',
    overlay: 'rgba(255,255,255,0.5)',
  }
};

type Theme = 'dark' | 'light';
const ThemeContext = createContext({
  theme: 'dark' as Theme,
  toggleTheme: () => {},
  colors: THEMES.dark,
});
const useTheme = () => useContext(ThemeContext);

const PRODUCTS: Product[] = [
  { id: 1, name: "Sticker Skull Graffiti", category: 'stickers', priceStars: 2.50, priceTon: 0.40, priceXof: 1500, emoji: "💀", image: "https://picsum.photos/seed/skull/400/400", sizes: ["5x5cm", "8x8cm", "10x10cm"], customizable: true, description: "Vinyle haute résistance, découpe précise. Le classique urbain indémodable." },
  { id: 2, name: "Pack Stickers Urban", category: 'stickers', priceStars: 8.00, priceTon: 1.20, priceXof: 5000, emoji: "🎨", image: "https://picsum.photos/seed/urban/400/400", sizes: ["5x5cm", "8x8cm"], customizable: false, description: "Assortiment de 10 designs aléatoires par nos artistes partenaires." },
  { id: 3, name: "Sticker Tag Perso", category: 'stickers', priceStars: 3.50, priceTon: 0.50, priceXof: 2000, emoji: "✏️", image: "https://picsum.photos/seed/tag/400/400", sizes: ["5x5cm", "8x8cm", "10x10cm", "15x15cm"], customizable: true, description: "Ton blaze, ton style. Upload ton design et on s'occupe du reste." },
  { id: 4, name: "Flyer Event A5", category: 'flyers', priceStars: 15.00, priceTon: 2.30, priceXof: 9000, emoji: "📄", image: "https://picsum.photos/seed/event/400/400", sizes: ["A5", "A4"], customizable: true, description: "Papier glacé 135g. Impression HD pour tes soirées et vernissages." },
  { id: 5, name: "Flyer Promo A4", category: 'flyers', priceStars: 25.00, priceTon: 3.80, priceXof: 15000, emoji: "📰", image: "https://picsum.photos/seed/promo/400/400", sizes: ["A4", "A3"], customizable: true, description: "Impact maximum. Idéal pour affichage sauvage et promo massive." },
  { id: 6, name: "Sticker Holographique", category: 'stickers', priceStars: 4.00, priceTon: 0.60, priceXof: 2500, emoji: "✨", image: "https://picsum.photos/seed/holo/400/400", sizes: ["5x5cm", "8x8cm"], customizable: true, description: "Effet arc-en-ciel qui change selon la lumière. Impossible à rater." },
  { id: 7, name: "Mega Pack Flyers", category: 'flyers', priceStars: 45.00, priceTon: 6.80, priceXof: 28000, emoji: "📦", image: "https://picsum.photos/seed/pack/400/400", sizes: ["A5", "A4", "A3"], customizable: true, description: "500 exemplaires pour inonder la ville. Le meilleur rapport qualité/prix." },
  { id: 8, name: "Sticker Die-Cut", category: 'stickers', priceStars: 5.00, priceTon: 0.75, priceXof: 3000, emoji: "⭐", image: "https://picsum.photos/seed/diecut/400/400", sizes: ["Custom"], customizable: true, description: "Découpé à la forme exacte de ton logo. Finition pro matte ou brillante." },
  { id: 9, name: "Carte de Visite Pro", category: 'business_cards', priceStars: 20.00, priceTon: 3.00, priceXof: 12000, emoji: "📇", image: "https://picsum.photos/seed/card/400/400", sizes: ["Standard", "Carré"], customizable: true, description: "Papier 350g mat ou brillant. Laisse une trace pro partout où tu passes." },
  { id: 10, name: "Carte de Visite Luxe", category: 'business_cards', priceStars: 35.00, priceTon: 5.50, priceXof: 22000, emoji: "💎", image: "https://picsum.photos/seed/luxe/400/400", sizes: ["Standard"], customizable: true, description: "Finitions dorées ou vernis sélectif 3D. Pour ceux qui ne blaguent pas." },
  { id: 11, name: "Retouche Photo Basic", category: 'photo_retouch', priceStars: 5.00, priceTon: 0.80, priceXof: 3000, emoji: "✨", image: "https://picsum.photos/seed/retouch/400/400", sizes: ["1 Photo"], customizable: true, description: "Correction colorimétrique, luminosité et contraste. Rends tes photos pop." },
  { id: 12, name: "Retouche Photo Avancée", category: 'photo_retouch', priceStars: 12.00, priceTon: 1.90, priceXof: 7500, emoji: "🎨", image: "https://picsum.photos/seed/advanced/400/400", sizes: ["1 Photo"], customizable: true, description: "Détourage, suppression d'éléments, effets créatifs. Transforme ta photo en œuvre d'art." },
];

const ORDER_STATUSES: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  pending: { label: "En attente", color: COLORS.tertiary, icon: "⏳" },
  confirmed: { label: "Confirmée", color: "#56FFB2", icon: "✅" },
  production: { label: "Production", color: "#FF8C56", icon: "🔧" },
  shipped: { label: "Expédiée", color: COLORS.cyan, icon: "📦" },
  delivered: { label: "Livrée", color: "#56FF6E", icon: "🎉" },
};

const DEMO_ORDERS: Order[] = [
  {
    id: "ORD-2847",
    date: "14/02 10:30",
    status: 'production',
    totalStars: 12.50,
    totalTon: 0,
    totalXof: 0,
    paymentMethod: 'stars',
    items: [PRODUCTS[0] as unknown as CartItem, PRODUCTS[5] as unknown as CartItem] // Simplified for demo
  },
  {
    id: "ORD-2811",
    date: "10/02 18:45",
    status: 'delivered',
    totalStars: 0,
    totalTon: 2.80,
    totalXof: 0,
    paymentMethod: 'ton',
    items: [PRODUCTS[3] as unknown as CartItem]
  }
];

// --- ICONS (Inline SVG components for zero dependencies) ---

const Icons = {
  Home: ({ active }: { active: boolean }) => {
    const { colors } = useTheme();
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? colors.accent : colors.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    );
  },
  List: ({ active }: { active: boolean }) => {
    const { colors } = useTheme();
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? colors.accent : colors.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 18h.01"/></svg>
    );
  },
  Message: ({ active }: { active: boolean }) => {
    const { colors } = useTheme();
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? colors.accent : colors.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    );
  },
  Settings: ({ active }: { active: boolean }) => {
    const { colors } = useTheme();
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? colors.accent : colors.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    );
  },
  Cart: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
  ),
  ArrowLeft: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
  ),
  Upload: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
  ),
  Minus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
  ),
  Trash: () => (
     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
  ),
  Send: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  ),
  Heart: ({ filled }: { filled: boolean }) => {
    const { colors } = useTheme();
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? colors.accent : "none"} stroke={filled ? colors.accent : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    );
  },
  Sun: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
  ),
  Moon: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  )
};

// --- UTILS ---

const formatPrice = (amount: number, currency: PaymentMethod) => {
  if (currency === 'xof') return amount.toLocaleString('fr-FR');
  return `${amount.toFixed(2)}`;
};

// --- COMPONENTS ---

// 1. GRAIN OVERLAY
const GrainOverlay = () => (
  <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.04]" 
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
    }}
  />
);

// 2. TOAST NOTIFICATION
const Toast = ({ message, show }: { message: string, show: boolean }) => {
  if (!show) return null;
  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[60] animate-bounce-in">
      <div 
        className="px-6 py-3 rounded-full flex items-center justify-center text-sm font-bold shadow-[0_4px_20px_#FF336644]"
        style={{ backgroundColor: COLORS.accent, color: 'white' }}
      >
        {message}
      </div>
    </div>
  );
};

// 3. PRODUCT VIEW COMPONENT
const ProductView = ({ product, onAddToCart, onBack, showToast, isFavorite, toggleFavorite }: { 
  product: Product; 
  onAddToCart: (p: Product, s: string, q: number, f?: string | undefined) => void; 
  onBack: () => void;
  showToast: (msg: string) => void;
  isFavorite: boolean;
  toggleFavorite: () => void;
}) => {
    const { colors } = useTheme();
    const [size, setSize] = useState(product.sizes[0]);
    const [qty, setQty] = useState(1);
    const [uploaded, setUploaded] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => setIsLoading(false), 800);
        return () => clearTimeout(timer);
    }, [product]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset previous state
      setUploaded(null);
      setPreviewUrl(null);

      // Validation: Size (Max 10MB)
      if (file.size > 10 * 1024 * 1024) {
          showToast("Erreur: Fichier > 10MB ⚠️");
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
      }

      // Validation: Type
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
          showToast("Type invalide (PNG, JPG, PDF) ⚠️");
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
      }

      // Success path
      setUploaded(file.name);
      
      if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => {
              setPreviewUrl(reader.result as string);
              showToast("Fichier reçu ! 🎨");
          };
          reader.onerror = () => {
              showToast("Erreur lecture fichier ❌");
              setUploaded(null);
              setPreviewUrl(null);
          };
          reader.readAsDataURL(file);
      } else {
          showToast("Fichier reçu ! 🎨");
      }
    };

    const totalPriceStars = product.priceStars * qty;
    const totalPriceTon = product.priceTon * qty;

    if (isLoading) {
       return (
         <div className="pb-32 animate-fade-in-up max-w-6xl mx-auto px-4 md:px-8 pt-6">
            <div className="grid md:grid-cols-2 gap-8">
                <div className="relative w-full h-64 md:h-[500px] rounded-3xl animate-pulse border" style={{ backgroundColor: colors.card, borderColor: colors.border }}></div>
                
                <div className="space-y-6">
                    <div className="flex gap-2">
                        <div className="h-6 w-20 rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                        <div className="h-6 w-16 rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                    </div>
                    <div className="space-y-2">
                        <div className="h-8 w-3/4 rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                        <div className="h-4 w-full rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                        <div className="h-4 w-5/6 rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                    </div>
                    <div className="space-y-2">
                         <div className="h-4 w-12 rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                         <div className="flex gap-2">
                            <div className="h-10 w-24 rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                            <div className="h-10 w-24 rounded animate-pulse" style={{ backgroundColor: colors.card }}></div>
                         </div>
                    </div>
                    <div className="h-16 w-full rounded-xl animate-pulse mt-8" style={{ backgroundColor: colors.card }}></div>
                </div>
            </div>
        </div>
       );
    }

    return (
      <div className="pb-32 animate-fade-in-up max-w-6xl mx-auto px-4 md:px-8 pt-6">
        <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* HERO / IMAGE */}
            <div className="relative w-full aspect-square md:aspect-auto md:h-[500px] rounded-3xl overflow-hidden border shadow-2xl group"
                 style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <div className="absolute inset-0 flex items-center justify-center text-[120px] drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] animate-float group-hover:scale-110 transition-transform duration-500">
                {product.emoji}
              </div>
              <button
                onClick={toggleFavorite}
                className="absolute top-4 right-4 z-10 p-3 rounded-full backdrop-blur-sm transition-colors hover:bg-black/20"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: isFavorite ? colors.accent : '#fff' }}
              >
                <Icons.Heart filled={isFavorite} />
              </button>
            </div>

            {/* DETAILS */}
            <div className="px-2 py-4 md:py-0">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded"
                      style={{ backgroundColor: colors.card, color: colors.textDim }}>
                  {product.category === 'stickers' ? '🏷️ STICKER' : '📄 FLYER'}
                </span>
                {product.customizable && (
                  <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded border"
                        style={{ backgroundColor: `${colors.secondary}22`, color: colors.secondary, borderColor: `${colors.secondary}44` }}>
                    Custom
                  </span>
                )}
              </div>
              
              <h1 className="text-3xl md:text-4xl font-black uppercase mb-4" style={{ color: colors.text }}>{product.name}</h1>
              <p className="text-sm md:text-base mb-8 leading-relaxed font-bold" style={{ color: colors.textDim }}>
                {product.description}
              </p>

              {/* SIZES */}
              <div className="mb-8">
                <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{ color: colors.textDim }}>Taille</label>
                <div className="flex flex-wrap gap-3">
                  {product.sizes.map(s => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`px-6 py-3 rounded-xl text-sm font-bold border transition-all ${
                        size === s ? 'shadow-lg scale-105' : 'hover:border-opacity-100'
                      }`}
                      style={{ 
                        borderColor: size === s ? colors.accent : colors.border,
                        backgroundColor: size === s ? colors.accent : colors.card,
                        color: size === s ? '#fff' : colors.textDim
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* QUANTITY */}
              <div className="mb-8">
                <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{ color: colors.textDim }}>Quantité</label>
                <div className="flex items-center gap-4 w-fit p-1 rounded-xl border"
                     style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                  <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-12 h-12 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5" style={{ color: colors.text }}><Icons.Minus /></button>
                  <span className="font-mono text-xl w-12 text-center" style={{ color: colors.text }}>{qty}</span>
                  <button onClick={() => setQty(qty + 1)} className="w-12 h-12 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5" style={{ color: colors.text }}><Icons.Plus /></button>
                </div>
              </div>

              {/* UPLOAD */}
              {product.customizable && (
                <div className="mb-8">
                  <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{ color: colors.textDim }}>Design (Fichier)</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group ${
                      uploaded ? '' : 'hover:border-opacity-100'
                    }`}
                    style={{ 
                        borderColor: uploaded ? colors.secondary : colors.border,
                        backgroundColor: uploaded ? `${colors.secondary}11` : colors.card
                    }}
                  >
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/svg+xml, application/pdf" />
                    
                    {previewUrl && (
                        <div className="absolute inset-0 opacity-20 pointer-events-none group-hover:scale-105 transition-transform duration-500">
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover filter blur-[2px]" />
                        </div>
                    )}

                    {uploaded ? (
                      <div className="relative z-10 flex flex-col items-center">
                        {previewUrl && (
                            <div className="w-20 h-20 mb-3 rounded-xl overflow-hidden border shadow-lg" style={{ borderColor: colors.secondary }}>
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                        )}
                        {!previewUrl && <div className="text-2xl mb-2">✅</div>}
                        <span className="text-sm font-bold truncate max-w-[200px]" style={{ color: colors.secondary }}>{uploaded}</span>
                        <span className="text-xs mt-1" style={{ color: colors.textDim }}>Cliquer pour changer</span>
                      </div>
                    ) : (
                      <>
                        <div className="mb-3" style={{ color: colors.accent }}><Icons.Upload /></div>
                        <span className="text-sm font-bold" style={{ color: colors.textDim }}>Glisse ton fichier ici</span>
                        <span className="text-xs mt-1 opacity-50" style={{ color: colors.textDim }}>PNG, JPG, PDF (Max 10MB)</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ACTIONS */}
              <div className="flex items-center justify-between mb-6 p-4 rounded-xl border"
                   style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex flex-col">
                  <span className="font-bold text-2xl" style={{ color: colors.stars }}>{totalPriceStars.toFixed(2)} ⭐</span>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold text-sm" style={{ color: colors.ton }}>{totalPriceTon.toFixed(2)} TON</span>
                    <span className="text-xs opacity-50" style={{ color: colors.textDim }}>|</span>
                    <span className="font-bold text-sm" style={{ color: colors.xof }}>{formatPrice(product.priceXof * qty, 'xof')} XOF</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => {
                  onAddToCart(product, size, qty, uploaded || undefined);
                  onBack();
                }}
                className="w-full py-4 rounded-xl text-white font-black tracking-widest text-lg shadow-lg active:scale-95 transition-transform hover:opacity-90"
                style={{ background: colors.accent }}
              >
                AJOUTER AU PANIER 🛒
              </button>
            </div>
        </div>
      </div>
    );
};

// --- EXTRACTED COMPONENTS ---

const Header = ({ currentView, setCurrentView, cartCount }: { currentView: ViewState, setCurrentView: (v: ViewState) => void, cartCount: number }) => {
  const { theme, toggleTheme, colors } = useTheme();
  const [clickCount, setClickCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogoClick = () => {
    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setCurrentView('admin');
        return 0;
      }
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setClickCount(0), 2000);
      
      return newCount;
    });

    if (currentView !== 'home' && clickCount < 4) {
        setCurrentView('home');
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-16 z-40 flex items-center justify-between px-4 md:px-8 border-b backdrop-blur-md transition-colors duration-300"
         style={{ backgroundColor: colors.overlay, borderColor: colors.border }}>
      <div className="flex items-center gap-3">
        {currentView !== 'home' && (
          <button onClick={() => setCurrentView('home')} style={{ color: colors.text }} className="md:hidden">
            <Icons.ArrowLeft />
          </button>
        )}
        <div className="leading-tight cursor-pointer select-none" onClick={handleLogoClick}>
          <div className="font-black tracking-[2px] text-lg">
            <span style={{ color: colors.accent }}>STICKER</span>
            <span style={{ color: colors.secondary }}>STREET</span>
          </div>
          <div className="text-[10px] tracking-[3px] font-bold" style={{ color: colors.textDim }}>PRINT • STICK • REP</div>
        </div>
      </div>

      {/* Desktop Nav */}
      <div className="hidden md:flex items-center gap-8 absolute left-1/2 transform -translate-x-1/2">
        {[
          { id: 'home', label: 'Shop' },
          { id: 'orders', label: 'Commandes' },
          { id: 'chat', label: 'Chat' },
          // Admin hidden
        ].map((item) => (
             <button 
               key={item.id}
               onClick={() => setCurrentView(item.id as ViewState)}
               className={`text-sm font-bold uppercase tracking-widest transition-colors hover:opacity-80`}
               style={{ color: currentView === item.id ? colors.accent : colors.textDim }}
             >
               {item.label}
             </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={toggleTheme} className="p-2 transition-colors hover:bg-white/5 rounded-full" style={{ color: colors.text }}>
          {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
        </button>
        <button 
          onClick={() => setCurrentView('favorites')}
          className="relative p-2 transition-colors hover:bg-white/5 rounded-full"
          style={{ color: currentView === 'favorites' ? colors.accent : colors.text }}
        >
          <Icons.Heart filled={currentView === 'favorites'} />
        </button>
        <button 
          onClick={() => setCurrentView('cart')}
          className="relative p-2 transition-colors hover:bg-white/5 rounded-full"
          style={{ color: colors.text }}
        >
          <Icons.Cart />
          {cartCount > 0 && (
            <span className="absolute top-1 right-0 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold text-white animate-pulse"
                  style={{ backgroundColor: colors.accent }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

const BottomNav = ({ currentView, setCurrentView }: { currentView: ViewState, setCurrentView: (v: ViewState) => void }) => {
  const { colors } = useTheme();
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 z-40 flex justify-around items-start pt-4 border-t backdrop-blur-md transition-colors duration-300"
         style={{ backgroundColor: colors.overlay, borderColor: colors.border }}>
      <button onClick={() => setCurrentView('home')} className="flex flex-col items-center gap-1" style={{ color: currentView === 'home' ? colors.accent : colors.textDim }}>
        <Icons.Home active={currentView === 'home'} />
        <span className="text-[10px] font-bold uppercase">Shop</span>
      </button>
      <button onClick={() => setCurrentView('orders')} className="flex flex-col items-center gap-1" style={{ color: currentView === 'orders' ? colors.accent : colors.textDim }}>
        <Icons.List active={currentView === 'orders'} />
        <span className="text-[10px] font-bold uppercase">Ordres</span>
      </button>
      <button onClick={() => setCurrentView('chat')} className="flex flex-col items-center gap-1" style={{ color: currentView === 'chat' ? colors.accent : colors.textDim }}>
        <Icons.Message active={currentView === 'chat'} />
        <span className="text-[10px] font-bold uppercase">Chat</span>
      </button>
      {/* Admin hidden for public */}
    </div>
  );
};

const LazyImage = ({ src, alt, fallbackEmoji }: { src?: string, alt: string, fallbackEmoji: string }) => {
  const [loaded, setLoaded] = useState(false);
  
  if (!src) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-[#252525] to-[#111] flex items-center justify-center text-6xl">
        {fallbackEmoji}
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-[#252525]">
      {!loaded && (
         <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-50 animate-pulse">
           {fallbackEmoji}
         </div>
      )}
      <img 
        src={src} 
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

const HomeView = ({ products, filterCategory, setFilterCategory, onProductSelect, favorites, toggleFavorite }: { products: Product[], filterCategory: Category, setFilterCategory: (c: Category) => void, onProductSelect: (p: Product) => void, favorites: number[], toggleFavorite: (id: number) => void }) => {
  const { colors } = useTheme();
  const filteredProducts = products.filter(p => filterCategory === 'all' || p.category === filterCategory);

  return (
    <div className="pb-32 animate-fade-in-up">
      {/* HERO BANNER */}
      <div className="relative w-full h-64 md:h-80 mb-8 overflow-hidden rounded-b-[30px] border-b max-w-7xl mx-auto"
           style={{ borderColor: colors.border }}>
        <div className="absolute inset-0 bg-gradient-to-b" style={{ backgroundImage: `linear-gradient(to bottom, ${colors.bg}, ${colors.card})` }} />
        <div className="absolute top-10 right-[-20px] text-[120px] opacity-10 rotate-12 select-none">🎨</div>
        <div className="absolute bottom-[-10px] left-[-20px] text-[80px] opacity-10 -rotate-12 select-none">🛹</div>
        
        <div className="relative z-10 p-6 md:p-12 flex flex-col justify-end h-full pb-8">
          <span className="inline-block px-3 py-1 mb-2 text-xs font-bold text-black w-fit rounded-full transform -rotate-2 shadow-[0_0_15px_#FFE15666]"
                style={{ backgroundColor: colors.tertiary }}>
            🔥 NOUVEAU DROP
          </span>
          <h1 className="text-3xl md:text-5xl font-black leading-none mb-2 tracking-tighter" style={{ color: colors.text }}>
            TES DESIGNS<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${colors.accent}, ${colors.cyan})` }}>SUR TOUT.</span>
          </h1>
          <p className="text-sm md:text-lg mb-6 font-bold max-w-md" style={{ color: colors.textDim }}>Stickers, flyers, ta créa prend vie ici.</p>
          <button 
            onClick={() => {
              const el = document.getElementById('catalog');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-6 py-2 text-sm font-bold text-white rounded-lg shadow-[0_4px_20px_#FF336644] transition-transform active:scale-95 w-fit"
            style={{ background: colors.accent }}
          >
            VOIR LE CATALOGUE →
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div id="catalog" className="flex justify-center gap-2 mb-8 px-4 flex-wrap">
        {(['all', 'stickers', 'flyers', 'business_cards', 'photo_retouch'] as Category[]).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold uppercase tracking-widest border transition-all whitespace-nowrap`}
            style={{ 
              borderColor: filterCategory === cat ? colors.accent : colors.border,
              backgroundColor: filterCategory === cat ? `${colors.accent}22` : colors.card,
              color: filterCategory === cat ? colors.accent : colors.textDim,
              boxShadow: filterCategory === cat ? `0 0 15px ${colors.accent}33` : 'none'
            }}
          >
            {cat === 'all' ? 'Tout' : cat === 'business_cards' ? 'Cartes' : cat === 'photo_retouch' ? 'Retouche' : cat}
          </button>
        ))}
      </div>

      {/* AD BANNER */}
      <div className="mx-4 md:mx-8 mb-8 rounded-2xl overflow-hidden relative h-32 md:h-40 flex items-center justify-between px-6 md:px-12 border max-w-7xl mx-auto"
           style={{ backgroundColor: colors.card, borderColor: colors.border }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 2px 2px, ${colors.textDim} 1px, transparent 0)`, backgroundSize: '20px 20px' }}></div>
        <div className="relative z-10">
            <span className="text-xs font-bold uppercase tracking-widest mb-1 block" style={{ color: colors.secondary }}>Offre Limitée</span>
            <h2 className="text-xl md:text-3xl font-black italic uppercase" style={{ color: colors.text }}>
                -20% SUR TA <br/> PREMIÈRE COMMANDE
            </h2>
        </div>
        <div className="relative z-10 text-black font-black text-lg md:text-2xl px-4 py-2 transform rotate-3 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
             style={{ backgroundColor: colors.tertiary }}>
            CODE: PROMO20
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 px-4 md:px-8 max-w-7xl mx-auto">
        {filteredProducts.map(product => (
          <div 
            key={product.id}
            onClick={() => onProductSelect(product)}
            className="relative group rounded-2xl border overflow-hidden cursor-pointer transition-colors hover:shadow-xl"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            {/* Image Area */}
            <div className="aspect-square relative overflow-hidden group-hover:scale-105 transition-transform duration-300"
                 style={{ backgroundColor: colors.card }}>
              <LazyImage 
                src={product.image} 
                alt={product.name} 
                fallbackEmoji={product.emoji} 
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(product.id);
                }}
                className="absolute top-2 right-2 z-10 p-2 rounded-full backdrop-blur-sm transition-colors hover:bg-black/20"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: favorites.includes(product.id) ? colors.accent : '#fff' }}
              >
                <Icons.Heart filled={favorites.includes(product.id)} />
              </button>
            </div>
            
            {/* Badges */}
            {product.customizable && (
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold border"
                   style={{ backgroundColor: `${colors.secondary}22`, color: colors.secondary, borderColor: `${colors.secondary}44` }}>
                CUSTOM
              </div>
            )}

            {/* Info */}
            <div className="p-3 md:p-4">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-bold text-xs md:text-sm uppercase leading-tight line-clamp-2" style={{ color: colors.text }}>{product.name}</h3>
              </div>
              <div className="flex items-end justify-between mt-2">
                <div className="flex flex-col">
                  <span className="font-bold text-xs md:text-sm" style={{ color: colors.stars }}>{product.priceStars.toFixed(2)} ⭐</span>
                  <div className="flex gap-1 items-center">
                    <span className="font-bold text-[10px] md:text-xs" style={{ color: colors.ton }}>{product.priceTon.toFixed(2)} 💎</span>
                    <span className="text-[8px] opacity-50" style={{ color: colors.textDim }}>|</span>
                    <span className="font-bold text-[10px] md:text-xs" style={{ color: colors.xof }}>{formatPrice(product.priceXof, 'xof')}</span>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-lg transform group-hover:scale-110 transition-transform"
                     style={{ backgroundColor: colors.accent }}>
                  <Icons.Plus />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FavoritesView = ({ products, favorites, toggleFavorite, onProductSelect, setCurrentView }: { products: Product[], favorites: number[], toggleFavorite: (id: number) => void, onProductSelect: (p: Product) => void, setCurrentView: (v: ViewState) => void }) => {
   const { colors } = useTheme();
   const favProducts = products.filter(p => favorites.includes(p.id));

   return (
     <div className="pb-32 px-4 pt-20 animate-fade-in-up min-h-screen flex flex-col">
       <h1 className="text-2xl font-black uppercase mb-6 flex items-center gap-2" style={{ color: colors.text }}>
         <span>❤️</span> COUPS DE CŒUR
       </h1>
       {favProducts.length === 0 ? (
         <div className="flex flex-col items-center justify-center flex-grow opacity-50 space-y-4">
             <div className="text-6xl grayscale">💔</div>
             <p className="font-bold" style={{ color: colors.text }}>Aucun favori pour le moment</p>
             <button onClick={() => setCurrentView('home')} className="px-6 py-2 rounded-xl border transition-colors text-sm font-bold"
                     style={{ borderColor: colors.border, color: colors.text }}>ALLER AU SHOP</button>
         </div>
       ) : (
         <div className="grid grid-cols-2 gap-4">
           {favProducts.map(product => (
            <div 
                key={product.id}
                onClick={() => onProductSelect(product)}
                className="relative group rounded-2xl border overflow-hidden cursor-pointer transition-colors"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
                {/* Image Area */}
                <div className="aspect-square relative overflow-hidden group-hover:scale-105 transition-transform duration-300"
                     style={{ backgroundColor: colors.card }}>
                    <LazyImage 
                        src={product.image} 
                        alt={product.name} 
                        fallbackEmoji={product.emoji} 
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(product.id);
                        }}
                        className="absolute top-2 right-2 z-10 p-2 rounded-full backdrop-blur-sm transition-colors"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                    >
                        <Icons.Heart filled={true} />
                    </button>
                </div>
                
                {/* Info */}
                <div className="p-3">
                    <h3 className="font-bold text-sm truncate mb-1" style={{ color: colors.text }}>{product.name}</h3>
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col text-xs font-mono">
                            <span style={{ color: colors.stars }}>{product.priceStars.toFixed(2)} ⭐</span>
                            <div className="flex gap-1 items-center">
                                <span style={{ color: colors.ton }}>{product.priceTon.toFixed(2)} 💎</span>
                                <span className="text-[8px] opacity-50" style={{ color: colors.textDim }}>|</span>
                                <span style={{ color: colors.xof }}>{formatPrice(product.priceXof, 'xof')}</span>
                            </div>
                        </div>
                        <button className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-[0_2px_10px_#FF336666] active:scale-90 transition-transform"
                                style={{ backgroundColor: colors.accent }}>
                            <Icons.Plus />
                        </button>
                    </div>
                </div>
            </div>
           ))}
         </div>
       )}
     </div>
   );
};

const CartView = ({ cart, paymentMethod, setPaymentMethod, removeFromCart, updateCartQuantity, createOrder }: { 
    cart: CartItem[], 
    paymentMethod: PaymentMethod, 
    setPaymentMethod: (m: PaymentMethod) => void, 
    removeFromCart: (id: string) => void, 
    updateCartQuantity: (id: string, delta: number) => void,
    createOrder: () => void
}) => {
  const { colors } = useTheme();
  const total = cart.reduce((acc, item) => 
    acc + (paymentMethod === 'stars' ? item.priceStars : paymentMethod === 'ton' ? item.priceTon : item.priceXof) * item.quantity
  , 0);

  return (
    <div className="pb-32 px-4 pt-20 animate-fade-in-up min-h-screen flex flex-col max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-black uppercase mb-6 flex items-center gap-2" style={{ color: colors.text }}>
        <span>🛒</span> TON PANIER
      </h1>

      {cart.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-grow opacity-50">
           <div className="text-6xl mb-4 grayscale">🛒</div>
           <p className="font-bold" style={{ color: colors.text }}>Ton panier est vide</p>
        </div>
      ) : (
        <>
          {/* Currency Toggle */}
          <div className="flex p-1 rounded-lg border mb-6" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
            <button 
              onClick={() => setPaymentMethod('stars')}
              className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all`}
              style={{ 
                backgroundColor: paymentMethod === 'stars' ? colors.stars : 'transparent',
                color: paymentMethod === 'stars' ? '#000' : colors.textDim,
                boxShadow: paymentMethod === 'stars' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              ⭐ Stars
            </button>
            <button 
              onClick={() => setPaymentMethod('ton')}
              className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all`}
              style={{ 
                backgroundColor: paymentMethod === 'ton' ? colors.ton : 'transparent',
                color: paymentMethod === 'ton' ? '#fff' : colors.textDim,
                boxShadow: paymentMethod === 'ton' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              💎 TON
            </button>
            <button 
              onClick={() => setPaymentMethod('xof')}
              className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all`}
              style={{ 
                backgroundColor: paymentMethod === 'xof' ? colors.xof : 'transparent',
                color: paymentMethod === 'xof' ? '#fff' : colors.textDim,
                boxShadow: paymentMethod === 'xof' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              XOF
            </button>
          </div>

          {/* List */}
          <div className="space-y-4 mb-8">
            {cart.map(item => (
              <div key={item.cartId} className="p-4 rounded-xl border flex items-center gap-4 relative overflow-hidden"
                   style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="text-3xl w-12 h-12 rounded-lg flex items-center justify-center border"
                     style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                  {item.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm truncate" style={{ color: colors.text }}>{item.name}</h4>
                  <div className="flex items-center gap-2 text-xs mt-1" style={{ color: colors.textDim }}>
                    <span className="px-1.5 rounded" style={{ backgroundColor: colors.border }}>{item.selectedSize}</span>
                    {item.uploadedFile && <span style={{ color: colors.secondary }}>🎨 Design perso</span>}
                  </div>
                  <div className="mt-2 font-mono text-sm" style={{ color: paymentMethod === 'stars' ? colors.stars : paymentMethod === 'ton' ? colors.ton : colors.xof }}>
                    {formatPrice(paymentMethod === 'stars' ? item.priceStars : paymentMethod === 'ton' ? item.priceTon : item.priceXof, paymentMethod)} {paymentMethod === 'stars' ? '⭐' : paymentMethod === 'ton' ? '💎' : 'XOF'}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => removeFromCart(item.cartId)} className="p-1" style={{ color: colors.accent }}><Icons.Trash /></button>
                  <div className="flex items-center gap-2 rounded-lg p-1 border"
                       style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                    <button onClick={() => updateCartQuantity(item.cartId, -1)} className="w-5 h-5 flex items-center justify-center" style={{ color: colors.text }}><Icons.Minus /></button>
                    <span className="text-xs font-mono w-4 text-center" style={{ color: colors.text }}>{item.quantity}</span>
                    <button onClick={() => updateCartQuantity(item.cartId, 1)} className="w-5 h-5 flex items-center justify-center" style={{ color: colors.text }}><Icons.Plus /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-auto p-6 rounded-2xl border shadow-2xl"
               style={{ backgroundColor: colors.card, borderColor: colors.border }}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold" style={{ color: colors.textDim }}>Total</span>
              <span className="text-2xl font-black font-mono" style={{ color: colors.text }}>
                {formatPrice(total, paymentMethod)} {paymentMethod === 'stars' ? '⭐' : paymentMethod === 'ton' ? '💎' : 'XOF'}
              </span>
            </div>
            <button 
              onClick={createOrder}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.4)] active:scale-95 transition-transform`}
              style={{ 
                background: paymentMethod === 'stars' 
                  ? `linear-gradient(to right, ${colors.stars}, #FFC000)` 
                  : paymentMethod === 'ton' 
                    ? `linear-gradient(to right, ${colors.ton}, #0077CC)`
                    : `linear-gradient(to right, ${colors.xof}, #FF8C00)`,
                color: paymentMethod === 'stars' ? '#000' : '#fff'
              }}
            >
              PAYER EN {paymentMethod === 'stars' ? 'STARS ⭐' : paymentMethod === 'ton' ? 'TON 💎' : 'XOF'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const OrdersView = ({ orders }: { orders: Order[] }) => {
  const { colors } = useTheme();

  return (
    <div className="pb-32 px-4 pt-20 animate-fade-in-up max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-black uppercase mb-6" style={{ color: colors.text }}>📋 Mes Commandes</h1>
      <div className="space-y-4">
        {orders.map(order => {
          const statusConfig = ORDER_STATUSES[order.status];
          const statuses = Object.keys(ORDER_STATUSES) as OrderStatus[];
          const currentStatusIdx = statuses.indexOf(order.status);

          return (
            <div key={order.id} className="rounded-xl border p-5"
                 style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="font-bold text-lg" style={{ color: colors.text }}>{order.id}</div>
                  <div className="text-xs font-mono" style={{ color: colors.textDim }}>{order.date}</div>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 border`}
                  style={{ backgroundColor: `${statusConfig.color}22`, color: statusConfig.color, borderColor: `${statusConfig.color}44` }}
                >
                  {statusConfig.icon} {statusConfig.label}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm" style={{ color: colors.text }}>
                    <span>{item.quantity}x {item.name}</span>
                    <span className="text-xs" style={{ color: colors.textDim }}>{item.selectedSize}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-3 border-t mb-4" style={{ borderColor: colors.border }}>
                <span className="text-xs font-bold" style={{ color: colors.textDim }}>TOTAL</span>
                <span className="font-mono font-bold" style={{ color: colors.text }}>
                  {order.paymentMethod === 'stars' 
                    ? `${order.totalStars.toFixed(2)} ⭐` 
                    : order.paymentMethod === 'ton'
                      ? `${order.totalTon.toFixed(2)} 💎`
                      : `${formatPrice(order.totalXof, 'xof')} XOF`}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="flex gap-1 h-1.5">
                {statuses.map((s, idx) => (
                  <div 
                    key={s} 
                    className={`flex-1 rounded-full transition-colors`}
                    style={{ backgroundColor: idx <= currentStatusIdx ? colors.secondary : colors.border }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ChatView = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, text: "Yo ! 👋 Bienvenue sur StickerStreet. Comment je peux t'aider ?", sender: 'bot', timestamp: '10:00' }
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = {
      id: Date.now(),
      text: input,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    // Bot Auto Reply
    setTimeout(() => {
      const replies = [
        "Je regarde ça tout de suite ! 🔍",
        "Pas de souci, on va trouver ce qu'il te faut 💪",
        "Super choix ! Tu veux qu'on personnalise ?",
        "Je te prépare un devis, 2 secondes ⚡",
        "Tu peux m'envoyer ton design et je te fais un aperçu 🎨"
      ];
      const randomReply = replies[Math.floor(Math.random() * replies.length)];
      const botMsg: ChatMessage = {
        id: Date.now() + 1,
        text: randomReply,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botMsg]);
    }, 1200);
  };

  return (
    <div className="pb-24 pt-16 h-screen flex flex-col bg-[#0D0D0D]">
      <div className="fixed top-0 left-0 right-0 h-16 bg-[#0D0D0D]/90 backdrop-blur border-b border-[#333] z-20 flex items-center px-4 font-bold">
        <div className="w-2 h-2 rounded-full bg-[#56FF6E] mr-2 animate-pulse"/>
        Support StickerStreet
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div 
              className={`max-w-[80%] px-4 py-3 text-sm relative ${
                msg.sender === 'user' 
                  ? 'bg-[#FF336622] border border-[#FF3366] text-white rounded-t-xl rounded-bl-xl' 
                  : 'bg-[#1A1A1A] border border-[#333] text-[#CCC] rounded-t-xl rounded-br-xl'
              }`}
            >
              {msg.text}
            </div>
            <span className="text-[10px] text-[#555] mt-1 font-mono">{msg.timestamp}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="fixed bottom-20 left-0 right-0 p-4 bg-[#0D0D0D] border-t border-[#333] flex gap-2 max-w-[480px] mx-auto">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Écris ton message..."
          className="flex-1 bg-[#1A1A1A] border border-[#333] rounded-full px-4 py-2 text-sm text-white focus:border-[#FF3366] outline-none"
        />
        <button 
          onClick={handleSend}
          className="w-10 h-10 rounded-full bg-[#FF3366] flex items-center justify-center text-white shadow-[0_0_15px_#FF336644] active:scale-90 transition-transform"
        >
          <Icons.Send />
        </button>
      </div>
    </div>
  );
};

const AdminView = ({ orders, setOrders, products, setProducts }: { orders: Order[], setOrders: Dispatch<SetStateAction<Order[]>>, products: Product[], setProducts: Dispatch<SetStateAction<Product[]>> }) => {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'orders' | 'products'>('orders');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    if (editingProduct.id === 0) {
        // New product
        const newId = Math.max(...products.map(p => p.id), 0) + 1;
        setProducts([...products, { ...editingProduct, id: newId }]);
    } else {
        // Update existing
        setProducts(products.map(p => p.id === editingProduct.id ? editingProduct : p));
    }
    setEditingProduct(null);
  };

  const handleDeleteProduct = (id: number) => {
      if (confirm('Supprimer ce produit ?')) {
          setProducts(products.filter(p => p.id !== id));
          setEditingProduct(null);
      }
  };

  const totalRevenueStars = orders.reduce((acc, o) => acc + o.totalStars, 0);
  const totalRevenueTon = orders.reduce((acc, o) => acc + o.totalTon, 0);
  const totalRevenueXof = orders.reduce((acc, o) => acc + (o.totalXof || 0), 0);
  const pendingCount = orders.filter(o => o.status === 'pending').length;

  const changeStatus = (orderId: string, newStatus: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  };

  return (
    <div className="pb-32 px-4 pt-20 animate-fade-in-up max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-black uppercase mb-6 flex items-center gap-2" style={{ color: colors.text }}>
        <span>⚙️</span> DASHBOARD
      </h1>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="p-6 rounded-2xl border shadow-lg transform hover:scale-105 transition-transform" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <div className="text-xs font-bold uppercase mb-2 tracking-wider" style={{ color: colors.textDim }}>Revenus Stars</div>
          <div className="font-mono font-black text-2xl" style={{ color: colors.stars }}>{totalRevenueStars.toFixed(0)} ⭐</div>
        </div>
        <div className="p-6 rounded-2xl border shadow-lg transform hover:scale-105 transition-transform" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <div className="text-xs font-bold uppercase mb-2 tracking-wider" style={{ color: colors.textDim }}>Revenus TON</div>
          <div className="font-mono font-black text-2xl" style={{ color: colors.ton }}>{totalRevenueTon.toFixed(2)} 💎</div>
        </div>
        <div className="p-6 rounded-2xl border shadow-lg transform hover:scale-105 transition-transform" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <div className="text-xs font-bold uppercase mb-2 tracking-wider" style={{ color: colors.textDim }}>Revenus XOF</div>
          <div className="font-mono font-black text-2xl" style={{ color: colors.xof }}>{formatPrice(totalRevenueXof, 'xof')}</div>
        </div>
        <div className="p-6 rounded-2xl border shadow-lg transform hover:scale-105 transition-transform" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <div className="text-xs font-bold uppercase mb-2 tracking-wider" style={{ color: colors.textDim }}>En attente</div>
          <div className="text-3xl font-black" style={{ color: colors.tertiary }}>{pendingCount}</div>
        </div>
        <div className="p-6 rounded-2xl border shadow-lg transform hover:scale-105 transition-transform" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <div className="text-xs font-bold uppercase mb-2 tracking-wider" style={{ color: colors.textDim }}>Total Commandes</div>
          <div className="text-3xl font-black" style={{ color: colors.text }}>{orders.length}</div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b mb-6" style={{ borderColor: colors.border }}>
        <button 
          onClick={() => setTab('orders')} 
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors`}
          style={{ 
            borderColor: tab === 'orders' ? colors.accent : 'transparent',
            color: tab === 'orders' ? colors.accent : colors.textDim
          }}
        >
          COMMANDES
        </button>
        <button 
          onClick={() => setTab('products')} 
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors`}
          style={{ 
            borderColor: tab === 'products' ? colors.accent : 'transparent',
            color: tab === 'products' ? colors.accent : colors.textDim
          }}
        >
          PRODUITS
        </button>
      </div>

      {/* LIST */}
      <div className="space-y-4">
        {tab === 'orders' ? (
          orders.map(order => (
            <div key={order.id} className="p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <div className="flex flex-col md:flex-row justify-between mb-4 gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-black text-lg" style={{ color: colors.text }}>{order.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border`}
                          style={{ 
                            backgroundColor: `${ORDER_STATUSES[order.status].color}22`, 
                            color: ORDER_STATUSES[order.status].color,
                            borderColor: `${ORDER_STATUSES[order.status].color}44`
                          }}>
                      {ORDER_STATUSES[order.status].icon} {ORDER_STATUSES[order.status].label}
                    </span>
                  </div>
                  <span className="font-mono text-xs" style={{ color: colors.textDim }}>{order.date}</span>
                </div>
                <div className="text-right">
                   <div className="font-mono font-bold text-lg" style={{ color: order.paymentMethod === 'stars' ? colors.stars : order.paymentMethod === 'ton' ? colors.ton : colors.xof }}>
                     {order.paymentMethod === 'stars' 
                       ? `${order.totalStars.toFixed(0)} ⭐` 
                       : order.paymentMethod === 'ton'
                         ? `${order.totalTon.toFixed(2)} 💎`
                         : `${formatPrice(order.totalXof, 'xof')} XOF`}
                   </div>
                   <div className="text-xs font-bold uppercase" style={{ color: colors.textDim }}>{order.items.length} articles</div>
                </div>
              </div>

              <div className="space-y-2 mb-4 p-4 rounded-xl" style={{ backgroundColor: colors.bg }}>
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm items-center" style={{ color: colors.text }}>
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{item.emoji}</span>
                        <span className="font-bold">{item.quantity}x {item.name}</span>
                    </div>
                    <span className="text-xs px-2 py-1 rounded border" style={{ color: colors.textDim, borderColor: colors.border }}>{item.selectedSize}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: colors.border }}>
                <span className="text-xs font-bold uppercase mr-2 py-2" style={{ color: colors.textDim }}>Changer statut:</span>
                {(Object.keys(ORDER_STATUSES) as OrderStatus[]).map(s => (
                  <button 
                    key={s}
                    onClick={() => changeStatus(order.id, s)}
                    title={ORDER_STATUSES[s].label}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all ${
                      order.status === s ? 'scale-110 shadow-lg ring-2 ring-offset-2 ring-offset-black' : 'opacity-40 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ 
                      backgroundColor: ORDER_STATUSES[s].color, 
                      borderColor: ORDER_STATUSES[s].color,
                      color: '#000',
                      ringColor: ORDER_STATUSES[s].color
                    }}
                  >
                    {ORDER_STATUSES[s].icon}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <>
            {/* PRODUCT EDIT FORM */}
            {editingProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                    <div className="w-full max-w-lg p-6 rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh]" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h2 className="text-xl font-black uppercase mb-4" style={{ color: colors.text }}>
                            {editingProduct.id === 0 ? 'Nouveau Produit' : 'Modifier Produit'}
                        </h2>
                        <form onSubmit={handleSaveProduct} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.textDim }}>Nom</label>
                                <input 
                                    type="text" 
                                    value={editingProduct.name} 
                                    onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                                    className="w-full p-2 rounded-lg border bg-transparent"
                                    style={{ borderColor: colors.border, color: colors.text }}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.textDim }}>Catégorie</label>
                                    <select 
                                        value={editingProduct.category} 
                                        onChange={e => setEditingProduct({...editingProduct, category: e.target.value as Category})}
                                        className="w-full p-2 rounded-lg border bg-transparent"
                                        style={{ borderColor: colors.border, color: colors.text }}
                                    >
                                        <option value="stickers">Stickers</option>
                                        <option value="flyers">Flyers</option>
                                        <option value="business_cards">Cartes de visite</option>
                                        <option value="photo_retouch">Retouche Photo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.textDim }}>Emoji</label>
                                    <input 
                                        type="text" 
                                        value={editingProduct.emoji} 
                                        onChange={e => setEditingProduct({...editingProduct, emoji: e.target.value})}
                                        className="w-full p-2 rounded-lg border bg-transparent"
                                        style={{ borderColor: colors.border, color: colors.text }}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.stars }}>Prix Stars</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={editingProduct.priceStars} 
                                        onChange={e => setEditingProduct({...editingProduct, priceStars: parseFloat(e.target.value)})}
                                        className="w-full p-2 rounded-lg border bg-transparent"
                                        style={{ borderColor: colors.border, color: colors.text }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.ton }}>Prix TON</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={editingProduct.priceTon} 
                                        onChange={e => setEditingProduct({...editingProduct, priceTon: parseFloat(e.target.value)})}
                                        className="w-full p-2 rounded-lg border bg-transparent"
                                        style={{ borderColor: colors.border, color: colors.text }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.xof }}>Prix XOF</label>
                                    <input 
                                        type="number" step="100"
                                        value={editingProduct.priceXof} 
                                        onChange={e => setEditingProduct({...editingProduct, priceXof: parseFloat(e.target.value)})}
                                        className="w-full p-2 rounded-lg border bg-transparent"
                                        style={{ borderColor: colors.border, color: colors.text }}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.textDim }}>Description</label>
                                <textarea 
                                    value={editingProduct.description} 
                                    onChange={e => setEditingProduct({...editingProduct, description: e.target.value})}
                                    className="w-full p-2 rounded-lg border bg-transparent"
                                    style={{ borderColor: colors.border, color: colors.text }}
                                    rows={3}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: colors.textDim }}>Tailles (séparées par des virgules)</label>
                                <input 
                                    type="text" 
                                    value={editingProduct.sizes.join(', ')} 
                                    onChange={e => setEditingProduct({...editingProduct, sizes: e.target.value.split(',').map(s => s.trim())})}
                                    className="w-full p-2 rounded-lg border bg-transparent"
                                    style={{ borderColor: colors.border, color: colors.text }}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" 
                                    checked={editingProduct.customizable} 
                                    onChange={e => setEditingProduct({...editingProduct, customizable: e.target.checked})}
                                    id="customizable"
                                />
                                <label htmlFor="customizable" className="text-sm font-bold" style={{ color: colors.text }}>Personnalisable (Upload fichier)</label>
                            </div>
                            
                            <div className="flex gap-4 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setEditingProduct(null)}
                                    className="flex-1 py-3 rounded-xl font-bold border"
                                    style={{ borderColor: colors.border, color: colors.textDim }}
                                >
                                    Annuler
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-1 py-3 rounded-xl font-bold text-white shadow-lg"
                                    style={{ backgroundColor: colors.accent }}
                                >
                                    Sauvegarder
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <button 
                onClick={() => setEditingProduct({
                    id: 0,
                    name: '',
                    category: 'stickers',
                    priceStars: 0,
                    priceTon: 0,
                    priceXof: 0,
                    emoji: '🆕',
                    sizes: ['Standard'],
                    customizable: false,
                    description: ''
                })}
                className="w-full py-4 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 mb-4 hover:bg-white/5 transition-colors"
                style={{ borderColor: colors.border, color: colors.textDim }}
            >
                <Icons.Plus />
                <span className="font-bold uppercase">Ajouter un produit</span>
            </button>

            {products.map(product => (
              <div key={product.id} className="p-4 rounded-2xl border flex items-center gap-4 hover:shadow-md transition-shadow" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shadow-inner" style={{ backgroundColor: colors.bg }}>{product.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-sm truncate" style={{ color: colors.text }}>{product.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border" style={{ borderColor: colors.border, color: colors.textDim }}>{product.category}</span>
                  </div>
                  <div className="flex gap-4 text-xs font-mono">
                    <span style={{ color: colors.stars }}>{product.priceStars.toFixed(2)} ⭐</span>
                    <span style={{ color: colors.ton }}>{product.priceTon.toFixed(2)} 💎</span>
                    <span style={{ color: colors.xof }}>{formatPrice(product.priceXof, 'xof')} XOF</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setEditingProduct(product)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors" 
                    style={{ color: colors.textDim }}
                  >
                      <Icons.Settings />
                  </button>
                  <button 
                    onClick={() => handleDeleteProduct(product.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors" 
                    style={{ color: colors.accent }}
                  >
                      <Icons.Trash />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// 4. MAIN APP
export default function StickerShopApp() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>(DEMO_ORDERS);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category>('all');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ton');
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const [favorites, setFavorites] = useState<number[]>([]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const colors = THEMES[theme];

  // Scroll to top on view change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);

  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 2500);
  };

  const toggleFavorite = (productId: number) => {
    setFavorites(prev => {
        const isFav = prev.includes(productId);
        const newFavs = isFav ? prev.filter(id => id !== productId) : [...prev, productId];
        showToast(isFav ? "Retiré des favoris 💔" : "Ajouté aux favoris ❤️");
        return newFavs;
    });
  };

  const addToCart = (product: Product, size: string, quantity: number, uploadedFile?: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.selectedSize === size);
      if (existing) {
        return prev.map(item => 
          item === existing ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prev, { ...product, cartId: Math.random().toString(36), selectedSize: size, quantity, uploadedFile }];
    });
    showToast("Produit ajouté au panier ! 🛒");
    setCurrentView('home'); 
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const updateCartQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const clearCart = () => setCart([]);

  const createOrder = () => {
    if (cart.length === 0) return;
    
    const totalStars = cart.reduce((acc, item) => acc + (item.priceStars * item.quantity), 0);
    const totalTon = cart.reduce((acc, item) => acc + (item.priceTon * item.quantity), 0);
    const totalXof = cart.reduce((acc, item) => acc + (item.priceXof * item.quantity), 0);

    const newOrder: Order = {
      id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      status: 'pending',
      items: [...cart],
      totalStars,
      totalTon,
      totalXof,
      paymentMethod
    };

    setOrders([newOrder, ...orders]);
    clearCart();
    setCurrentView('orders');
    showToast("Commande validée ! 🎉");
  };

  const renderView = () => {
    switch (currentView) {
      case 'home': return <HomeView products={products} filterCategory={filterCategory} setFilterCategory={setFilterCategory} onProductSelect={(p) => { setSelectedProduct(p); setCurrentView('product'); }} favorites={favorites} toggleFavorite={toggleFavorite} />;
      case 'product': 
        return selectedProduct ? (
          <ProductView 
            product={selectedProduct} 
            onAddToCart={addToCart} 
            onBack={() => setCurrentView('home')} 
            showToast={showToast} 
            isFavorite={favorites.includes(selectedProduct.id)}
            toggleFavorite={() => toggleFavorite(selectedProduct.id)}
          />
        ) : null;
      case 'cart': return <CartView cart={cart} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} removeFromCart={removeFromCart} updateCartQuantity={updateCartQuantity} createOrder={createOrder} />;
      case 'orders': return <OrdersView orders={orders} />;
      case 'chat': return <ChatView />;
      case 'admin': return <AdminView orders={orders} setOrders={setOrders} products={products} setProducts={setProducts} />;
      case 'favorites': return <FavoritesView products={products} favorites={favorites} toggleFavorite={toggleFavorite} onProductSelect={(p) => { setSelectedProduct(p); setCurrentView('product'); }} setCurrentView={setCurrentView} />;
      default: return <HomeView products={products} filterCategory={filterCategory} setFilterCategory={setFilterCategory} onProductSelect={(p) => { setSelectedProduct(p); setCurrentView('product'); }} favorites={favorites} toggleFavorite={toggleFavorite} />;
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      <div className="min-h-screen relative overflow-hidden font-mono w-full mx-auto shadow-2xl transition-colors duration-300 flex flex-col"
           style={{ backgroundColor: colors.bg, color: colors.text }}>
        <style>{`
          @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
          .animate-float { animation: float 3s ease-in-out infinite; }
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          .animate-fade-in-up { animation: fadeInUp 0.3s ease-out; }
          @keyframes bounceIn { 0% { opacity: 0; transform: translate(-50%, -20px); } 50% { opacity: 1; transform: translate(-50%, 5px); } 100% { transform: translate(-50%, 0); } }
          .animate-bounce-in { animation: bounceIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        `}</style>
        
        <GrainOverlay />
        <Toast show={toast.show} message={toast.msg} />
        
        <Header currentView={currentView} setCurrentView={setCurrentView} cartCount={cart.length} />
        
        <main className="relative z-10 pt-16 flex-grow w-full">
          {renderView()}
        </main>

        <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
      </div>
    </ThemeContext.Provider>
  );
}