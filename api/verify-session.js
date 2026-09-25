// ══════════════════════════════════════════════════
// SESSION-PRUEFUNG fuer Stripe Managed Payments – v1
// ══════════════════════════════════════════════════
// Ablage im Repository:  api/verify-session.js
// Erreichbar unter:      https://DEINE-DOMAIN.vercel.app/api/verify-session?session_id=...
//
// Nach der Zahlung leitet Stripe den Kunden zurueck zur App, mit der
// Session-ID im Link (siehe SUCCESS_URL in create-checkout-session.js).
// Die App ruft daraufhin diesen Endpunkt auf. Er fragt direkt bei
// Stripe nach, ob diese Session wirklich bezahlt wurde – und erzeugt
// nur in diesem Fall einen Lizenzschluessel.
//
// Der Schluesselalgorithmus ist WORTWOERTLICH aus api/lizenz.js
// uebernommen, damit die App (die denselben Algorithmus offline
// nachrechnet) den Schluessel als gueltig erkennt. Aendert sich einer
// der beiden Werte LIC_SECRET oder LIC_EPOCH, muss das an allen drei
// Stellen (App, lizenz.js, diese Datei) gleichzeitig passieren.

// ── Konfiguration ─────────────────────────────────
// Muss identisch zur App UND zu api/lizenz.js sein:
const LIC_SECRET = 'infl-yager-2026-8fK3qP';
const LIC_PREFIX = 'INF1';
const LIC_EPOCH  = Date.UTC(2020, 0, 1);

// Laufzeit der Lizenz in Tagen (1 Jahr).
const LIC_DAYS = 365;

const STRIPE_API_VERSION = '2025-03-31.basil';

// ── Hilfsfunktionen (identisch zu lizenz.js und zur App) ──
function licHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function licChecksum(expBlock, rndBlock) {
  const raw = LIC_PREFIX + '-' + expBlock + '-' + rndBlock + '-' + LIC_SECRET;
  return licHash(raw).toString(36).toUpperCase().slice(-4).padStart(4, '0');
}

const RND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomBlock() {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += RND_ALPHABET.charAt(Math.floor(Math.random() * RND_ALPHABET.length));
  }
  return out;
}

function makeKey(days) {
  const expDay   = Math.floor((Date.now() - LIC_EPOCH) / 86400000) + days;
  const expBlock = expDay.toString(36).toUpperCase().padStart(4, '0');
  const rndBlock = randomBlock();
  const chkBlock = licChecksum(expBlock, rndBlock);
  return LIC_PREFIX + '-' + expBlock + '-' + rndBlock + '-' + chkBlock;
}

// ── Handler ───────────────────────────────────────
module.exports = async function handler(req, res) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const sessionId = (req.query && req.query.session_id) || '';

  if (!secretKey) {
    res.status(500).json({ status: 'error', message: 'STRIPE_SECRET_KEY fehlt' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ status: 'error', message: 'session_id fehlt' });
    return;
  }

  try {
    // Bei Stripe nachfragen, wie es um diese Session steht.
    const stripeRes = await fetch(
      'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId),
      {
        headers: {
          'Authorization': 'Bearer ' + secretKey,
          'Stripe-Version': STRIPE_API_VERSION
        }
      }
    );

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      res.status(404).json({ status: 'error', message: 'Session nicht gefunden' });
      return;
    }

    if (session.payment_status !== 'paid') {
      // Zahlung noch offen oder fehlgeschlagen – kein Schluessel.
      res.status(200).json({ status: 'pending', message: 'Zahlung noch nicht abgeschlossen' });
      return;
    }

    // Zahlung bestaetigt: Schluessel erzeugen.
    const key = makeKey(LIC_DAYS);

    res.status(200).json({
      status: 'success',
      key: key,
      data: {
        session_id: sessionId,
        email: (session.customer_details && session.customer_details.email) || '',
        valid_days: LIC_DAYS
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Serverfehler', detail: String(err) });
  }
};
