/* ===== stars.js — Constellation & Star Data ===== */
/* Coordinates in RA (hours, minutes) and Dec (degrees, arcminutes).
   Magnitudes are approximate visual magnitudes.
   Lines connect star indices to form the constellation figure. */

const CONSTELLATIONS = {
  orion: {
    id: 'orion',
    nameEl: 'Ωρίωνας',
    nameLatin: 'Orion',
    stars: [
      { name: 'Betelgeuse',  nameEl: 'Μπετελγκέζ',  ra: [5, 55.2], dec: [7, 24.4],   mag: 0.5  },  // 0
      { name: 'Rigel',       nameEl: 'Ρίγκελ',       ra: [5, 14.5], dec: [-8, -12.1],  mag: 0.1  },  // 1
      { name: 'Bellatrix',   nameEl: 'Μπελλάτριξ',   ra: [5, 25.1], dec: [6, 20.9],    mag: 1.6  },  // 2
      { name: 'Mintaka',     nameEl: 'Μιντάκα',      ra: [5, 32.0], dec: [-0, -17.8],   mag: 2.2  },  // 3
      { name: 'Alnilam',     nameEl: 'Αλνιλάμ',      ra: [5, 36.2], dec: [-1, -12.1],   mag: 1.7  },  // 4
      { name: 'Alnitak',     nameEl: 'Αλνιτάκ',      ra: [5, 40.8], dec: [-1, -56.3],   mag: 1.9  },  // 5
      { name: 'Saiph',       nameEl: 'Σάιφ',         ra: [5, 47.8], dec: [-9, -40.2],   mag: 2.1  },  // 6
    ],
    lines: [
      [0, 2],       // Betelgeuse – Bellatrix (shoulders)
      [0, 5],       // Betelgeuse – Alnitak
      [2, 3],       // Bellatrix – Mintaka
      [3, 4], [4, 5], // Belt
      [5, 6],       // Alnitak – Saiph
      [3, 1],       // Mintaka – Rigel
      [6, 1],       // Saiph – Rigel (via base)
    ],
  },

  ursaMajor: {
    id: 'ursaMajor',
    nameEl: 'Μεγάλη Άρκτος',
    nameLatin: 'Ursa Major',
    stars: [
      { name: 'Dubhe',   nameEl: 'Ντούμπε',   ra: [11, 3.7],  dec: [61, 45.1],  mag: 1.8  },  // 0
      { name: 'Merak',   nameEl: 'Μεράκ',     ra: [11, 1.8],  dec: [56, 22.6],  mag: 2.3  },  // 1
      { name: 'Phecda',  nameEl: 'Φέκντα',    ra: [11, 53.8], dec: [53, 41.7],  mag: 2.4  },  // 2
      { name: 'Megrez',  nameEl: 'Μέγκρεζ',   ra: [12, 15.4], dec: [57, 1.9],   mag: 3.3  },  // 3
      { name: 'Alioth',  nameEl: 'Αλιόθ',     ra: [12, 54.0], dec: [55, 57.6],  mag: 1.8  },  // 4
      { name: 'Mizar',   nameEl: 'Μιζάρ',     ra: [13, 23.9], dec: [54, 55.5],  mag: 2.1  },  // 5
      { name: 'Alkaid',  nameEl: 'Αλκάιντ',   ra: [13, 47.5], dec: [49, 18.8],  mag: 1.9  },  // 6
    ],
    lines: [
      [0, 1], [1, 2], [2, 3], [3, 0], // Bowl
      [3, 4], [4, 5], [5, 6],          // Handle
    ],
  },

  cassiopeia: {
    id: 'cassiopeia',
    nameEl: 'Κασσιόπεια',
    nameLatin: 'Cassiopeia',
    stars: [
      { name: 'Schedar', nameEl: 'Σέδαρ',    ra: [0, 40.5],  dec: [56, 32.2],  mag: 2.2  },  // 0
      { name: 'Caph',    nameEl: 'Καφ',       ra: [0, 9.2],   dec: [59, 8.9],   mag: 2.3  },  // 1
      { name: 'Gamma',   nameEl: 'Γάμμα Κασ', ra: [0, 56.7],  dec: [60, 43.0],  mag: 2.5  },  // 2
      { name: 'Ruchbah', nameEl: 'Ρούτσμπα',  ra: [1, 25.8],  dec: [60, 14.1],  mag: 2.7  },  // 3
      { name: 'Segin',   nameEl: 'Σέγκιν',    ra: [1, 54.4],  dec: [63, 40.3],  mag: 3.4  },  // 4
    ],
    lines: [
      [1, 0], [0, 2], [2, 3], [3, 4], // The W shape
    ],
  },

  scorpius: {
    id: 'scorpius',
    nameEl: 'Σκορπιός',
    nameLatin: 'Scorpius',
    stars: [
      { name: 'Antares',     nameEl: 'Αντάρης',       ra: [16, 29.4], dec: [-26, -25.9], mag: 1.0  },  // 0
      { name: 'Graffias',    nameEl: 'Γκράφιας',      ra: [16, 5.4],  dec: [-19, -48.2], mag: 2.6  },  // 1
      { name: 'Dschubba',    nameEl: 'Τζούμπα',       ra: [16, 0.3],  dec: [-22, -37.3], mag: 2.3  },  // 2
      { name: 'Pi Sco',      nameEl: 'Πι Σκο',        ra: [15, 58.9], dec: [-26, -6.8],  mag: 2.9  },  // 3
      { name: 'Sigma Sco',   nameEl: 'Σίγμα Σκο',     ra: [16, 21.2], dec: [-25, -35.5], mag: 2.9  },  // 4
      { name: 'Tau Sco',     nameEl: 'Ταυ Σκο',       ra: [16, 35.9], dec: [-28, -12.8], mag: 2.8  },  // 5
      { name: 'Epsilon Sco', nameEl: 'Έψιλον Σκο',    ra: [16, 50.2], dec: [-34, -17.6], mag: 2.3  },  // 6
      { name: 'Shaula',      nameEl: 'Σάουλα',        ra: [17, 33.6], dec: [-37, -6.2],  mag: 1.6  },  // 7
      { name: 'Lesath',      nameEl: 'Λέσαθ',         ra: [17, 30.7], dec: [-37, -17.8], mag: 2.7  },  // 8
    ],
    lines: [
      [1, 2], [2, 3], [3, 4], [4, 0], // Head to Antares
      [0, 5], [5, 6], [6, 7],          // Body to tail
      [7, 8],                           // Stinger
    ],
  },

  leo: {
    id: 'leo',
    nameEl: 'Λέων',
    nameLatin: 'Leo',
    stars: [
      { name: 'Regulus',     nameEl: 'Ρέγκουλους',  ra: [10, 8.4],  dec: [11, 58.0],  mag: 1.4  },  // 0
      { name: 'Denebola',    nameEl: 'Ντενέμπολα',  ra: [11, 49.1], dec: [14, 34.3],  mag: 2.1  },  // 1
      { name: 'Algieba',     nameEl: 'Αλγκίεμπα',   ra: [10, 19.9], dec: [19, 50.5],  mag: 2.6  },  // 2
      { name: 'Zosma',       nameEl: 'Ζόσμα',       ra: [11, 14.1], dec: [20, 31.3],  mag: 2.6  },  // 3
      { name: 'Chertan',     nameEl: 'Τσέρταν',     ra: [11, 14.2], dec: [15, 25.7],  mag: 3.3  },  // 4
      { name: 'Eta Leo',     nameEl: 'Ητα Λέο',     ra: [10, 7.2],  dec: [16, 45.8],  mag: 3.5  },  // 5
      { name: 'Adhafera',    nameEl: 'Ανταφέρα',    ra: [10, 16.7], dec: [23, 25.0],  mag: 3.4  },  // 6
      { name: 'Rasalas',     nameEl: 'Ρασάλας',     ra: [10, 7.0],  dec: [26, 0.9],   mag: 3.9  },  // 7
    ],
    lines: [
      [0, 5], [5, 2], [2, 6], [6, 7], // Sickle (head)
      [2, 3], [3, 1],                   // Back
      [0, 4], [4, 1],                   // Belly to tail
    ],
  },

  ursaMinor: {
    id: 'ursaMinor',
    nameEl: 'Μικρή Άρκτος',
    nameLatin: 'Ursa Minor',
    stars: [
      { name: 'Polaris',     nameEl: 'Πολικός',     ra: [2, 31.8],  dec: [89, 15.9],  mag: 2.0 },  // 0 — tip of handle
      { name: 'Kochab',      nameEl: 'Κόχαμπ',      ra: [14, 50.7], dec: [74, 9.2],   mag: 2.1 },  // 1 — bowl (bright)
      { name: 'Pherkad',     nameEl: 'Φέρκαντ',     ra: [15, 20.7], dec: [71, 50.0],  mag: 3.1 },  // 2 — bowl
      { name: 'Eta UMi',     nameEl: 'Ητα ΜΑ',      ra: [16, 17.5], dec: [75, 45.5],  mag: 5.0 },  // 3 — bowl
      { name: 'Zeta UMi',    nameEl: 'Ζήτα ΜΑ',     ra: [15, 44.0], dec: [77, 47.7],  mag: 4.3 },  // 4 — handle/bowl join
      { name: 'Epsilon UMi', nameEl: 'Έψιλον ΜΑ',   ra: [16, 45.9], dec: [82, 2.4],   mag: 4.2 },  // 5 — handle
      { name: 'Delta UMi',   nameEl: 'Δέλτα ΜΑ',    ra: [17, 32.2], dec: [86, 35.3],  mag: 4.4 },  // 6 — handle
    ],
    lines: [
      [0, 6], [6, 5], [5, 4],           // Handle: Polaris → δ → ε → ζ
      [4, 3], [3, 1], [1, 2], [2, 4],   // Bowl: ζ → η → Kochab → Pherkad → ζ
    ],
  },

  camelopardalis: {
    id: 'camelopardalis',
    nameEl: 'Καμηλοπάρδαλη',
    nameLatin: 'Camelopardalis',
    stars: [
      { name: 'CS Cam',    nameEl: 'Κεφαλή',   ra: [3, 29.1],  dec: [59, 56.3],  mag: 4.2 },  // 0 — head
      { name: 'Alpha Cam', nameEl: 'Άλφα',      ra: [4, 54.0],  dec: [66, 20.6],  mag: 4.3 },  // 1 — neck
      { name: 'BE Cam',    nameEl: 'Μέσο',      ra: [4, 33.4],  dec: [65, 52.0],  mag: 4.4 },  // 2 — upper body
      { name: 'Beta Cam',  nameEl: 'Βήτα',      ra: [5, 3.4],   dec: [60, 26.6],  mag: 4.0 },  // 3 — body (brightest)
      { name: '7 Cam',     nameEl: 'Πόδια',     ra: [4, 57.8],  dec: [53, 45.2],  mag: 4.5 },  // 4 — lower body/legs
    ],
    lines: [
      [0, 2], [2, 1], [1, 3], [3, 4],  // Head → upper body → neck → body → legs
    ],
  },

  cygnus: {
    id: 'cygnus',
    nameEl: 'Κύκνος',
    nameLatin: 'Cygnus',
    stars: [
      { name: 'Deneb',       nameEl: 'Ντενέμπ',   ra: [20, 41.4], dec: [45, 16.6],  mag: 1.3 },  // 0 — tail
      { name: 'Sadr',        nameEl: 'Σαντρ',      ra: [20, 22.2], dec: [40, 15.2],  mag: 2.2 },  // 1 — center
      { name: 'Albireo',     nameEl: 'Αλμπιρέο',   ra: [19, 30.7], dec: [27, 57.7],  mag: 3.1 },  // 2 — beak
      { name: 'Delta Cyg',   nameEl: 'Δέλτα',      ra: [19, 44.8], dec: [45, 7.8],   mag: 2.9 },  // 3 — left wing
      { name: 'Epsilon Cyg', nameEl: 'Γκιένα',     ra: [20, 46.2], dec: [33, 58.0],  mag: 2.5 },  // 4 — right wing
    ],
    lines: [
      [0, 1], [1, 2],   // Body shaft (Northern Cross vertical)
      [3, 1], [1, 4],   // Wings / crossbar
    ],
  },

  taurus: {
    id: 'taurus',
    nameEl: 'Ταύρος',
    nameLatin: 'Taurus',
    stars: [
      { name: 'Aldebaran',  nameEl: 'Αλντεμπαράν', ra: [4, 35.9], dec: [16, 30.3],  mag: 0.9 },  // 0 — red eye (brightest)
      { name: 'Epsilon Tau', nameEl: 'Έψιλον',     ra: [4, 28.6], dec: [19, 10.7],  mag: 3.5 },  // 1
      { name: 'Delta Tau',  nameEl: 'Δέλτα',        ra: [4, 22.9], dec: [17, 32.6],  mag: 3.8 },  // 2
      { name: 'Gamma Tau',  nameEl: 'Γάμμα',        ra: [4, 19.8], dec: [15, 37.7],  mag: 3.7 },  // 3 — tip of V
      { name: 'Theta Tau',  nameEl: 'Θήτα',         ra: [4, 28.7], dec: [15, 57.4],  mag: 3.8 },  // 4
      { name: 'Elnath',     nameEl: 'Έλναθ',        ra: [5, 26.3], dec: [28, 36.5],  mag: 1.7 },  // 5 — horn 1
      { name: 'Zeta Tau',   nameEl: 'Ζήτα',         ra: [5, 37.6], dec: [21, 8.5],   mag: 3.0 },  // 6 — horn 2
    ],
    lines: [
      [3, 2], [2, 1], [1, 0],   // Left side of Hyades V (γ → δ → ε → Aldebaran)
      [3, 4], [4, 0],            // Right side of Hyades V
      [1, 5],                    // Horn to Elnath
      [0, 6],                    // Horn to Zeta Tau
    ],
  },

  andromeda: {
    id: 'andromeda',
    nameEl: 'Ανδρομέδα',
    nameLatin: 'Andromeda',
    stars: [
      { name: 'Alpheratz', nameEl: 'Αλφεράτς',  ra: [0, 8.4],   dec: [29, 5.4],   mag: 2.1 },  // 0
      { name: 'Mirach',    nameEl: 'Μίρατς',    ra: [1, 9.7],   dec: [35, 37.2],  mag: 2.1 },  // 1
      { name: 'Almach',    nameEl: 'Αλμάτς',    ra: [2, 3.9],   dec: [42, 19.7],  mag: 2.3 },  // 2
      { name: 'Delta And', nameEl: 'Δέλτα',     ra: [0, 39.3],  dec: [30, 51.7],  mag: 3.3 },  // 3
      { name: 'Mu And',    nameEl: 'Μυ',        ra: [0, 56.8],  dec: [38, 29.9],  mag: 3.9 },  // 4
      { name: 'Zeta And',  nameEl: 'Ζήτα',      ra: [0, 47.4],  dec: [24, 16.1],  mag: 4.1 },  // 5
    ],
    lines: [
      [0, 3], [3, 1], [1, 4], [4, 2],  // Main chain: Alpheratz → δ → Mirach → μ → Almach
      [0, 5],                            // Branch south from Alpheratz
    ],
  },

  hercules: {
    id: 'hercules',
    nameEl: 'Ηρακλής',
    nameLatin: 'Hercules',
    stars: [
      { name: 'Rasalgethi',  nameEl: 'Ρασαλγκέτι',  ra: [17, 14.6], dec: [14, 23.5],  mag: 3.5 },  // 0 — head
      { name: 'Kornephoros', nameEl: 'Κορνεφόρος',  ra: [16, 30.1], dec: [21, 29.4],  mag: 2.8 },  // 1 — bright body star
      { name: 'Delta Her',   nameEl: 'Δέλτα',        ra: [17, 15.0], dec: [24, 50.2],  mag: 3.1 },  // 2 — torso
      { name: 'Epsilon Her', nameEl: 'Έψιλον',       ra: [17, 0.3],  dec: [30, 55.6],  mag: 3.9 },  // 3 — Keystone
      { name: 'Zeta Her',    nameEl: 'Ζήτα',         ra: [16, 41.3], dec: [31, 36.1],  mag: 2.8 },  // 4 — Keystone
      { name: 'Eta Her',     nameEl: 'Ητα',           ra: [16, 42.9], dec: [38, 55.3],  mag: 3.5 },  // 5 — Keystone
      { name: 'Pi Her',      nameEl: 'Πι',            ra: [17, 15.0], dec: [36, 48.8],  mag: 3.2 },  // 6 — Keystone
    ],
    lines: [
      [0, 2], [1, 4],           // Lower limbs connecting to Keystone base
      [2, 3], [2, 4],           // Torso to Keystone base corners
      [3, 4], [4, 5], [5, 6], [6, 3],  // The Keystone quadrilateral
    ],
  },
};

