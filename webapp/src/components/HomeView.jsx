import { useRef } from "react";
import Icon from "./Icon";
import { XOF_FMT } from "../data/constants";

const CATS = [
  { k: "all", l: "Tout" },
  { k: "stickers", l: "Stickers" },
  { k: "flyers", l: "Flyers" },
  { k: "cartes", l: "Cartes de visite" },
  { k: "posters", l: "Posters" },
  { k: "tshirts", l: "T-shirts" },
  { k: "art", l: "Art" },
  { k: "photo", l: "Photo" },
];

function minPrice(p) {
  const prices = Object.values(p.pricesBySize || {}).map((x) => Number(x?.xof)).filter((x) => x > 0);
  return prices.length ? Math.min(...prices) : p.xof;
}

function ProductCard({ p, index, isFav, onOpen, onFav, onAdd }) {
  const from = minPrice(p);
  const hasRange = Object.keys(p.pricesBySize || {}).length > 1;
  return (
    <article className="p-card" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }} onClick={onOpen}>
      <div className="p-media">
        {p.img ? <img src={p.img} alt="" loading="lazy" /> : <span className="p-emoji">{p.emoji}</span>}
        {p.custom && <span className="p-tag">PERSO</span>}
        <button
          className={`p-fav${isFav ? " is-on" : ""}`}
          onClick={(e) => { e.stopPropagation(); onFav(); }}
          aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={isFav}
        >
          <Icon name="heart" size={17} fill={isFav} />
        </button>
      </div>
      <div className="p-body">
        <h3 className="p-name">{p.name}</h3>
        <div className="p-foot">
          <div className="p-price num">
            {hasRange && <small>À partir de</small>}
            {XOF_FMT(from)}
          </div>
          <button className="p-add" onClick={(e) => { e.stopPropagation(); onAdd(); }} aria-label={`Ajouter ${p.name} au panier`}>
            <Icon name="plus" size={18} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </article>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-card" style={{ cursor: "default" }}>
          <div className="p-media skeleton" />
          <div className="p-body">
            <div className="skeleton" style={{ height: 14, borderRadius: 6, width: "80%" }} />
            <div className="skeleton" style={{ height: 18, borderRadius: 6, width: "45%", marginTop: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomeView({ products, banners, filter, setFilter, favorites, toggleFavorite, addCart, openProduct, notify }) {
  const catalogRef = useRef(null);
  const homeBanners = banners.filter((b) => (b.section || "home") === "home" && b.active && b.image);
  const catOrder = (p) => { const i = CATS.findIndex((c) => c.k === p.cat); return i < 0 ? CATS.length : i; };
  const list = products
    ? (filter === "all" ? [...products].sort((a, b) => catOrder(a) - catOrder(b)) : products.filter((p) => p.cat === filter))
    : null;
  const catsWithItems = products ? CATS.filter((c) => c.k === "all" || products.some((p) => p.cat === c.k)) : CATS;

  return (
    <>
      <section className="hero">
        <div className="hero-kicker"><Icon name="sparkle" size={13} fill strokeWidth={0} /> Impression sur mesure</div>
        <h1>Tes designs, <em>imprimés</em> en grand.</h1>
        <p>Stickers, flyers et cartes de visite livrés chez toi.</p>
        <button className="btn" onClick={() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Voir le catalogue <Icon name="arrow" size={17} />
        </button>
        <span className="sticker s1" aria-hidden="true">PRINT</span>
        <span className="sticker s2" aria-hidden="true">STICK</span>
        <span className="sticker s3" aria-hidden="true">REP ★</span>
      </section>

      <div className="trust">
        <div><Icon name="sparkle" size={16} />Vinyle résistant UV</div>
        <div><Icon name="truck" size={16} />Livraison à domicile</div>
        <div><Icon name="phone" size={16} />Wave, Stars, TON</div>
      </div>

      {homeBanners.length > 0 && (
        <div className="banners" aria-label="Promotions">
          {homeBanners.map((b) => (
            <button
              key={b.id}
              onClick={() => { if (b.link) window.open(b.link, "_blank", "noopener,noreferrer"); }}
              style={{ cursor: b.link ? "pointer" : "default" }}
              aria-label={b.title || "Bannière"}
            >
              <img src={b.image} alt={b.title || "Bannière"} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="section-head" ref={catalogRef} style={{ scrollMarginTop: 80 }}>
        <h2>Catalogue</h2>
        {list && <span>{list.length} produit{list.length > 1 ? "s" : ""}</span>}
      </div>

      <div className="chip-row" role="tablist" aria-label="Catégories">
        {catsWithItems.map((c) => (
          <button key={c.k} role="tab" aria-selected={filter === c.k} className={`chip${filter === c.k ? " is-active" : ""}`} onClick={(e) => { setFilter(c.k); e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }}>
            {c.l}
          </button>
        ))}
      </div>

      <div style={{ height: 14 }} />
      {!list ? (
        <SkeletonGrid />
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="image" size={32} /></div>
          <h3>Rien ici pour l'instant</h3>
          <p>Cette catégorie arrive bientôt.</p>
        </div>
      ) : (
        <div className="grid">
          {list.map((p, i) => (
            <ProductCard
              key={p.id}
              p={p}
              index={i}
              isFav={favorites.includes(p.id)}
              onOpen={() => openProduct(p)}
              onFav={() => { toggleFavorite(p.id); notify(favorites.includes(p.id) ? "Retiré des favoris" : "Ajouté aux favoris"); }}
              onAdd={() => addCart(p, p.sizes?.[0] || "")}
            />
          ))}
        </div>
      )}
    </>
  );
}
