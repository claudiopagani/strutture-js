import { readFile, writeFile } from "node:fs/promises";

const DATABASE_PATH = new URL("../src/data/section_database.json", import.meta.url);
const STEEL_DENSITY = 7850;

const COMMON_SOURCE = Object.freeze({
  catalog_source: "Dlubal cross-section properties portal",
  catalog_source_url: "https://www.dlubal.com/it/proprieta-della-sezione-trasversale/",
  producer: "European standard series",
  property_model: "nominal-dimension geometric calculation",
});

const mm = (value) => value / 1000;

function round(value, significantDigits = 12) {
  return Number.isFinite(value) ? Number(value.toPrecision(significantDigits)) : value;
}

function formatDimension(value) {
  return String(value).replace(/\.0$/, "");
}

function areaMass(areaM2) {
  return areaM2 * STEEL_DENSITY;
}

function baseEntry({
  family,
  shape,
  standard,
  A,
  Av_y,
  Av_z,
  IT,
  Iw = 0,
  Iy,
  Iz,
  Wpl_y,
  Wpl_z,
  WT,
  Ww = 0,
  h,
  b,
  tw,
  tf,
  r = 0,
  perimeter,
}) {
  const I_strong = Math.max(Iy, Iz);
  const I_weak = Math.min(Iy, Iz);
  const Wel_y = Iy / (h / 2);
  const Wel_z = Iz / (b / 2);
  const Wel_strong = Math.max(Wel_y, Wel_z);
  const Wel_weak = Math.min(Wel_y, Wel_z);
  const Wpl_strong = Math.max(Wpl_y, Wpl_z);
  const Wpl_weak = Math.min(Wpl_y, Wpl_z);

  return {
    ...COMMON_SOURCE,
    A: round(A),
    Av_y: round(Av_y),
    Av_z: round(Av_z),
    IT: round(IT),
    I_strong: round(I_strong),
    I_weak: round(I_weak),
    Iw: round(Iw),
    Iy: round(Iy),
    Iz: round(Iz),
    WT: round(WT),
    Wel_strong: round(Wel_strong),
    Wel_weak: round(Wel_weak),
    Wel_y: round(Wel_y),
    Wel_z: round(Wel_z),
    Wpl_strong: round(Wpl_strong),
    Wpl_weak: round(Wpl_weak),
    Wpl_y: round(Wpl_y),
    Wpl_z: round(Wpl_z),
    Ww: round(Ww),
    b: round(b),
    family,
    h: round(h),
    iy: round(Math.sqrt(Iy / A)),
    iz: round(Math.sqrt(Iz / A)),
    mass_per_length: round(areaMass(A), 6),
    perimeter: round(perimeter),
    property_standard: standard,
    r: round(r),
    shape,
    tf: round(tf),
    tw: round(tw),
  };
}

function rectangularTorsionConstant(width, height) {
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const beta = shortSide / longSide;
  return longSide * shortSide ** 3 * (1 / 3 - 0.21 * beta * (1 - beta ** 4 / 12));
}

function hollowRectangularTorsionConstant(width, height, thickness) {
  const medianWidth = width - thickness;
  const medianHeight = height - thickness;
  const enclosedMedianArea = medianWidth * medianHeight;
  const medianPerimeter = 2 * (medianWidth + medianHeight);
  return (4 * enclosedMedianArea ** 2 * thickness) / medianPerimeter;
}

function createCHS(diameterMm, thicknessMm) {
  const D = mm(diameterMm);
  const t = mm(thicknessMm);
  const d = D - 2 * t;
  const A = (Math.PI / 4) * (D ** 2 - d ** 2);
  const I = (Math.PI / 64) * (D ** 4 - d ** 4);
  const Wpl = (D ** 3 - d ** 3) / 6;
  const IT = (Math.PI / 32) * (D ** 4 - d ** 4);

  return [
    `CHS${formatDimension(diameterMm)}X${formatDimension(thicknessMm)}`,
    baseEntry({
      family: "CHS",
      shape: "circular-hollow-section",
      standard: "EN 10210 / EN 10219",
      A,
      Av_y: A / 2,
      Av_z: A / 2,
      IT,
      Iy: I,
      Iz: I,
      Wpl_y: Wpl,
      Wpl_z: Wpl,
      WT: IT / (D / 2),
      h: D,
      b: D,
      tw: t,
      tf: t,
      perimeter: Math.PI * D,
    }),
  ];
}

