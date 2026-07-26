/**
 * Geometry for the Mindscape masthead artwork.
 *
 * The podcast's cover art (`assets/SCM-rectangle-medium-1.jpg`) is a 1024×576
 * bitmap — far too small to stretch across a hero — so the artwork is redrawn
 * as vectors instead: a web of long straight filaments radiating from a handful
 * of off-canvas hubs, with node dots scattered along them.
 *
 * Everything here is pure and seeded, so the server render and the client
 * hydration produce byte-identical markup. Coordinates are in the source
 * bitmap's own 1024×576 space, so measurements taken off the JPEG transfer
 * directly.
 */

export const ART_WIDTH = 1024;
export const ART_HEIGHT = 576;

/** Filaments sharing a stroke style, flattened into one path to keep the DOM small. */
export interface LineLayer {
  d: string;
  color: string;
  opacity: number;
  width: number;
}

export interface Dot {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

export interface Constellation {
  layers: LineLayer[];
  dots: Dot[];
}

/** Sampled from the cover art: filaments read blue up top, aqua toward the base. */
const BLUE = "#cfe4f8";
const TEAL = "#a6ded9";

interface Hub {
  x: number;
  y: number;
  /** Direction the fan opens, in radians (SVG convention — y grows downward). */
  angle: number;
  /** Half-width of the fan, in radians. */
  spread: number;
  rays: number;
  color: string;
  /** The cover art is near-symmetric, so most hubs are drawn twice. */
  mirror: boolean;
}

const HALF_PI = Math.PI / 2;

/** Long enough that every ray leaves the frame from any hub. */
const RAY_LENGTH = 2400;

/** How far outside the frame chord endpoints may sit. */
const MARGIN = 240;

const HUBS: Hub[] = [
  { x: 512, y: -430, angle: HALF_PI, spread: 1.02, rays: 46, color: BLUE, mirror: false },
  { x: 512, y: 1080, angle: -HALF_PI, spread: 1.06, rays: 46, color: TEAL, mirror: false },
  { x: 40, y: -220, angle: 1.16, spread: 0.44, rays: 22, color: BLUE, mirror: true },
  { x: 170, y: 900, angle: -1.02, spread: 0.48, rays: 24, color: TEAL, mirror: true },
  { x: 330, y: -520, angle: HALF_PI, spread: 0.34, rays: 16, color: BLUE, mirror: true },
  { x: -270, y: 300, angle: 0.06, spread: 0.4, rays: 12, color: BLUE, mirror: true }
];

const CHORD_COUNT = 46;
const DOT_COUNT = 150;

/** mulberry32 — small, fast, and stable across engines, which matters here. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

interface Stroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
  width: number;
}

export function buildConstellation(seed = 0x5ea7ca11): Constellation {
  const random = mulberry32(seed);
  const strokes: Stroke[] = [];

  // Quantised so many filaments collapse into a handful of shared-style paths.
  const push = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    strokes.push({
      x1,
      y1,
      x2,
      y2,
      color,
      opacity: Math.round((0.06 + random() * 0.19) / 0.03) * 0.03,
      width: random() < 0.78 ? 0.6 : 1
    });
  };

  for (const hub of HUBS) {
    for (const side of hub.mirror ? [1, -1] : [1]) {
      const originX = side === 1 ? hub.x : ART_WIDTH - hub.x;
      const angle = side === 1 ? hub.angle : Math.PI - hub.angle;
      for (let i = 0; i < hub.rays; i += 1) {
        const t = hub.rays === 1 ? 0.5 : i / (hub.rays - 1);
        const theta = angle + (t - 0.5) * 2 * hub.spread + (random() - 0.5) * 0.05;
        push(
          originX,
          hub.y,
          originX + Math.cos(theta) * RAY_LENGTH,
          hub.y + Math.sin(theta) * RAY_LENGTH,
          hub.color
        );
      }
    }
  }

  // A point on the frame's outer boundary — chords run between two of these,
  // filling in the crossings the radial fans alone don't produce.
  const edgePoint = (): [number, number] => {
    const span = random();
    switch (Math.floor(random() * 4)) {
      case 0:
        return [-MARGIN + span * (ART_WIDTH + MARGIN * 2), -MARGIN];
      case 1:
        return [ART_WIDTH + MARGIN, -MARGIN + span * (ART_HEIGHT + MARGIN * 2)];
      case 2:
        return [-MARGIN + span * (ART_WIDTH + MARGIN * 2), ART_HEIGHT + MARGIN];
      default:
        return [-MARGIN, -MARGIN + span * (ART_HEIGHT + MARGIN * 2)];
    }
  };

  for (let i = 0; i < CHORD_COUNT; i += 1) {
    const [x1, y1] = edgePoint();
    const [x2, y2] = edgePoint();
    push(x1, y1, x2, y2, (y1 + y2) / 2 > ART_HEIGHT ? TEAL : BLUE);
  }

  // Dots read as graph nodes, so most of them are seated on a filament. Rays
  // start off-canvas, so sample along one until a point lands inside the frame.
  const dots: Dot[] = [];
  for (let i = 0; i < DOT_COUNT; i += 1) {
    const bokeh = random() < 0.12;
    let cx = random() * ART_WIDTH;
    let cy = random() * ART_HEIGHT;
    if (!bokeh && random() < 0.7) {
      const stroke = strokes[Math.floor(random() * strokes.length)];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const t = random();
        const x = stroke.x1 + (stroke.x2 - stroke.x1) * t;
        const y = stroke.y1 + (stroke.y2 - stroke.y1) * t;
        if (x >= 0 && x <= ART_WIDTH && y >= 0 && y <= ART_HEIGHT) {
          cx = x;
          cy = y;
          break;
        }
      }
    }
    dots.push({
      cx: round(cx),
      cy: round(cy),
      r: round(bokeh ? 3.5 + random() * 3.5 : 1 + random() * 1.4),
      opacity: Math.round((bokeh ? 0.1 + random() * 0.1 : 0.25 + random() * 0.6) * 100) / 100
    });
  }

  const byStyle = new Map<string, LineLayer>();
  for (const stroke of strokes) {
    const key = `${stroke.color}|${stroke.opacity.toFixed(2)}|${stroke.width}`;
    const layer = byStyle.get(key);
    const segment = `M${round(stroke.x1)} ${round(stroke.y1)}L${round(stroke.x2)} ${round(stroke.y2)}`;
    if (layer) layer.d += segment;
    else
      byStyle.set(key, {
        d: segment,
        color: stroke.color,
        opacity: Number(stroke.opacity.toFixed(2)),
        width: stroke.width
      });
  }

  return {
    layers: [...byStyle.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, l]) => l),
    dots
  };
}
