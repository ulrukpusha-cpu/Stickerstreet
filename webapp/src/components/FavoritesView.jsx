import Icon from "./Icon";
import { XOF_FMT } from "../data/constants";

export default function FavoritesView({ products, favorites, toggleFavorite, onProductSelect, go }) {
  const favProducts = products.filter((p) => favorites.includes(p.id));

  if (favProducts.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="heart" size={32} /></div>
        <h3>Pas encore de coup de cœur</h3>
        <p>Touche le cœur sur un produit pour le retrouver ici.</p>
        <button className="btn btn-ink" onClick={() => go("home")}>Parcourir la boutique</button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Favoris <small>{favProducts.length}</small></h1>
      <div className="grid">
        {favProducts.map((p, i) => (
          <article key={p.id} className="p-card" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} onClick={() => onProductSelect(p)}>
            <div className="p-media">
              {p.img ? <img src={p.img} alt="" loading="lazy" /> : <span className="p-emoji">{p.emoji}</span>}
              <button className="p-fav is-on" onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }} aria-label="Retirer des favoris">
                <Icon name="heart" size={17} fill />
              </button>
            </div>
            <div className="p-body">
              <h3 className="p-name">{p.name}</h3>
              <div className="p-price num">{XOF_FMT(p.xof)}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