function createRHS(family, heightMm, widthMm, thicknessMm) {
  const h = mm(heightMm);
  const b = mm(widthMm);
  const t = mm(thicknessMm);
  const innerH = h - 2 * t;
  const innerB = b - 2 * t;
  const A = b * h - innerB * innerH;
  const Iy = (b * h ** 3 - innerB * innerH ** 3) / 12;
  const Iz = (h * b ** 3 - innerH * innerB ** 3) / 12;
  const Wpl_y = (b * h ** 2 - innerB * innerH ** 2) / 4;
  const Wpl_z = (h * b ** 2 - innerH * innerB ** 2) / 4;
  const IT = hollowRectangularTorsionConstant(b, h, t);
  const name =
    family === "SHS"
      ? `SHS${formatDimension(heightMm)}X${formatDimension(widthMm)}X${formatDimension(thicknessMm)}`
      : `RHS${formatDimension(heightMm)}X${formatDimension(widthMm)}X${formatDimension(thicknessMm)}`;

  return [
    name,
    baseEntry({
      family,
      shape: family === "SHS" ? "square-hollow-section" : "rectangular-hollow-section",
      standard: "EN 10210 / EN 10219",
      A,
      Av_y: 2 * t * innerH,
      Av_z: 2 * t * innerB,
      IT,
      Iy,
      Iz,
      Wpl_y,
      Wpl_z,
      WT: IT / (Math.max(h, b) / 2),
      h,
      b,
      tw: t,
      tf: t,
      perimeter: 2 * (h + b),
    }),
  ];
}

function createAngle(family, heightMm, widthMm, thicknessMm) {
  const h = mm(heightMm);
  const b = mm(widthMm);
  const t = mm(thicknessMm);
  const rectangles = [
    { width: t, height: h, z: t / 2, y: h / 2 },
    { width: b, height: t, z: b / 2, y: t / 2 },
    { width: -t, height: t, z: t / 2, y: t / 2 },
  ];
  const A = rectangles.reduce((sum, item) => sum + item.width * item.height, 0);
  const yBar =
    rectangles.reduce((sum, item) => sum + item.width * item.height * item.y, 0) / A;
  const zBar =
    rectangles.reduce((sum, item) => sum + item.width * item.height * item.z, 0) / A;
  const Iy = rectangles.reduce((sum, item) => {
    const area = item.width * item.height;
    return sum + (item.width * item.height ** 3) / 12 + area * (item.y - yBar) ** 2;
  }, 0);
  const Iz = rectangles.reduce((sum, item) => {
    const area = item.width * item.height;
    return sum + (item.height * item.width ** 3) / 12 + area * (item.z - zBar) ** 2;
  }, 0);
  const Wel_y = Iy / Math.max(yBar, h - yBar);
  const Wel_z = Iz / Math.max(zBar, b - zBar);
  const IT = ((h + b - t) * t ** 3) / 3;
  const prefix = family === "L" ? "L" : "LU";
  const name = `${prefix}${formatDimension(heightMm)}X${formatDimension(widthMm)}X${formatDimension(thicknessMm)}`;

  return [
    name,
    {
      ...baseEntry({
        family,
        shape: family === "L" ? "equal-leg-angle" : "unequal-leg-angle",
        standard: "EN 10056",
        A,
        Av_y: t * h,
        Av_z: t * b,
        IT,
        Iy,
        Iz,
        Wpl_y: Wel_y,
        Wpl_z: Wel_z,
        WT: IT / (Math.max(h, b) / 2),
        h,
        b,
        tw: t,
        tf: t,
        perimeter: 2 * (h + b),
      }),
      centroid_y: round(yBar),
      centroid_z: round(zBar),
    },
  ];
}