/* Utility: convert RA [h, m] → decimal hours, Dec [d, am] → decimal degrees */
function raToDecimalHours(ra) {
  return ra[0] + ra[1] / 60;
}

function decToDecimalDeg(dec) {
  const sign = dec[0] < 0 || (dec[0] === 0 && dec[1] < 0) ? -1 : 1;
  return sign * (Math.abs(dec[0]) + Math.abs(dec[1]) / 60);
}

/* Pre-compute decimal RA/Dec for each star */
Object.values(CONSTELLATIONS).forEach(c => {
  c.stars.forEach(s => {
    s.raH = raToDecimalHours(s.ra);
    s.decDeg = decToDecimalDeg(s.dec);
  });
  // Compute centroid for constellation label position
  const avgRA = c.stars.reduce((sum, s) => sum + s.raH, 0) / c.stars.length;
  const avgDec = c.stars.reduce((sum, s) => sum + s.decDeg, 0) / c.stars.length;
  c.centroidRA = avgRA;
  c.centroidDec = avgDec;
});

/* List of constellation IDs in display order */
const CONSTELLATION_ORDER = ['orion', 'ursaMajor', 'ursaMinor', 'cassiopeia', 'scorpius', 'leo', 'camelopardalis', 'cygnus', 'taurus', 'andromeda', 'hercules'];
