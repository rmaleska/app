// ══════════════════════════════════════════════════
// CHECKOUT-SESSION fuer Stripe Managed Payments – v1
// ══════════════════════════════════════════════════
// Ablage im Repository:  api/create-checkout-session.js
// Erreichbar unter:      https://DEINE-DOMAIN.vercel.app/api/create-checkout-session
//
// Der Kauf-Button in der App zeigt einfach auf diese Adresse
// (ganz normaler Link, kein JavaScript noetig). Dieser Endpunkt
// legt bei Stripe eine Checkout-Session an und leitet den Kunden
// per Weiterleitung (302) dorthin weiter.
//
// Nach erfolgreicher Zahlung schickt Stripe den Kunden automatisch
// zurueck zu APP_URL, mit der Session-ID im Link. Die App ruft dann
// api/verify-session.js auf, um den Lizenzschluessel zu bekommen.
//
// Es wird bewusst kein "stripe"-Package aus npm verwendet, sondern
// die Stripe-API direkt per fetch() angesprochen – ein Abhaengigkeit
// weniger, passend zum Rest des Projekts (lizenz.js braucht auch
// keine externen Pakete).

// ── Konfiguration ─────────────────────────────────
// Die Preis-ID aus dem Stripe-Produktkatalog (Reiter "Preisgestaltung").
// LIVE-Wert fuer "Influencial Jahreslizenz DE" (prod_VK5n4xQNvLD1CR).
// Zum Testen voruebergehend auf die Test-ID umstellen und gleichzeitig
// STRIPE_SECRET_KEY in Vercel auf den Test-Schluessel setzen:
//   Test-Preis-ID: price_1UJSbh1zknhYmzrdRRHjTYlz
const PRICE_ID = 'price_1UJRcG1zknhYmzrdp2XK2X33';

// Wohin der Kunde nach Kauf bzw. Abbruch zurueckgeleitet wird.
// {CHECKOUT_SESSION_ID} wird von Stripe automatisch durch die echte
// Session-ID ersetzt.
const APP_URL = 'https://app-eight-eosin-51.vercel.app';
const SUCCESS_URL = APP_URL + '/?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = APP_URL + '/';

// Muss zur API-Version passen, die Managed Payments unterstuetzt.
const STRIPE_API_VERSION = '2025-03-31.basil';

// ── Handler ───────────────────────────────────────
module.exports = async function handler(req, res) {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    res.status(500).json({ status: 'error', message: 'STRIPE_SECRET_KEY fehlt' });
    return;
  }

  // Anfrage an Stripe: neue Checkout-Session anlegen.
  // Stripe erwartet hier klassisch form-urlencoded, kein JSON.
  const params = new URLSearchParams();
  params.append('line_items[0][price]', PRICE_ID);
  params.append('line_items[0][quantity]', '1');
  params.append('mode', 'payment');
  params.append('managed_payments[enabled]', 'true');
  params.append('success_url', SUCCESS_URL);
  params.append('cancel_url', CANCEL_URL);

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION
      },
      body: params.toString()
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok || !session.url) {
      // Stripe hat einen Fehler gemeldet (z.B. falsche Preis-ID).
      res.status(502).json({ status: 'error', message: 'Stripe-Fehler', detail: session });
      return;
    }

    // Weiterleitung zur Stripe-Checkout-Seite.
    res.writeHead(302, { Location: session.url });
    res.end();
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Serverfehler', detail: String(err) });
  }
};