function createTee(heightMm, widthMm, webThicknessMm, flangeThicknessMm) {
  const h = mm(heightMm);
  const b = mm(widthMm);
  const tw = mm(webThicknessMm);
  const tf = mm(flangeThicknessMm);
  const webH = h - tf;
  const rectangles = [
    { width: b, height: tf, z: b / 2, y: h - tf / 2 },
    { width: tw, height: webH, z: b / 2, y: webH / 2 },
  ];
  const A = rectangles.reduce((sum, item) => sum + item.width * item.height, 0);
  const yBar =
    rectangles.reduce((sum, item) => sum + item.width * item.height * item.y, 0) / A;
  const Iy = rectangles.reduce((sum, item) => {
    const area = item.width * item.height;
    return sum + (item.width * item.height ** 3) / 12 + area * (item.y - yBar) ** 2;
  }, 0);
  const Iz = rectangles.reduce(
    (sum, item) => sum + (item.height * item.width ** 3) / 12,
    0,
  );
  const Wel_y = Iy / Math.max(yBar, h - yBar);
  const Wpl_z = (tf * b ** 2 + webH * tw ** 2) / 4;
  const IT = (webH * tw ** 3 + b * tf ** 3) / 3;
  const name = `T${formatDimension(heightMm)}X${formatDimension(widthMm)}X${formatDimension(webThicknessMm)}`;

  return [
    name,
    {
      ...baseEntry({
        family: "T",
        shape: "tee-section",
        standard: "EN 10055",
        A,
        Av_y: tw * webH,
        Av_z: b * tf,
        IT,
        Iy,
        Iz,
        Wpl_y: Wel_y,
        Wpl_z,
        WT: IT / (Math.max(h, b) / 2),
        h,
        b,
        tw,
        tf,
        perimeter: 2 * (h + b),
      }),
      centroid_y: round(yBar),
      centroid_z: round(b / 2),
    },
  ];
}

function createFlat(widthMm, thicknessMm) {
  const h = mm(widthMm);
  const b = mm(thicknessMm);
  const A = b * h;
  const Iy = (b * h ** 3) / 12;
  const Iz = (h * b ** 3) / 12;
  const Wpl_y = (b * h ** 2) / 4;
  const Wpl_z = (h * b ** 2) / 4;
  const IT = rectangularTorsionConstant(b, h);

  return [
    `FL${formatDimension(widthMm)}X${formatDimension(thicknessMm)}`,
    baseEntry({
      family: "FLAT",
      shape: "flat-bar",
      standard: "EN 10058",
      A,
      Av_y: (5 / 6) * A,
      Av_z: (5 / 6) * A,
      IT,
      Iy,
      Iz,
      Wpl_y,
      Wpl_z,
      WT: IT / (h / 2),
      h,
      b,
      tw: b,
      tf: b,
      perimeter: 2 * (h + b),
    }),
  ];
}

function createRound(diameterMm) {
  const D = mm(diameterMm);
  const A = (Math.PI * D ** 2) / 4;
  const I = (Math.PI * D ** 4) / 64;
  const Wpl = D ** 3 / 6;
  const IT = (Math.PI * D ** 4) / 32;

  return [
    `RD${formatDimension(diameterMm)}`,
    baseEntry({
      family: "ROUND",
      shape: "round-bar",
      standard: "EN 10060",
      A,
      Av_y: (5 / 6) * A,
      Av_z: (5 / 6) * A,
      IT,
      Iy: I,
      Iz: I,
      Wpl_y: Wpl,
      Wpl_z: Wpl,
      WT: IT / (D / 2),
      h: D,
      b: D,
      tw: D,
      tf: D,
      perimeter: Math.PI * D,
    }),
  ];
}

