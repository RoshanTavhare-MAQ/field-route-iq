import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccounts, getProducts, getPromotions } from '../data'
import { priceOrder } from '../pricing/engine'
import { saveOrder } from '../state/orders'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function OrderPage() {
  const navigate = useNavigate()
  const [accountId, setAccountId] = useState('')
  // productId -> qty
  const [cart, setCart] = useState<Record<string, number>>({})

  const products = getProducts()
  const promotions = getPromotions()
  const cartProducts = products.filter((p) => cart[p.id])
  const orderDate = new Date().toISOString().slice(0, 10)

  function setQty(productId: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) {
        delete next[productId]
      } else {
        next[productId] = qty
      }
      return next
    })
  }

  const draftLines = cartProducts.map((p) => ({
    productId: p.id,
    qty: cart[p.id],
  }))

  const pricedOrder = accountId
    ? priceOrder({
        accountId,
        date: orderDate,
        lines: draftLines,
      })
    : {
        lines: cartProducts.map((p) => {
          const qty = cart[p.id]
          const gross = round2(p.unitPrice * qty)
          return {
            productId: p.id,
            qty,
            unitPrice: p.unitPrice,
            gross,
            appliedPromoId: null,
            discount: 0,
            net: gross,
          }
        }),
        orderLevel: { appliedPromoId: null, discount: 0 },
        subtotal: round2(
          cartProducts.reduce((sum, p) => sum + round2(p.unitPrice * cart[p.id]), 0),
        ),
        total: round2(
          cartProducts.reduce((sum, p) => sum + round2(p.unitPrice * cart[p.id]), 0),
        ),
      }

  const lines = pricedOrder.lines
  const subtotal = pricedOrder.subtotal
  const total = pricedOrder.total
  const totalDiscount = round2(
    lines.reduce((sum, line) => sum + line.discount, 0) + pricedOrder.orderLevel.discount,
  )

  function getPromoName(promoId: string | null): string {
    if (!promoId) return '—'
    return promotions.find((promo) => promo.id === promoId)?.name ?? promoId
  }

  function handleSubmit() {
    saveOrder({
      accountId,
      date: orderDate,
      ...pricedOrder,
    })
    navigate('/visits')
  }

  return (
    <div>
      <h1>New Order</h1>

      <label className="field">
        Account
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Select an account…</option>
          {getAccounts().map((a) => (
            <option value={a.id} key={a.id}>
              {a.name} ({a.segment})
            </option>
          ))}
        </select>
      </label>

      <div className="order-layout">
        <section>
          <h2>Catalog</h2>
          <ul className="product-list">
            {products.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name}{' '}
                  <span className="muted">
                    {p.category} · {p.unitPrice.toFixed(2)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setQty(p.id, (cart[p.id] ?? 0) + 1)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Cart</h2>
          {cartProducts.length === 0 ? (
            <p className="muted">Cart is empty. Add products from the catalog.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Promo</th>
                  <th className="num">Gross</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const product = products.find((p) => p.id === line.productId)!
                  return (
                    <tr key={line.productId}>
                      <td>{product.name}</td>
                      <td>
                        <span className="stepper">
                          <button
                            type="button"
                            aria-label={`Decrease ${product.name}`}
                            onClick={() => setQty(line.productId, line.qty - 1)}
                          >
                            −
                          </button>
                          <span>{line.qty}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${product.name}`}
                            onClick={() => setQty(line.productId, line.qty + 1)}
                          >
                            +
                          </button>
                        </span>
                      </td>
                      <td>{getPromoName(line.appliedPromoId)}</td>
                      <td className="num">{line.gross.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <div className="order-summary card">
            <div className="summary-row">
              <span>Subtotal</span>
              <span data-testid="order-subtotal">{subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Discount</span>
              <span data-testid="order-discount">{totalDiscount.toFixed(2)}</span>
            </div>
            <div className="summary-row summary-total">
              <span>Total</span>
              <span data-testid="order-total">{total.toFixed(2)}</span>
            </div>
            <button
              type="button"
              className="primary"
              data-testid="submit-order"
              disabled={lines.length === 0 || accountId === ''}
              onClick={handleSubmit}
            >
              Submit order
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default OrderPage
