/**
 * Retourne le prix (price, ton, xof) pour un produit et une taille donnée.
 * Si pricesBySize existe et contient la taille, utilise ces valeurs. Sinon utilise le prix de base.
 */
export function getPriceForSize(product, size) {
  const pb = product?.pricesBySize;
  if (pb && pb[size]) {
    const s = pb[size];
    return {
      price: Number(s.price ?? product.price),
      ton: Number(s.ton ?? product.ton),
      xof: Number(s.xof ?? product.xof),
    };
  }
  return {
    price: Number(product?.price ?? 0),
    ton: Number(product?.ton ?? 0),
    xof: Number(product?.xof ?? 0),
  };
}