const chsSeries = [
  [21.3, [2, 2.6, 3.2]],
  [26.9, [2, 2.6, 3.2]],
  [33.7, [2.6, 3.2, 4]],
  [42.4, [2.6, 3.2, 4]],
  [48.3, [2.6, 3.2, 4, 5]],
  [60.3, [3.2, 4, 5]],
  [76.1, [3.2, 4, 5, 6.3]],
  [88.9, [3.2, 4, 5, 6.3]],
  [101.6, [4, 5, 6.3]],
  [114.3, [4, 5, 6.3, 8]],
  [139.7, [5, 6.3, 8]],
  [168.3, [5, 6.3, 8, 10]],
  [193.7, [6.3, 8, 10]],
  [219.1, [6.3, 8, 10, 12.5]],
  [244.5, [8, 10, 12.5]],
  [273, [8, 10, 12.5]],
  [323.9, [8, 10, 12.5]],
  [355.6, [10, 12.5, 16]],
  [406.4, [10, 12.5, 16]],
  [457, [12.5, 16]],
  [508, [12.5, 16]],
];

const shsSeries = [
  [20, [2, 2.5]],
  [25, [2, 2.5, 3]],
  [30, [2, 2.5, 3]],
  [35, [2.5, 3]],
  [40, [2, 2.5, 3, 4]],
  [50, [2.5, 3, 4, 5]],
  [60, [3, 4, 5]],
  [70, [3, 4, 5]],
  [80, [3, 4, 5, 6.3]],
  [90, [4, 5, 6.3]],
  [100, [4, 5, 6.3, 8]],
  [120, [5, 6.3, 8]],
  [140, [5, 6.3, 8]],
  [150, [5, 6.3, 8, 10]],
  [160, [5, 6.3, 8, 10]],
  [180, [6.3, 8, 10]],
  [200, [6.3, 8, 10, 12.5]],
  [250, [8, 10, 12.5]],
  [300, [10, 12.5]],
  [350, [12.5, 16]],
  [400, [12.5, 16]],
];

const rhsSeries = [
  [40, 20, [2, 2.5, 3]],
  [50, 30, [2, 2.5, 3]],
  [60, 40, [2.5, 3, 4]],
  [80, 40, [3, 4, 5]],
  [80, 60, [3, 4, 5]],
  [100, 50, [3, 4, 5, 6.3]],
  [100, 60, [3, 4, 5, 6.3]],
  [120, 60, [4, 5, 6.3]],
  [120, 80, [4, 5, 6.3, 8]],
  [140, 80, [4, 5, 6.3, 8]],
  [150, 100, [5, 6.3, 8, 10]],
  [160, 80, [5, 6.3, 8]],
  [180, 100, [5, 6.3, 8, 10]],
  [200, 100, [5, 6.3, 8, 10]],
  [200, 120, [6.3, 8, 10]],
  [250, 150, [6.3, 8, 10, 12.5]],
  [260, 140, [6.3, 8, 10]],
  [300, 150, [8, 10, 12.5]],
  [300, 200, [8, 10, 12.5]],
  [350, 250, [10, 12.5, 16]],
  [400, 200, [10, 12.5, 16]],
  [400, 300, [10, 12.5, 16]],
];

const equalAngles = [
  [20, 3],
  [20, 4],
  [25, 3],
  [25, 4],
  [30, 3],
  [30, 4],
  [35, 3],
  [35, 4],
  [40, 4],
  [40, 5],
  [45, 4],
  [45, 5],
  [50, 5],
  [50, 6],
  [60, 5],
  [60, 6],
  [60, 8],
  [70, 6],
  [70, 7],
  [75, 6],
  [75, 8],
  [80, 8],
  [80, 10],
  [90, 8],
  [90, 10],
  [100, 10],
  [100, 12],
  [120, 10],
  [120, 12],
  [150, 12],
  [150, 15],
  [200, 16],
  [200, 20],
];

