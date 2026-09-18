// ══════════════════════════════════════════════════
// LIZENZSERVER fuer Digistore24  –  v51 L2
// ══════════════════════════════════════════════════
// Ablage im Repository:  api/lizenz.js
// Erreichbar unter:      https://DEINE-DOMAIN.vercel.app/api/lizenz?s=GEHEIMWORT
//
// Digistore24 ruft diese Adresse bei jedem Kauf per POST auf und erwartet
// als Antwort ein JSON-Objekt mit den Feldern status, key und data.
// Uebergeben werden u.a. order_id, email, product_id, product_name,
// quantity und api_mode ('live' oder 'test').
//
// Der Schluessel wird hier erzeugt und ist danach OHNE Rueckfrage an
// diesen Server pruefbar: die App rechnet dieselbe Pruefsumme nach.
// Deshalb muessen LIC_SECRET und LIC_EPOCH exakt mit den Werten in der
// coaching-app-v51.html uebereinstimmen.
//
// CommonJS (module.exports) ist bewusst gewaehlt: funktioniert auf Vercel
// auch ohne package.json mit "type": "module".

// ── Konfiguration ─────────────────────────────────
// Muss identisch zur App sein:
const LIC_SECRET = 'infl-yager-2026-8fK3qP';
const LIC_PREFIX = 'INF1';
const LIC_EPOCH  = Date.UTC(2020, 0, 1);

// Laufzeit der Lizenz in Tagen (1 Jahr).
const LIC_DAYS = 365;

// Geheimwort in der Aufruf-URL (?s=...). Bevorzugt aus der Vercel-
// Umgebungsvariablen LIZENZ_SECRET, sonst der Wert hier als Rueckfall.
const URL_SECRET = process.env.LIZENZ_SECRET || 'wechselMich';

// ── Hilfsfunktionen (identisch zur App) ───────────
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

// Vier Zufallszeichen aus Base36, ohne leicht verwechselbare Zeichen.
// O/0 und I/1 sind bewusst ausgeschlossen: der Kunde tippt den Schluessel ab.
const RND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomBlock() {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += RND_ALPHABET.charAt(Math.floor(Math.random() * RND_ALPHABET.length));
  }
  return out;
}

// Erzeugt einen vollstaendigen Schluessel: INF1-EXP-RND-CHK
function makeKey(days) {
  const expDay   = Math.floor((Date.now() - LIC_EPOCH) / 86400000) + days;
  const expBlock = expDay.toString(36).toUpperCase().padStart(4, '0');
  const rndBlock = randomBlock();
  const chkBlock = licChecksum(expBlock, rndBlock);
  return LIC_PREFIX + '-' + expBlock + '-' + rndBlock + '-' + chkBlock;
}

// ── Handler ───────────────────────────────────────
module.exports = function handler(req, res) {
  // Geheimwort pruefen. Ohne diese Huerde koennte jeder die Adresse
  // aufrufen und sich selbst einen gueltigen Schluessel erzeugen lassen.
  const given = (req.query && req.query.s) || '';
  if (given !== URL_SECRET) {
    res.status(403).json({ status: 'error', message: 'forbidden' });
    return;
  }

  // Bestelldaten von Digistore24. Bei einem GET-Aufruf (Selbsttest im
  // Browser) sind diese Felder leer – der Schluessel wird trotzdem erzeugt,
  // damit sich die Funktion ohne echte Bestellung pruefen laesst.
  const body     = req.body || {};
  const orderId  = body.order_id  || '';
  const email    = body.email     || '';
  const apiMode  = body.api_mode  || '';

  const key = makeKey(LIC_DAYS);

  // Antwortformat laut Digistore24-Dokumentation: status, key, data.
  // data nimmt beliebige Schluessel-Wert-Paare auf und taucht in der
  // Bestelluebersicht auf – hilfreich fuer die spaetere Zuordnung.
  res.status(200).json({
    status: 'success',
    key: key,
    data: {
      order_id: orderId,
      email: email,
      api_mode: apiMode,
      valid_days: LIC_DAYS
    }
  });
};