const unequalAngles = [
  [30, 20, 3],
  [30, 20, 4],
  [40, 20, 4],
  [40, 25, 4],
  [45, 30, 4],
  [50, 30, 5],
  [60, 40, 5],
  [60, 40, 6],
  [65, 50, 6],
  [70, 50, 6],
  [75, 50, 6],
  [80, 40, 6],
  [80, 60, 7],
  [90, 60, 8],
  [100, 50, 8],
  [100, 65, 8],
  [100, 75, 8],
  [120, 80, 10],
  [130, 65, 10],
  [150, 75, 10],
  [150, 100, 10],
  [180, 90, 12],
  [200, 100, 12],
  [200, 150, 15],
];

const teeSeries = [
  [20, 20, 3, 3],
  [25, 25, 3.5, 3.5],
  [30, 30, 4, 4],
  [35, 35, 4.5, 4.5],
  [40, 40, 5, 5],
  [50, 50, 6, 6],
  [60, 60, 7, 7],
  [70, 70, 8, 8],
  [80, 80, 9, 9],
  [90, 90, 10, 10],
  [100, 100, 11, 11],
  [120, 120, 13, 13],
  [140, 140, 15, 15],
];

const flatSeries = [
  [20, [3, 4, 5, 6]],
  [25, [3, 4, 5, 6, 8]],
  [30, [3, 4, 5, 6, 8, 10]],
  [40, [4, 5, 6, 8, 10, 12]],
  [50, [5, 6, 8, 10, 12, 15]],
  [60, [6, 8, 10, 12, 15, 20]],
  [80, [8, 10, 12, 15, 20]],
  [100, [8, 10, 12, 15, 20, 25]],
  [120, [10, 12, 15, 20, 25, 30]],
  [150, [10, 12, 15, 20, 25, 30]],
  [200, [15, 20, 25, 30, 40]],
];

const roundSeries = [
  6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 36, 40, 45, 50, 55, 60,
  65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200,
];

function collectGeneratedProfiles() {
  const generated = new Map();
  const add = ([name, entry]) => {
    generated.set(name, entry);
  };

  for (const [diameter, thicknesses] of chsSeries) {
    for (const thickness of thicknesses) {
      add(createCHS(diameter, thickness));
    }
  }

  for (const [side, thicknesses] of shsSeries) {
    for (const thickness of thicknesses) {
      add(createRHS("SHS", side, side, thickness));
    }
  }

  for (const [height, width, thicknesses] of rhsSeries) {
    for (const thickness of thicknesses) {
      add(createRHS("RHS", height, width, thickness));
    }
  }

  for (const [side, thickness] of equalAngles) {
    add(createAngle("L", side, side, thickness));
  }

  for (const [height, width, thickness] of unequalAngles) {
    add(createAngle("LU", height, width, thickness));
  }

  for (const dimensions of teeSeries) {
    add(createTee(...dimensions));
  }

  for (const [width, thicknesses] of flatSeries) {
    for (const thickness of thicknesses) {
      add(createFlat(width, thickness));
    }
  }

  for (const diameter of roundSeries) {
    add(createRound(diameter));
  }

  return generated;
}

function sortCatalog(catalog) {
  return Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)));
}

const currentDatabase = JSON.parse(await readFile(DATABASE_PATH, "utf8"));
const generatedProfiles = collectGeneratedProfiles();
const nextDatabase = sortCatalog({
  ...currentDatabase,
  ...Object.fromEntries(generatedProfiles),
});

await writeFile(DATABASE_PATH, `${JSON.stringify(nextDatabase, null, 2)}\n`);

const counts = {};
for (const { family } of generatedProfiles.values()) {
  counts[family] = (counts[family] ?? 0) + 1;
}

console.log(
  `Added or refreshed ${generatedProfiles.size} generated steel profiles: ${JSON.stringify(counts)}`,
);
