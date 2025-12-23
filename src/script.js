import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import './layout_loader.js';

let no_compartments = 5;
let no_persons = 2; // Initialize with the default value from your HTML input

// ============================================================================
// Polygon Bounding Box Class for Non-Rectangular Rooms
// ============================================================================

/**
 * PolygonBoundingBox - A custom bounding structure for polygon-shaped compartments
 * This replaces THREE.Box3 for irregular rooms to provide accurate bounds
 * @class
 */
class PolygonBoundingBox {
    /**
     * Creates a new PolygonBoundingBox.
     * @param {Array<{x: number, y: number}>} outline - An array of 2D points defining the polygon vertices.
     * @throws {Error} If the outline contains fewer than 3 points.
     */
    constructor(outline) {
        if (!Array.isArray(outline) || outline.length < 3) {
            throw new Error('PolygonBoundingBox requires at least 3 points');
        }
        /** @type {Array<{x: number, y: number}>} */
        this.outline = outline.map(p => ({ x: Number(p.x), y: Number(p.y) }));
        this.isPolygonBB = true;
        
        // Compute axis-aligned bounds for quick rejection tests
        const xs = this.outline.map(p => p.x);
        const ys = this.outline.map(p => p.y);
        /** @type {THREE.Vector3} The minimum corner of the AABB. */
        this.min = new THREE.Vector3(Math.min(...xs), Math.min(...ys), 0);
        /** @type {THREE.Vector3} The maximum corner of the AABB. */
        this.max = new THREE.Vector3(Math.max(...xs), Math.max(...ys), 0);
    }
    
    /**
     * Test if a point is contained within the polygon using ray casting
     * @param {THREE.Vector3} point - The point to test (z-coordinate is ignored for 2D check).
     * @returns {boolean} True if the point is strictly inside the polygon.
     */
    containsPoint(point) {
        // Quick AABB rejection test first
        if (point.x < this.min.x || point.x > this.max.x ||
            point.y < this.min.y || point.y > this.max.y) {
            return false;
        }
        // Detailed point-in-polygon test
        return pointInPolygon2D(point.x, point.y, this.outline);
    }
    
    /**
     * Expand the polygon bounds by a scalar value
     * Creates an offset polygon (simplified implementation)
     */
    expandByScalar(offset) {
        if (offset === 0) return this;
        
        // Create a new polygon with expanded AABB bounds
        // For a more accurate implementation, consider implementing polygon offsetting
        const expandedOutline = this.outline.map(p => ({
            x: p.x + (p.x >= 0 ? offset : -offset),
            y: p.y + (p.y >= 0 ? offset : -offset)
        }));
        
        return new PolygonBoundingBox(expandedOutline);
    }
    
    /**
     * Clone the polygon bounding box
     */
    clone() {
        return new PolygonBoundingBox(this.outline);
    }
    
    /**
     * Check intersection with another bounding box (Box3 or PolygonBoundingBox)
     * @param {THREE.Box3|PolygonBoundingBox} other - The other bounding volume to test against.
     * @returns {boolean} True if any overlap exists.
     */
    intersectsBox(other) {
        // Quick AABB test first
        if (this.max.x < other.min.x || this.min.x > other.max.x ||
            this.max.y < other.min.y || this.min.y > other.max.y) {
            return false;
        }
        
        // For detailed intersection, check if any vertex of one polygon is inside the other
        if (other.isPolygonBB) {
            // Check if any vertex of 'other' is inside 'this'
            for (const pt of other.outline) {
                if (this.containsPoint(new THREE.Vector3(pt.x, pt.y, 0))) {
                    return true;
                }
            }
            // Check if any vertex of 'this' is inside 'other'
            for (const pt of this.outline) {
                if (other.containsPoint(new THREE.Vector3(pt.x, pt.y, 0))) {
                    return true;
                }
            }
            return false;
        }
        
        // If 'other' is a Box3, perform a robust polygon↔AABB intersection:
        // 1) any AABB corner inside polygon?
        const corners2D = [
            { x: other.min.x, y: other.min.y },
            { x: other.max.x, y: other.min.y },
            { x: other.max.x, y: other.max.y },
            { x: other.min.x, y: other.max.y }
        ];
        if (corners2D.some(c => this.containsPoint(new THREE.Vector3(c.x, c.y, 0)))) {
            return true;
        }

        // 2) any polygon vertex inside AABB?
        if (this.outline.some(p => pointInAABB2D(p, other))) {
            return true;
        }

        // 3) any edge intersection between polygon edges and AABB edges?
        const boxEdges = [
            [corners2D[0], corners2D[1]],
            [corners2D[1], corners2D[2]],
            [corners2D[2], corners2D[3]],
            [corners2D[3], corners2D[0]]
        ];

        for (let i = 0; i < this.outline.length; i++) {
            const a = this.outline[i];
            const b = this.outline[(i + 1) % this.outline.length];
            for (const [c, d] of boxEdges) {
                if (segIntersect2D(a, b, c, d)) {
                    return true;
                }
            }
        }

        return false;
    }
    
    /**
     * Update the polygon outline (e.g., after dragging)
     */
    setFromOutline(outline) {
        if (!Array.isArray(outline) || outline.length < 3) {
            console.warn('Invalid outline for PolygonBoundingBox.setFromOutline');
            return;
        }
        this.outline = outline.map(p => ({ x: Number(p.x), y: Number(p.y) }));
        
        // Update AABB
        const xs = this.outline.map(p => p.x);
        const ys = this.outline.map(p => p.y);
        this.min.set(Math.min(...xs), Math.min(...ys), 0);
        this.max.set(Math.max(...xs), Math.max(...ys), 0);
    }
}

// ============================================================================
// 2D geometry helpers (for robust PolygonBoundingBox ↔ Box3 intersection)
// ============================================================================

function pointInAABB2D(p, box) {
    return p.x >= box.min.x && p.x <= box.max.x &&
           p.y >= box.min.y && p.y <= box.max.y;
}

function segIntersect2D(a, b, c, d, eps = 1e-9) {
    const cross = (u, v) => u.x * v.y - u.y * v.x;
    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });

    const ab = sub(b, a);
    const ac = sub(c, a);
    const ad = sub(d, a);
    const cd = sub(d, c);
    const ca = sub(a, c);
    const cb = sub(b, c);

    const d1 = cross(ab, ac);
    const d2 = cross(ab, ad);
    const d3 = cross(cd, ca);
    const d4 = cross(cd, cb);

    const onSeg = (p, q, r) =>
        Math.min(p.x, r.x) - eps <= q.x && q.x <= Math.max(p.x, r.x) + eps &&
        Math.min(p.y, r.y) - eps <= q.y && q.y <= Math.max(p.y, r.y) + eps;

    // Proper intersection
    if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
        ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return true;

    // Collinear / touching
    if (Math.abs(d1) <= eps && onSeg(a, c, b)) return true;
    if (Math.abs(d2) <= eps && onSeg(a, d, b)) return true;
    if (Math.abs(d3) <= eps && onSeg(c, a, d)) return true;
    if (Math.abs(d4) <= eps && onSeg(c, b, d)) return true;

    return false;
}


// ============================================================================

let compartments = [], compartmentsBB = [], compartmentsMeshes = [];
let animationId, scene, camera, renderer, deck, deckBB;
let musteringStations = [], musteringStations_inner = [], musteringStationsBB = [];
let persons = [], inMES = [];
let orbitControls, compDragControls, MESdragControls;

let deck_configuration = "simple";
let musteringStationsData = []; // Array of {x, y, length, width, name} for all mustering stations
let deck_length, deck_width;
let deckMinX = 0, deckMaxX = 0, deckMinY = 0, deckMaxY = 0;
let deckCenterX = 0, deckCenterY = 0;
let jsonCoordOffsetX = 0, jsonCoordOffsetY = 0; // JSON local->ship coordinate offset (m)
let originMarkerGroup = null;
let showOriginMarker = true; // set false to disable debug origin marker and camera framing
let deltaT = 0;
const clock = new THREE.Clock();
let time_step = 0;

let deckArrangement = null;
let deckOutline = null;         // optional outline when loaded from JSON
let customInterfaces = [];      // holds parsed interface attributes
let interfaceMeshes = [];       // mesh instances for cleanup
let interfaceCompNames = new Set();
let deckExitCompNames = new Set();      // compartment names that have an interface that connects to 'deck'
let deckExitIfaceByCompName = new Map(); // compName -> interface (deck-connected) for fast lookup
 

// Normalize an outline array (supports [{x,y}] or [[x,y]]). Returns [{x,y}] without a duplicate closing point.
function normalizeOutline(raw) {
    if (!Array.isArray(raw)) return null;
    const pts = raw.map((pt) => {
        if (Array.isArray(pt) && pt.length >= 2) return { x: Number(pt[0]), y: Number(pt[1]) };
        if (pt && typeof pt === 'object' && 'x' in pt && 'y' in pt) return { x: Number(pt.x), y: Number(pt.y) };
        return null;
    }).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));

    if (pts.length < 3) return null;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
        pts.pop();
    }
    return pts;
}

/**
 * Performs the Ray Casting algorithm (Jordan Curve Theorem) to check point-in-polygon status.
 * @param {number} px - The X coordinate of the point.
 * @param {number} py - The Y coordinate of the point.
 * @param {Array<{x: number, y: number}>} poly - The array of polygon vertices.
 * @returns {boolean} True if the point is inside the polygon.
 */
function pointInPolygon2D(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// ============================================================================
// Edge Distance Helpers for Safe Persona Positioning
// ============================================================================

/**
 * Calculates the minimum distance from a point to a line segment.
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number} x1 - Segment start X
 * @param {number} y1 - Segment start Y
 * @param {number} x2 - Segment end X
 * @param {number} y2 - Segment end Y
 * @returns {number} Minimum distance from point to segment
 */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq < 1e-12) {
        return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }
    
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

/**
 * Calculates the minimum distance from a point to any edge of a polygon.
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {Array<{x: number, y: number}>} poly - Polygon vertices
 * @returns {number} Minimum distance to any polygon edge
 */
function pointToPolygonEdgeDistance(px, py, poly) {
    if (!Array.isArray(poly) || poly.length < 3) return Infinity;
    
    let minDist = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const dist = pointToSegmentDistance(
            px, py,
            poly[j].x, poly[j].y,
            poly[i].x, poly[i].y
        );
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

/**
 * Checks if a point is safely inside a polygon with minimum margin from edges.
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {Array<{x: number, y: number}>} poly - Polygon vertices
 * @param {number} minMargin - Minimum required distance from any edge
 * @returns {boolean} True if point is inside AND at least minMargin from all edges
 */
function isPointSafelyInsidePolygon(px, py, poly, minMargin = 0.5) {
    if (!pointInPolygon2D(px, py, poly)) {
        return false;
    }
    const edgeDist = pointToPolygonEdgeDistance(px, py, poly);
    return edgeDist >= minMargin;
}

// For polygon rooms we store an *absolute* outline in userData.outline; when dragged, add mesh.position shift.
function getMeshOutlineGlobal(mesh) {
    const base = mesh?.userData?.outline;
    if (!Array.isArray(base) || base.length < 3) return null;
    const dx = Number(mesh.position?.x || 0);
    const dy = Number(mesh.position?.y || 0);
    return base.map((p) => ({ x: Number(p.x) + dx, y: Number(p.y) + dy }));
}

function isPointInsideCompartmentIndex(position, idx) {
    const mesh = compartmentsMeshes[idx];
    if (!mesh) return false;

    const outline = getMeshOutlineGlobal(mesh);
    if (outline) {
        return pointInPolygon2D(position.x, position.y, outline);
    }

    const bb = compartmentsBB[idx];
    if (!bb) return false;
    const expanded = bb.clone().expandByScalar(1);
    return expanded.containsPoint(position);
}

function getCompartmentIndexAtPoint(position) {
    for (let i = 0; i < compartmentsMeshes.length; i++) {
        if (isPointInsideCompartmentIndex(position, i)) return i;
    }
    return -1;
}

// ============================================================================
// Deck-exit door helpers (prevent "walking through walls" unless near a deck door)
// ============================================================================

function getInterfaceLocalXY(iface) {
    const x = Number(iface?.x ?? 0);
    const y = Number(iface?.y ?? 0);
    if (deck_configuration === 'json') return { x, y };
    return { x: x - deck_length / 2, y: y - deck_width / 2 };
}

function getDeckExitInterfaceForCompIndex(compIndex) {
    const compName = (compIndex >= 0) ? compartmentsMeshes[compIndex]?.name : null;
    if (!compName) return null;
    return deckExitIfaceByCompName.get(compName) || null;
}

function isNearDeckExitDoor(person, compIndex) {
    const iface = getDeckExitInterfaceForCompIndex(compIndex);
    if (!iface) return false;

    const { x: doorX, y: doorY } = getInterfaceLocalXY(iface);
    const dx = person.geometry.position.x - doorX;
    const dy = person.geometry.position.y - doorY;

    // Use interface size if provided; fall back to ~1m door influence radius
    const w = Number(iface?.width ?? iface?.w ?? 1);
    const h = Number(iface?.height ?? iface?.h ?? 1);
    const base = Math.max(w, h, 1);
    const r = Math.max(0.75, 0.75 * base);

    return (dx * dx + dy * dy) <= (r * r);
}


// Normalize a deck outline array (supports [{x,y}] or [[x,y]]).
function parseDeckOutline(deckEntry) {
    deckOutline = null;
    if (!deckEntry) return;
    const raw = deckEntry.outline || deckEntry.attributes?.outline;
    if (!Array.isArray(raw)) return;

    const points = raw.map((pt) => {
        if (Array.isArray(pt) && pt.length >= 2) {
            return { x: Number(pt[0]), y: Number(pt[1]) };
        }
        if (pt && typeof pt === 'object' && 'x' in pt && 'y' in pt) {
            return { x: Number(pt.x), y: Number(pt.y) };
        }
        return null;
    }).filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));

    if (points.length >= 3) {
        // If the outline is already closed (last point == first), drop the duplicate end point.
        const firstPt = points[0];
        const lastPt = points[points.length - 1];
        if (Math.abs(firstPt.x - lastPt.x) < 1e-9 && Math.abs(firstPt.y - lastPt.y) < 1e-9) {
            points.pop();
        }
        deckOutline = points;
    }
}


// ---------------------------------------------------------------------------
// Capture the filename used for Custom Geometry (JSON upload) so we can export it
// together with simulation results.
// layout_loader.js clears the file input value after loading, so store name on change.
// ---------------------------------------------------------------------------
let customGeometryLayoutFileName = null;

function attachGeometryFileNameListener() {
    const input = document.getElementById('geometryFileInput');
    if (!input || input.__shipEvacuationFileNameListenerAttached) return;
    input.__shipEvacuationFileNameListenerAttached = true;

    // Capture phase so we run even if other handlers clear input.value
    input.addEventListener('change', (e) => {
        const file = e && e.target && e.target.files && e.target.files[0];
        if (file && file.name) customGeometryLayoutFileName = file.name;
    }, true);
}

attachGeometryFileNameListener();
window.addEventListener('DOMContentLoaded', attachGeometryFileNameListener, { once: true });


// Layout is loaded from JSON in layout_loader.js; this file listens for the load event.
window.addEventListener('shipEvacuation:geometryLoaded', (event) => {
    const loaded = event?.detail?.deckArrangement;
    if (!loaded) return;
    deckArrangement = loaded;
    deck_configuration = 'json';
    // re-draw with new data
    resetScene();
    const r3 = document.getElementById('radio3');
    if (r3) r3.checked = true;
});


function initializeConfiguration() {
    // Reset outline unless JSON redefines it.
    deckOutline = null;
    deckCenterX = 0; deckCenterY = 0;
    deckMinX = 0; deckMaxX = 0; deckMinY = 0; deckMaxY = 0;
    jsonCoordOffsetX = 0; jsonCoordOffsetY = 0;
    if (deck_configuration === "simple") {
      no_compartments = 5;
      // Single mustering station for simple mode
      musteringStationsData = [{
        x: 105,
        y: 17,
        length: 5,
        width: 10,
        name: 'MusteringStation'
      }];
      deck_length   = 105.2;
      deck_width    = 34;
      deckMinX = -deck_length / 2; deckMaxX = deck_length / 2;
      deckMinY = -deck_width / 2;  deckMaxY = deck_width / 2;
      deckCenterX = 0; deckCenterY = 0;
    }
    else if (deck_configuration === "test6") {
      no_compartments = 1;
      deck_length = 12; deck_width = 12;
      // Single mustering station for test6 mode
      musteringStationsData = [{
        x: 11,
        y: 11,
        length: 2,
        width: 2,
        name: 'MusteringStation'
      }];
      deckMinX = -deck_length / 2; deckMaxX = deck_length / 2;
      deckMinY = -deck_width / 2;  deckMaxY = deck_width / 2;
      deckCenterX = 0; deckCenterY = 0;
    }
    else if (deck_configuration === "json" && deckArrangement) {
        // Reset interface-related state for each new JSON load
        interfaceCompNames.clear();
        deckExitCompNames.clear();
        deckExitIfaceByCompName.clear();
        customInterfaces = [];
        // 1) Read deck size from JSON:
        const deckEntry = deckArrangement.arrangements.deck;
        if (deckEntry && deckEntry.attributes) {
          deck_length = Number(deckEntry.attributes.length);
          deck_width  = Number(deckEntry.attributes.width);
        } else {
          console.warn('JSON missing deck entry; using simple defaults');
          deck_length = 105.2;
          deck_width  = 34;
        }
      
        // 2) Count compartments (exclude MusteringStation if it's in compartments):
        const compartmentKeys = Object.keys(deckArrangement.arrangements.compartments || {});
        no_compartments = compartmentKeys.filter(k => k !== 'MusteringStation').length;
      
        // 3) Mustering station parameters:
        // Check if musteringStations exists as a separate key (new structure)
        musteringStationsData = [];
        
        if (deckArrangement.arrangements.musteringStations && 
            Object.keys(deckArrangement.arrangements.musteringStations).length > 0) {
          // New structure: read all mustering stations from musteringStations
          const musteringStationKeys = Object.keys(deckArrangement.arrangements.musteringStations);
          console.log(`Loading ${musteringStationKeys.length} mustering station(s) from musteringStations`);
          
          musteringStationKeys.forEach(key => {
            const ms = deckArrangement.arrangements.musteringStations[key].attributes;
            musteringStationsData.push({
              x: Number(ms.x),
              y: Number(ms.y),
              length: Number(ms.length),
              width: Number(ms.width),
              name: key
            });
            console.log(`  - ${key}: x=${ms.x}, y=${ms.y}, L=${ms.length}, W=${ms.width}`);
          });
        } else if (deckArrangement.arrangements.compartments?.MusteringStation) {
          // Old structure: read from compartments.MusteringStation for backward compatibility
          const ms = deckArrangement.arrangements.compartments.MusteringStation.attributes;
          musteringStationsData.push({
            x: Number(ms.x),
            y: Number(ms.y),
            length: Number(ms.length),
            width: Number(ms.width),
            name: 'MusteringStation'
          });
          console.log('Using mustering station from compartments (legacy structure)');
        } else {
          console.warn('No mustering station found in JSON; using default values');
          musteringStationsData.push({
            x: 0,
            y: 0,
            length: 5,
            width: 10,
            name: 'MusteringStation_default'
          });
        }
        // Optional complex deck outline (polygon) for JSON decks.
        parseDeckOutline(deckEntry);
        if (deckOutline) {
          const xs = deckOutline.map((p) => p.x);
          const ys = deckOutline.map((p) => p.y);
          deckMinX = Math.min(...xs);
          deckMaxX = Math.max(...xs);
          deckMinY = Math.min(...ys);
          deckMaxY = Math.max(...ys);
          deck_length = deckMaxX - deckMinX;
          deck_width  = deckMaxY - deckMinY;
          deckCenterX = (deckMinX + deckMaxX) / 2;
          deckCenterY = (deckMinY + deckMaxY) / 2;
          // Keep deck outline in ship coordinates (classic ship-design coordinate system).
        } else {
          deckOutline = null;
          deckMinX = Number(deckEntry.attributes.min_x ?? deckEntry.attributes.minX ?? -deck_length / 2);
          deckMaxX = Number(deckEntry.attributes.max_x ?? deckEntry.attributes.maxX ??  deck_length / 2);
          deckMinY = Number(deckEntry.attributes.min_y ?? deckEntry.attributes.minY ?? -deck_width / 2);
          deckMaxY = Number(deckEntry.attributes.max_y ?? deckEntry.attributes.maxY ??  deck_width / 2);
          deckCenterX = (deckMinX + deckMaxX) / 2;
          deckCenterY = (deckMinY + deckMaxY) / 2;
        }
        // If JSON provides min_x/min_y but the outline (or other geometry) is in local coordinates,
        // shift everything into the classic ship-design coordinate system.
        const attrMinX = Number(deckEntry.attributes.min_x ?? deckEntry.attributes.minX ?? deckMinX);
        const attrMinY = Number(deckEntry.attributes.min_y ?? deckEntry.attributes.minY ?? deckMinY);
        jsonCoordOffsetX = attrMinX - deckMinX;
        jsonCoordOffsetY = attrMinY - deckMinY;
        const _coordTol = 1e-6;
        if (Math.abs(jsonCoordOffsetX) > _coordTol || Math.abs(jsonCoordOffsetY) > _coordTol) {
          // Shift deck outline (if present)
          if (deckOutline && deckOutline.length >= 3) {
            deckOutline = deckOutline.map(p => ({ x: Number(p.x) + jsonCoordOffsetX, y: Number(p.y) + jsonCoordOffsetY }));
          }
          // Shift derived deck bounds/center
          deckMinX += jsonCoordOffsetX; deckMaxX += jsonCoordOffsetX;
          deckMinY += jsonCoordOffsetY; deckMaxY += jsonCoordOffsetY;
          deckCenterX += jsonCoordOffsetX; deckCenterY += jsonCoordOffsetY;
          // Shift mustering station positions (they were read before the outline)
          if (Array.isArray(musteringStationsData)) {
            musteringStationsData = musteringStationsData.map(ms => ({
              ...ms,
              x: Number(ms.x) + jsonCoordOffsetX,
              y: Number(ms.y) + jsonCoordOffsetY
            }));
          }
        }

        // 4) Interface definitions (if any):
        const ifaceDefs = deckArrangement.arrangements.interfaces;
        if (ifaceDefs && Object.keys(ifaceDefs).length > 0) {
              // Convert each into a flat attributes object
              // Convert each into a flat attributes object (and apply JSON min_x/min_y offset if needed)
              customInterfaces = Object.keys(ifaceDefs).map(name => {
                const attrs = ifaceDefs[name]?.attributes || {};
                return {
                  name,
                  ...attrs,
                  x: Number(attrs.x ?? 0) + jsonCoordOffsetX,
                  y: Number(attrs.y ?? 0) + jsonCoordOffsetY
                };
              });
              console.warn("Custom geometry JSON contains interface definitions.");
              // Gather all compartment names mentioned in any interface
              // NOTE: interfaceCompNames includes *all* compartments connected by any interface.
              // deckExitCompNames / deckExitIfaceByCompName track ONLY compartments that have an interface to 'deck'.
              customInterfaces.forEach(iface => {
                if (!Array.isArray(iface.connects)) return;

                // populate the GLOBAL set instead of a local one:
                iface.connects.filter(n => n !== 'deck')
                  .forEach(n => interfaceCompNames.add(n));

                // record ONLY deck-connected exits for spawn / wall-crossing logic
                if (iface.connects.includes('deck')) {
                  iface.connects.filter(n => n !== 'deck').forEach(n => {
                    deckExitCompNames.add(n);
                    // if multiple doors exist, keep the first one (or overwrite — either is acceptable)
                    if (!deckExitIfaceByCompName.has(n)) deckExitIfaceByCompName.set(n, iface);
                  });
                }
              });
            } else {
              console.warn("Custom geometry JSON contains no interface definitions.");
              customInterfaces = [];
            }
      }
    
  }

function adjustCameraPosition() {
    // Update deck bounding box based on the current deck geometry
    deckBB = new THREE.Box3().setFromObject(deck);
    // If enabled, include world origin in framing so the marker cannot be off-screen.
    if (showOriginMarker) {
        deckBB.expandByPoint(new THREE.Vector3(0, 0, 0));
    }
    const deckSize = new THREE.Vector3();
    deckBB.getSize(deckSize);
    const maxDeckSize = Math.max(deckSize.x, deckSize.y);
    // Compute the ideal distance so the deck exactly fills the view:
    const requiredZ = (maxDeckSize / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Increase the distance so the deck occupies only about 60% of the view:
    const deckCenter = deckBB ? deckBB.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
    camera.position.x = deckCenter.x;
    camera.position.y = deckCenter.y;
    camera.position.z = requiredZ / 1.7;
    camera.lookAt(deckCenter);
    if (orbitControls) {
        orbitControls.target.copy(deckCenter);
        // sync immediately even when not animating
        orbitControls.update();
    }
    // Ensure the far plane is large enough even if geometry is accidentally in mm
    camera.far = Math.max(1000, requiredZ * 5);
    camera.updateProjectionMatrix();
}

function createScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 60;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(0.88 * window.innerWidth, 0.88 * window.innerHeight);

    const movementDiv = document.querySelector("#movment3D");
    if (movementDiv) movementDiv.innerHTML = "";
    document.querySelector("#movment3D").appendChild(renderer.domElement);

    scene.background = new THREE.Color(0xffffff);
}

/**
 * Draw a visible origin marker at world (0,0,0) for debugging:
 * - 10 m XYZ axes (AxesHelper)
 * - yellow sphere at the origin
 * Drawn "on top" (depthTest disabled) so it remains visible.
 */
function drawOriginMarker() {
    if (!showOriginMarker || !scene) return;

    // Remove previous marker if any
    if (originMarkerGroup) {
        scene.remove(originMarkerGroup);
        originMarkerGroup.traverse((obj) => {
            if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
                else obj.material.dispose?.();
            }
        });
        originMarkerGroup = null;
    }

    const g = new THREE.Group();
    g.name = 'OriginMarker';

    const axes = new THREE.AxesHelper(10);
    axes.renderOrder = 9999;
    // Ensure axes draw on top of deck/rooms
    if (axes.material) {
        if (Array.isArray(axes.material)) axes.material.forEach((m) => { m.depthTest = false; m.depthWrite = false; });
        else { axes.material.depthTest = false; axes.material.depthWrite = false; }
    }
    g.add(axes);

    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false })
    );
    sphere.renderOrder = 10000;
    sphere.position.set(0, 0, 0.5); // lift slightly above deck surface
    g.add(sphere);

    originMarkerGroup = g;
    scene.add(originMarkerGroup);
}


function disposeMeshes(meshes) {
    if (!Array.isArray(meshes)) return;

    const visit = (item) => {
        if (!item) return;
        if (Array.isArray(item)) {
            item.forEach(visit);
            return;
        }

        // Only attempt to remove/dispose THREE objects
        if (scene && typeof scene.remove === 'function') {
            scene.remove(item);
        }
        if (item.geometry && typeof item.geometry.dispose === 'function') {
            item.geometry.dispose();
        }
        if (item.material) {
            if (Array.isArray(item.material)) {
                item.material.forEach((mat) => mat && mat.dispose && mat.dispose());
            } else if (item.material.dispose) {
                item.material.dispose();
            }
        }
    };

    meshes.forEach(visit);
}

function createDeck() {
    const deckColor = (deck_configuration === 'json' && deckArrangement?.arrangements?.deck?.attributes?.color)
        ? deckArrangement.arrangements.deck.attributes.color
        : 'lightblue';
    // For JSON-uploaded decks, draw the provided polygon outline; fallback to box for other modes.
    if (deck_configuration === 'json' && deckOutline && deckOutline.length >= 3) {
        const shape = new THREE.Shape();
        const first = deckOutline[0];
        shape.moveTo(first.x, first.y);
        for (let i = 1; i < deckOutline.length; i++) {
            const pt = deckOutline[i];
            shape.lineTo(pt.x, pt.y);
        }
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.02,
            bevelEnabled: false
        });
        deck = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({ color: deckColor, side: THREE.DoubleSide })
        );
        deck.position.z = 0;
        deckBB = new THREE.Box3().setFromObject(deck);
    // If enabled, include world origin in framing so the marker cannot be off-screen.
    if (showOriginMarker) {
        deckBB.expandByPoint(new THREE.Vector3(0, 0, 0));
    }
        scene.add(deck);
    } else {
        deck = new THREE.Mesh(
            new THREE.BoxGeometry(deck_length, deck_width, 0.02),
            new THREE.MeshBasicMaterial({ color: deckColor, side: THREE.DoubleSide })
        );
        deck.position.z = 0;
        deckBB = new THREE.Box3().setFromObject(deck);
    // If enabled, include world origin in framing so the marker cannot be off-screen.
    if (showOriginMarker) {
        deckBB.expandByPoint(new THREE.Vector3(0, 0, 0));
    }
        scene.add(deck);
    }
}

function getCompartmentConfiguration(config) {
  if (config==="simple") {
    return {
      comp_x:      [-30, -15, 20, 20, -5],
      comp_y:      [ -5,   6, -5,  9, -11],
      compy_angle: [  0,   0,  0, 90,   90],
      comp_length: [ 10,  10, 10, 10,   10],
      comp_width:  [ 20,  20, 20, 20,   20],
      comp_height: [  2,   2,  2,  2,    2]
    };
  }
  else if (config==="test6") {
    return {
      comp_x:      [-1],
      comp_y:      [ 1],
      compy_angle: [ 0],
      comp_length: [10],
      comp_width:  [10],
      comp_height: [ 2]
    };
  }
  else if (config === "json" && deckArrangement) {
    const comps = deckArrangement.arrangements.compartments;
    const keys  = Object.keys(comps)
                     .filter(k => k !== 'MusteringStation');
  
    return {
      comp_x:      keys.map(k => Number(comps[k].attributes.x)),
      comp_y:      keys.map(k => Number(comps[k].attributes.y)),
      compy_angle: keys.map(k => Number(comps[k].attributes.rotation) || 0),
      comp_length: keys.map(k => Number(comps[k].attributes.length)),
      comp_width:  keys.map(k => Number(comps[k].attributes.width)),
      comp_height: keys.map(k => Number(comps[k].attributes.height)),
      comp_color:  keys.map(k => comps[k].attributes.color || 'yellow')
    };
  }
  // fallback to simple
  return getCompartmentConfiguration("simple");
}

function createCompartments() {
    compartments = [];
    compartmentsBB = [];
    compartmentsMeshes = [];

    // JSON mode: build each room as either a Box (rectangle) or an extruded polygon
    if (deck_configuration === 'json' && deckArrangement?.arrangements?.compartments) {
        const comps = deckArrangement.arrangements.compartments;
        const keys = Object.keys(comps).filter(k => k !== 'MusteringStation');
        no_compartments = keys.length;

        keys.forEach((name) => {
            const attrs = comps[name]?.attributes || {};
            const color = attrs.color || 'yellow';
            const height = Number(attrs.height ?? 2);
            const zCenter = Number(attrs.z ?? 1);
            const rotDeg = Number(attrs.rotation ?? 0);
            const shapeType = String(attrs.shape || '').toLowerCase();
            const outline0 = normalizeOutline(attrs.outline);
            const outline = (outline0 && outline0.length >= 3)
              ? outline0.map(p => ({ x: Number(p.x) + jsonCoordOffsetX, y: Number(p.y) + jsonCoordOffsetY }))
              : null;

            let mesh;

            if (outline && (shapeType === 'polygon' || shapeType === '')) {
                // Polygon footprint in absolute deck coordinates.
                const shape = new THREE.Shape();
                shape.moveTo(outline[0].x, outline[0].y);
                for (let i = 1; i < outline.length; i++) {
                    shape.lineTo(outline[i].x, outline[i].y);
                }
                shape.closePath();

                const geom = new THREE.ExtrudeGeometry(shape, {
                    depth: height,
                    bevelEnabled: false
                });

                mesh = new THREE.Mesh(
                    geom,
                    new THREE.MeshBasicMaterial({
                        color: color,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide
                    })
                );

                // ExtrudeGeometry spans z=[0..height], so shift to match zCenter as the mesh center.
                mesh.position.set(0, 0, zCenter - height / 2);

                // Store absolute outline for plotting + point-in-room tests
                mesh.userData.outline = outline;
                mesh.userData.shape = 'polygon';
                mesh.userData.zCenter = zCenter;
                mesh.userData.height = height;

                // IMPORTANT: do NOT apply attrs.rotation here; the polygon is already in global coordinates.
            } else {
                // Rectangle (default)
                const L = Number(attrs.length ?? 1);
                const W = Number(attrs.width ?? 1);

                mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(L, W, height),
                    new THREE.MeshBasicMaterial({
                        color: color,
                        transparent: true,
                        opacity: 0.3
                    })
                );
                mesh.position.set(Number(attrs.x ?? 0) + jsonCoordOffsetX, Number(attrs.y ?? 0) + jsonCoordOffsetY, zCenter);
                mesh.rotation.z = (Math.PI * rotDeg) / 180.0;
                mesh.userData.shape = 'rectangle';
                mesh.userData.zCenter = zCenter;
                mesh.userData.height = height;
            }

            mesh.name = name;
            scene.add(mesh);
            compartmentsMeshes.push(mesh);
            
            // Use PolygonBoundingBox for polygon rooms, THREE.Box3 for rectangular rooms
            if (outline && (shapeType === 'polygon' || shapeType === '')) {
                compartmentsBB.push(new PolygonBoundingBox(outline));
            } else {
                compartmentsBB.push(new THREE.Box3().setFromObject(mesh));
            }
        });

        return;
    }

    // Non-JSON modes: keep the legacy box-based compartments
    const config = getCompartmentConfiguration(deck_configuration);
    for (let i = 0; i < no_compartments; i++) {
        const color = config.comp_color && config.comp_color[i] ? config.comp_color[i] : 'yellow';

        const compartment = new THREE.Mesh(
            new THREE.BoxGeometry(config.comp_length[i], config.comp_width[i], config.comp_height[i]),
            new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.3
            })
        );
        compartment.position.set(config.comp_x[i], config.comp_y[i], 1);
        compartment.rotation.z = (Math.PI * config.compy_angle[i]) / 180.0;
        compartment.userData.shape = 'rectangle';
        compartment.userData.zCenter = 1;
        compartment.userData.height = Number(config.comp_height[i] ?? 2);

        scene.add(compartment);
        compartmentsMeshes.push(compartment);
        compartmentsBB.push(new THREE.Box3().setFromObject(compartment));
    }
}

function addMusteringStation() {
    const offsetX = deck_configuration === 'json' ? 0 : deck_length / 2;
    const offsetY = deck_configuration === 'json' ? 0 : deck_width / 2;
    
    // Clear existing mustering stations
    musteringStations.forEach(mesh => scene.remove(mesh));
    musteringStations_inner.forEach(mesh => scene.remove(mesh));
    musteringStations = [];
    musteringStations_inner = [];
    musteringStationsBB = [];
    
    // Create mesh for each mustering station
    musteringStationsData.forEach((msData, index) => {
        // Outer mesh (semi-transparent)
        const mustering = new THREE.Mesh(
            new THREE.BoxGeometry(msData.length, msData.width, 2.5),
            new THREE.MeshBasicMaterial({ color: 'red', opacity: 0.5, transparent: true })
        );
        mustering.position.set(
            msData.x - offsetX,
            msData.y - offsetY,
            0
        );
        mustering.name = msData.name;
        
        // Inner mesh (for collision detection)
        const mustering_inner = new THREE.Mesh(
            new THREE.BoxGeometry(msData.length - 1, msData.width - 1, 2.5),
            new THREE.MeshBasicMaterial({ color: 'red', opacity: 0.5, transparent: true })
        );
        mustering_inner.position.copy(mustering.position);
        mustering_inner.name = msData.name + '_inner';
        
        // Bounding box
        const musteringBB = new THREE.Box3().setFromObject(mustering_inner);
        
        // Store in arrays
        musteringStations.push(mustering);
        musteringStations_inner.push(mustering_inner);
        musteringStationsBB.push(musteringBB);
        
        // Add to scene
        scene.add(mustering);
        
        console.log(`Created mustering station ${index}: ${msData.name} at (${msData.x}, ${msData.y})`);
    });
    
    console.log(`Total ${musteringStations.length} mustering station(s) created`);
}

/**
 * Create a thin box for each interface in customInterfaces,
 * add it to the scene and record it for later cleanup.
 */
function createInterfaces() {
    // first, remove any old interface meshes
    disposeMeshes(interfaceMeshes);
    interfaceMeshes = [];
    const offsetX = deck_configuration === 'json' ? 0 : deck_length / 2;
    const offsetY = deck_configuration === 'json' ? 0 : deck_width / 2;
  
    customInterfaces.forEach(iface => {
      const { x, y, z, width, height, thickness = 0.1, type } = iface;
      const geom = new THREE.BoxGeometry(width, height, thickness);
      const mat  = new THREE.MeshBasicMaterial({
        color: type === 'door' ? 'saddlebrown' : 'gray',
        transparent: true,
        opacity: 0.6
      });
      const mesh = new THREE.Mesh(geom, mat);
      // JSON coords are absolute; shift so deck is centered at (0,0)
      mesh.position.set(
        x - offsetX,
        y - offsetY,
        z + thickness/2
      );
      scene.add(mesh);
      interfaceMeshes.push(mesh);
    });
  }

function disposePersons() {
    if (persons && persons.length > 0) {
        persons.forEach(person => {
            if (person.geometry) {
                scene.remove(person.geometry);
                // Dispose geometry and material if needed:
                if (person.geometry.geometry) {
                    person.geometry.geometry.dispose();
                }
                if (person.geometry.material) {
                    if (Array.isArray(person.geometry.material)) {
                        person.geometry.material.forEach(mat => mat.dispose());
                    } else {
                        person.geometry.material.dispose();
                    }
                }
            }
        });
        persons = [];
    }
}



// Set up OrbitControls for scene rotation.
function setupOrbitControls() {
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.1;
  const tgt = deckBB ? deckBB.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
  orbitControls.target.copy(tgt);
  // Default mode: rotation enabled.
  orbitControls.enabled = true;
  return orbitControls;
}

// Set up DragControls for moving compartments and the mustering station.
function setupDragControls() {
    if (compDragControls) compDragControls.dispose();
    if (MESdragControls) MESdragControls.dispose();

    compDragControls = new DragControls(compartmentsMeshes, camera, renderer.domElement);
    // While dragging, keep each compartment at its intended z centre.
    compDragControls.addEventListener('drag', (event) => {
        const obj = event.object;
        const zc = Number(obj?.userData?.zCenter ?? 1);
        const h  = Number(obj?.userData?.height ?? 0);
        if (obj?.userData?.shape === 'polygon') obj.position.z = zc - h / 2;
        else obj.position.z = zc;
    });
    compDragControls.addEventListener('dragend', () => {
        compartmentsMeshes.forEach((mesh, i) => {
            const bb = compartmentsBB[i];
            
            if (bb && bb.isPolygonBB) {
                // For polygon rooms, update the outline with the new position
                const outline = getMeshOutlineGlobal(mesh);
                if (outline) {
                    bb.setFromOutline(outline);
                }
            } else if (bb) {
                bb.setFromObject(mesh);
            }
        });
        cancelAnimationFrame(animationId);
        disposePersons();
        createPersons(no_persons);
        renderer.render(scene, camera);
        document.getElementById("startSim").disabled = false;
    });

    MESdragControls = new DragControls(musteringStations, camera, renderer.domElement);
    // While dragging, force the mustering station to remain at z = 0.
    MESdragControls.addEventListener('drag', (event) => {
        event.object.position.z = 0;
        // Find the index of the dragged mustering station and update its inner mesh
        const index = musteringStations.indexOf(event.object);
        if (index !== -1 && musteringStations_inner[index]) {
            musteringStations_inner[index].position.copy(event.object.position);
        }
    });
    MESdragControls.addEventListener('dragend', (event) => {
        // Find the index of the dragged mustering station
        const index = musteringStations.indexOf(event.object);
        if (index !== -1) {
            musteringStations_inner[index].position.copy(event.object.position);
            musteringStationsBB[index].setFromObject(musteringStations_inner[index]);
        }
        cancelAnimationFrame(animationId);
        disposePersons();
        createPersons(no_persons);
        renderer.render(scene, camera);
        document.getElementById("startSim").disabled = false;
    });
}

// Global event listeners to toggle controls based on the Control key.
function setupControlKeyListeners() {
  document.addEventListener('keydown', (event) => {
    // When Control is pressed:
    if (event.key === 'Control'|| event.key === 'Meta') {
      // Disable orbit controls so that dragging doesn't rotate the scene.
      if (orbitControls) orbitControls.enabled = false;
      // Enable drag controls to allow object movement.
      if (compDragControls) compDragControls.enabled = true;
      if (MESdragControls) MESdragControls.enabled = true;
    }
  });

  document.addEventListener('keyup', (event) => {
    // When Control is released:
    if (event.key === 'Control'|| event.key === 'Meta') {
      // Re-enable orbit controls for scene rotation.
      if (orbitControls) orbitControls.enabled = true;
      // Disable drag controls so they don't interfere with rotation.
      if (compDragControls) compDragControls.enabled = false;
      if (MESdragControls) MESdragControls.enabled = false;
    }
  });
}

/**
 * Represents a person/agent in the evacuation simulation.
 * @class
 */
class Human {
    /**
     * @param {number} id - Unique identifier for the person.
     * @param {number} speed - Movement speed in m/s.
     * @param {string|number} color - Hex color for the agent mesh.
     */
    constructor(id, speed, color) {
        this.geometry = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 1.8),
            new THREE.MeshBasicMaterial({ color })
        );
        /** @type {number} Movement speed scalar. */
        this.speed = speed;
        /** @type {THREE.Box3} Axis-aligned bounding box for the agent. */
        this.BB = new THREE.Box3().setFromObject(this.geometry);
        this.movingUp = Math.random() < 0.5;
        this.stuckCount = 0;
        this.x = [];
        this.y = [];
        this.z = [];
        this.time = [];
        this.dist = 0;
        scene.add(this.geometry);
        /** @type {boolean} State flag indicating if the agent has exited a room via an interface. */
        this.hasReachedInterface = false;
        /** @type {?number} The index of the compartment the agent starts in. */
        this.currentCompartmentIndex = null;     // directMovement can ignore the right room
        this.targetMusteringStationIndex = 0;    // Index of the nearest mustering station
    }
}

// Generate a random position within the deck's bounding box (deckBB)
function getRandomPositionOnDeck() {
    const x = Math.random() * (deckBB.max.x - deckBB.min.x) + deckBB.min.x;
    const y = Math.random() * (deckBB.max.y - deckBB.min.y) + deckBB.min.y;
    return new THREE.Vector3(x, y, 0);
}

function getRandomPositionOnLimitedArea(limits) {
    const { minX, maxX, minY, maxY } = limits;
    const x = Math.random() * (maxX - minX) + minX;
    const y = Math.random() * (maxY - minY) + minY;
    return new THREE.Vector3(x, y, 0);
}

// Check if a given position is inside any compartment, using an expanded bounding box
function isPositionInsideAnyCompartment(position) {
    return getCompartmentIndexAtPoint(position) >= 0;
}

// Check if a position is inside the mustering station, using an expanded bounding box
// Uses the first mustering station (index 0) as the target for evacuation
function isPositionInMusteringStation(position) {
    if (!musteringStationsBB || musteringStationsBB.length === 0) return false;
    const expandedBB = musteringStationsBB[0].clone().expandByScalar(1);
    return expandedBB.containsPoint(position);
}

// Find the index of the nearest mustering station to a given position
function findNearestMusteringStation(position) {
    if (!musteringStations_inner || musteringStations_inner.length === 0) return 0;
    
    let nearestIndex = 0;
    let minDistance = Infinity;
    
    musteringStations_inner.forEach((station, index) => {
        const dx = station.position.x - position.x;
        const dy = station.position.y - position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
            minDistance = distance;
            nearestIndex = index;
        }
    });
    
    return nearestIndex;
}

// Determine if a point lies within the current deck (polygon-aware for JSON uploads).
function isPointInsideDeck(position) {
    if (deck_configuration === 'json' && deckOutline && deckOutline.length >= 3) {
        const px = position.x;
        const py = position.y;
        let inside = false;
        for (let i = 0, j = deckOutline.length - 1; i < deckOutline.length; j = i++) {
            const xi = deckOutline[i].x, yi = deckOutline[i].y;
            const xj = deckOutline[j].x, yj = deckOutline[j].y;
            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    return deckBB ? deckBB.containsPoint(position) : false;
}

/**
 * Checks if a position is safely inside the deck with margin from edges.
 * @param {THREE.Vector3} position - Position to check
 * @param {number} minMargin - Minimum distance from deck edges
 * @returns {boolean} True if safely inside deck
 */
function isPointSafelyInsideDeck(position, minMargin = 0.5) {
    if (deck_configuration === 'json' && deckOutline && deckOutline.length >= 3) {
        return isPointSafelyInsidePolygon(position.x, position.y, deckOutline, minMargin);
    }
    
    if (!deckBB) return false;
    return (
        position.x >= deckBB.min.x + minMargin &&
        position.x <= deckBB.max.x - minMargin &&
        position.y >= deckBB.min.y + minMargin &&
        position.y <= deckBB.max.y - minMargin
    );
}

/**
 * Checks if a position is safely outside ALL compartments with margin.
 * @param {THREE.Vector3} position - Position to check
 * @param {number} minMargin - Minimum distance from compartment edges
 * @returns {boolean} True if safely outside all compartments
 */
function isPositionSafelyOutsideCompartments(position, minMargin = 0.5) {
    for (let i = 0; i < compartmentsMeshes.length; i++) {
        const mesh = compartmentsMeshes[i];
        const outline = getMeshOutlineGlobal(mesh);
        
        if (outline && outline.length >= 3) {
            if (pointInPolygon2D(position.x, position.y, outline)) {
                return false;
            }
            const edgeDist = pointToPolygonEdgeDistance(position.x, position.y, outline);
            if (edgeDist < minMargin) {
                return false;
            }
        } else {
            const bb = compartmentsBB[i];
            if (bb) {
                const expanded = bb.clone().expandByScalar(minMargin);
                if (expanded.containsPoint(position)) {
                    return false;
                }
            }
        }
    }
    return true;
}

/**
 * Checks if position is safely outside mustering stations.
 * @param {THREE.Vector3} position - Position to check
 * @param {number} minMargin - Minimum distance from station edges
 * @returns {boolean} True if safely outside all mustering stations
 */
function isPositionSafelyOutsideMusteringStations(position, minMargin = 0.5) {
    if (!musteringStationsBB || musteringStationsBB.length === 0) return true;
    
    for (const bb of musteringStationsBB) {
        const expanded = bb.clone().expandByScalar(minMargin);
        if (expanded.containsPoint(position)) {
            return false;
        }
    }
    return true;
}

function createPersons(num) {
    num = Number(num);  // Ensure num is a number.
    const person_colors = [
        '#006400', '#008000', '#556B2F', '#228B22', '#2E8B57',
        '#808000', '#6B8E23', '#3CB371', '#32CD32', '#00FF00', 
        '#00FF7F', '#00FA9A', '#8FBC8F', '#66CDAA', '#9ACD32', 
        '#7CFC00', '#7FFF00', '#90EE90', '#ADFF2F', '#98FB98'
    ];
    
    // Safety margin from all polygon edges (in meters)
    const EDGE_MARGIN = 1.0;
    
    let PersonLocLimits;
    if (deck_configuration === "simple") {
        // For a "simple" configuration, spread persons over most of the deck.
        // Assuming the deck has already been created and deckBB is updated:
        const margin = 2; // adjust as needed to avoid spawning too close to edges
        PersonLocLimits = {
            minX: deckBB.min.x + margin,
            maxX: deckBB.max.x - margin,
            minY: deckBB.min.y + margin,
            maxY: deckBB.max.y - margin
        };
    } else if (deck_configuration === "test6") {
        // For test6, we want persons to appear only in a smaller area.
        // For example, a fixed 4x2 area (in local coordinates) in the bottom left corner.
        PersonLocLimits = {
            minX: -6,  // For a 12x12 deck centered at 0,0, deck spans x = -6 to +6.
            maxX: -2,  // 4 meters wide.
            minY: -6,  // y = -6 to -4 for a 2 meter high area.
            maxY: -4
        };
    } else if (deck_configuration === "json") {
        const margin = 2;
        PersonLocLimits = {
            minX: deckBB.min.x + margin,
            maxX: deckBB.max.x - margin,
            minY: deckBB.min.y + margin,
            maxY: deckBB.max.y - margin
        };
    }
    
    inMES = Array(num).fill(0);
    persons = Array.from({ length: num }, (_, i) => {
        let human = new Human(i, 3 + Math.random() * 2, person_colors[i % person_colors.length]);
        let candidate;
        let attempts = 0;
        const maxAttempts = 2000;
        
        if (deck_configuration === 'simple' || deck_configuration === 'l-shape') {
          // ► simple & L-shape: keep everyone on the deck as before
          do {
            candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
            attempts++;
            if (attempts > maxAttempts) {
              console.warn(`Could not find valid spot for Person ${i} after ${maxAttempts} attempts`);
              break;
            }
          } while (
            !isPointSafelyInsideDeck(candidate, EDGE_MARGIN) ||
            !isPositionSafelyOutsideCompartments(candidate, EDGE_MARGIN) ||
            !isPositionSafelyOutsideMusteringStations(candidate, EDGE_MARGIN)
          );
        } else if (deck_configuration === 'json') {
          if (customInterfaces.length > 0
              && deckExitCompNames.size > 0
              && i === 0) {
            // ► JSON + interfaces: Person 0 must start inside one of those interface compartments
            do {
              candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
              attempts++;
              if (attempts > maxAttempts) {
                console.warn("Couldn't seed Person 0 inside an interface compartment");
                break;
              }
              let compIdx = getCompartmentIndexAtPoint(candidate);
            } while (
              compIdx < 0
              ||
              !deckExitCompNames.has(compartmentsMeshes[compIdx]?.name)
              ||
              !isPointSafelyInsideDeck(candidate, EDGE_MARGIN)
            );
          } else {
            // ► JSON without interfaces (or Persons 1+) fall back to “deck only”
            do {
              candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
              attempts++;
              if (attempts > maxAttempts) {
                console.warn(`Could not find valid spot for Person ${i} after ${maxAttempts} attempts`);
                break;
              }
            } while (
              !isPointSafelyInsideDeck(candidate, EDGE_MARGIN) ||
              !isPositionSafelyOutsideCompartments(candidate, EDGE_MARGIN) ||
              !isPositionSafelyOutsideMusteringStations(candidate, EDGE_MARGIN)
            );
          }
        } else {
          // ► any other (future?) configuration: default to “deck only”
          do {
            candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
            attempts++;
            if (attempts > maxAttempts) { break; }
          } while (
            !isPointSafelyInsideDeck(candidate, EDGE_MARGIN) ||
            !isPositionSafelyOutsideCompartments(candidate, EDGE_MARGIN) ||
            !isPositionSafelyOutsideMusteringStations(candidate, EDGE_MARGIN)
          );
        }
        
        if (attempts > 100) {
            console.log(`Person ${i} placed after ${attempts} attempts`);
        }
        
        human.geometry.position.copy(candidate);
        // Assign the nearest mustering station to this person
        human.targetMusteringStationIndex = findNearestMusteringStation(candidate);
        console.log(`Person ${i} assigned to mustering station ${human.targetMusteringStationIndex}`);
        return human;
    });
}

/**
 * Calculates and applies movement for an agent directly toward a target (Mustering Station).
 * Implements collision detection and simple obstacle avoidance.
 * Scientific Basis: Calculates displacement vector d = v * deltaT.
 * @param {Human} person - The agent object to move.
 * @param {number} i - The index of the agent in the global array.
 */
function directMovement(person,i) {
    // Move toward the person's assigned mustering station
    if (!musteringStations_inner || musteringStations_inner.length === 0) return;
    const targetIndex = person.targetMusteringStationIndex || 0;
    const deltaX = musteringStations_inner[targetIndex].position.x - person.geometry.position.x;
    const deltaY = musteringStations_inner[targetIndex].position.y - person.geometry.position.y;
    const angle = Math.atan2(deltaY, deltaX);
    const move = deltaT * person.speed;

    // Remove Math.sign – angle already gives the correct direction.
    const moveX = move * Math.cos(angle);
    const moveY = move * Math.sin(angle);
    const newPos = person.geometry.position.clone().add(new THREE.Vector3(moveX, moveY, 0));
    const newBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(moveX, moveY, 0));
    let collision = compartmentsBB.some((bb, idx) => {
        // Only ignore collisions with your current compartment when you are
        // physically near the deck-connected door of that compartment.
        // This prevents agents from "walking through walls" in rooms with no deck exit.
        if (idx === person.currentCompartmentIndex
            && isPointInsideCompartmentIndex(person.geometry.position, idx)
            && isNearDeckExitDoor(person, idx)) {
            return false;
        }
        return bb.intersectsBox(newBB);
    });

    if (!collision && isPointInsideDeck(newPos)) {
        person.geometry.position.copy(newPos);
        person.BB.setFromObject(person.geometry);
        // Update accumulated distance:
        person.dist += move;
    } else {
        if (!person.avoidingObstacle) {
            person.movingUp = Math.random() < 0.5;
            person.avoidingObstacle = true;
        }
        const verticalMove = person.movingUp ? move : -move;
        const testPos = person.geometry.position.clone().add(new THREE.Vector3(0, verticalMove, 0));
        const testBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(0, verticalMove, 0));
        if (!compartmentsBB.some((bb) => bb.intersectsBox(testBB)) && isPointInsideDeck(testPos)) {
            person.geometry.position.copy(testPos);
        } else {
            person.stuckCount++;
            if (person.stuckCount > 3) {
                person.movingUp = !person.movingUp;
                person.stuckCount = 0;
            }
        }
    }

    // Record the new position and time:
    person.x.push(deck_configuration === 'json'
        ? person.geometry.position.x
        : (person.geometry.position.x + deck_length / 2));
    person.y.push(deck_configuration === 'json'
        ? person.geometry.position.y
        : person.geometry.position.y);
    person.time.push(time_step);
    person.z.push(person.geometry.position.z);
    person.BB.setFromObject(person.geometry);
    document.getElementById("movment" + String(i + 1)).innerText = person.dist.toFixed(2);
    // Check if person has reached their assigned mustering station
    if (musteringStationsBB.length > targetIndex && musteringStationsBB[targetIndex].intersectsBox(person.BB)) {
        inMES[i] = 1;
    }
}

/**
 * Handles hierarchical pathfinding for agents inside compartments with defined interfaces (doors).
 * Logic Flow:
 * 1. Identify which compartment the agent is in.
 * 2. Find the associated interface (door) connecting to 'deck'.
 * 3. Steer agent toward the door.
 * 4. Once the door is reached, switch state to 'directMovement' toward the Mustering Station.
 * @param {Human} person - The agent object.
 * @param {number} i - The index of the agent.
 */
function interfaceAwareMovement(person, i) {
    // 1) Figure out which compartment they’re in
    const compIndex = getCompartmentIndexAtPoint(person.geometry.position);
    person.currentCompartmentIndex = compIndex;
    const compName  = (compIndex >= 0) ? compartmentsMeshes[compIndex]?.name : null;
    if (!compName) {
      directMovement(person, i);
      return;
    }
  
    // 2) Find the door that connects this compartment to the deck
    const iface = getDeckExitInterfaceForCompIndex(compIndex);
    if (!iface) {
      // no door? just avoid as before
      directMovement(person, i);
      return;
    }
  
    // 3) Compute the door’s position (JSON coords are deck-centered)
<<<<<<< HEAD
    const targetX = (deck_configuration === 'json')
      ? Number(iface.x ?? 0)
      : (Number(iface.x ?? 0) - deck_length/2);
    const targetY = (deck_configuration === 'json')
      ? Number(iface.y ?? 0)
      : (Number(iface.y ?? 0) - deck_width/2);
||||||| 861e764
    const targetX = deck_configuration === 'json' ? iface.x : (iface.x - deck_length/2);
    const targetY = deck_configuration === 'json' ? iface.y : (iface.y - deck_width/2);
=======
    const { x: targetX, y: targetY } = getInterfaceLocalXY(iface);
>>>>>>> fixing
    // if we’re close enough to the door, switch to mustering logic
    const distToDoor = person.geometry.position.distanceTo(
      new THREE.Vector3(targetX, targetY, person.geometry.position.z)
    );
    if (distToDoor < 0.5) {
      person.hasReachedInterface = true;   // NEW
      return;                              // leave the room this frame
    }
    // 4) Temporarily steer the person's assigned mustering station to the door...
    const oldPos = musteringStations_inner[person.targetMusteringStationIndex || 0].position.clone();
    musteringStations_inner[person.targetMusteringStationIndex || 0].position.set(targetX, targetY, oldPos.z);
  
    // 5) Reuse your directMovement logic to navigate to the door
    directMovement(person, i);
  
    // 6) Restore the real mustering station
    musteringStations_inner[person.targetMusteringStationIndex || 0].position.copy(oldPos);
  }


  function animate() {
    // Compute elapsed time
    deltaT = clock.getDelta();
    time_step += deltaT;
  
    // Update orbit controls if enabled
    if (orbitControls && orbitControls.enabled) {
      orbitControls.update();
    }
  
    // Continue animation until everyone reaches the mustering station
    if (inMES.includes(0)) {
      animationId = requestAnimationFrame(animate);
  
      persons.forEach((person, i) => {
        if (inMES[i] !== 0) return;
  
        // 1) Non-JSON decks: always use direct vector movement
        if (deck_configuration === 'simple' || deck_configuration === 'test6') {
          directMovement(person,i);
          return;
        }
  
        // 2) JSON deck
        if (deck_configuration === 'json') {
          // 2a) No interfaces defined → direct movement
          if (customInterfaces.length === 0) {
            directMovement(person,i);
            return;
          }
          // 2b) Interfaces exist → decide based on room membership
          if (!person.hasReachedInterface) {
            // still need to exit your room
            const insideRoom = (getCompartmentIndexAtPoint(person.geometry.position) >= 0);
            if (insideRoom) {
              interfaceAwareMovement(person, i);
            } else {
              // just left the room—flip the flag and head to muster
              person.hasReachedInterface = true;
              directMovement(person,i);
            }
          } else {
            // door reached: go straight to the mustering station
          directMovement(person,i);
        }
          return;
        }
      });
  
      renderer.render(scene, camera);
    } else {
      // All persons have reached the mustering station
      console.log('All persons are in MES');
      document.getElementById('startSim').disabled = false;
      cancelAnimationFrame(animationId);
      document.getElementById('plotFigure').disabled = false;
      document.getElementById('saveResultCSV').disabled = false;
      document.getElementById('saveResultJSON').disabled = false;
    }
  }
  
  

function resetScene() {
        // Hide the graph container when restarting the scene
        document.getElementById("movment2D").style.display = "none";
    
    cancelAnimationFrame(animationId);
    disposePersons();
    disposeMeshes([
        ...compartmentsMeshes,
        ...musteringStations,
        ...musteringStations_inner,
        deck,
        persons.map((p) => p.geometry),
        interfaceMeshes
  ]);
  interfaceMeshes = [];

    initializeConfiguration();
    createDeck();
    drawOriginMarker();
    createCompartments();
    addMusteringStation();
    // only draw interfaces if JSON mode and we have definitions
    if (deck_configuration === 'json' && customInterfaces.length > 0) {
       createInterfaces();
    }
    no_persons = Number(document.getElementById('no_persons').value) || 0;
    createPersons(no_persons);
    setupDragControls();

    // Delay the camera adjustment to allow the deck to be fully added.
    requestAnimationFrame(() => {
        adjustCameraPosition();
        renderer.render(scene, camera);
    });
}

function init() {
// always reset to simple on page load/refresh
  const simpleRadio = document.getElementById('radio1');
  if (simpleRadio) simpleRadio.checked = true;
  deck_configuration = 'simple';

   initializeConfiguration();
   createScene();
   createDeck();
   drawOriginMarker();
    deck_configuration = document.querySelector('input[name="options"]:checked').value;
    initializeConfiguration();
    createScene();
    createDeck();
   drawOriginMarker();
    createCompartments();
    addMusteringStation();
    no_persons = Number(document.getElementById('no_persons').value) || 2;
    createPersons(no_persons);
    
    // Set up DragControls (they start disabled).
    setupDragControls();
    
    // Set up OrbitControls (enabled by default).
    setupOrbitControls();
    
    // Set up the key listeners to toggle between controls.
    setupControlKeyListeners();
    
    adjustCameraPosition();
    renderer.render(scene, camera);

    const startButton = document.getElementById("startSim");
    if (startButton) {
        startButton.addEventListener("click", () => {
            document.getElementById("movment2D").style.display = "none";
            startButton.disabled = true;
            clock.start();
            animate();
        });
    }
}

init();
document.querySelectorAll('input[name="options"]').forEach((radio) => {
    radio.addEventListener('change', (event) => {
        deck_configuration = event.target.value;
        resetScene();
        document.getElementById("startSim").disabled = false;
        document.getElementById("plotFigure").disabled = true;
        document.getElementById("saveResultCSV").disabled = true;
        document.getElementById("saveResultJSON").disabled = true;
    });
});
$("#no_persons").on("change", function() {
    // keep our JS var in sync
    no_persons = Number(this.value) || 0;
    // rebuild the “Person X movement length” UI if needed…
    const div = document.getElementById('IDresults');
    div.innerHTML = '';
    for (let i = 0; i < no_persons; i++) {
      const para = document.createElement('div');
      para.innerText = `Person ${i + 1} movement length: `;
      const span = document.createElement('span');
      span.id = `movment${i + 1}`;
      span.innerText = '0';
      para.appendChild(span);
      div.appendChild(para);
    }
    // regenerate the scene with the new count
    resetScene();
  });

  $("#plotFigure").on("click", function() {
    // Make sure the graph container is visible.
    document.getElementById("movment2D").style.display = "block";

    const isJson = (deck_configuration === 'json');
    const xShift = isJson ? 0 : (deck_length / 2);   // JSON: already in ship coords
    const yShift = 0;

    function rectCorners2D(cx, cy, L, W, rotRad) {
        const hx = L / 2;
        const hy = W / 2;
        const pts = [
            { x: -hx, y: -hy },
            { x:  hx, y: -hy },
            { x:  hx, y:  hy },
            { x: -hx, y:  hy }
        ];
        const c = Math.cos(rotRad);
        const s = Math.sin(rotRad);
        const xs = [];
        const ys = [];
        for (const p of pts) {
            const xr = p.x * c - p.y * s;
            const yr = p.x * s + p.y * c;
            xs.push(cx + xr);
            ys.push(cy + yr);
        }
        // close polygon
        xs.push(xs[0]);
        ys.push(ys[0]);
        return { xs, ys };
    }

    function buildDeckOutlineTrace() {
        let xs = [];
        let ys = [];

        if (isJson && Array.isArray(deckOutline) && deckOutline.length >= 3) {
            xs = deckOutline.map(p => Number(p.x));
            ys = deckOutline.map(p => Number(p.y));
            // If the outline is already closed (last point == first), drop the last point to avoid a double-close in the plot
            if (xs.length >= 2 && xs[0] === xs[xs.length - 1] && ys[0] === ys[ys.length - 1]) {
                xs = xs.slice(0, -1);
                ys = ys.slice(0, -1);
            }
        } else {
            // local (centered) rectangle, then apply xShift to match stored person.x
            xs = [-deck_length/2,  deck_length/2,  deck_length/2, -deck_length/2];
            ys = [-deck_width /2, -deck_width /2,  deck_width /2,  deck_width /2];
        }

        // close
        xs = xs.concat(xs[0]);
        ys = ys.concat(ys[0]);

        // apply plot shift for non-JSON decks
        xs = xs.map(v => v + xShift);
        ys = ys.map(v => v + yShift);

        return {
            x: xs,
            y: ys,
            mode: 'lines',
            name: 'Deck outline',
            showlegend: false,
            line: { width: 2 }
        };
    }
    function buildRoomTraces() {
        const traces = [];
        if (!Array.isArray(compartmentsMeshes) || compartmentsMeshes.length === 0) return traces;

        compartmentsMeshes.forEach((mesh, idx) => {
            if (!mesh) return;

            // Polygon rooms
            const outline = getMeshOutlineGlobal(mesh);
            if (outline && outline.length >= 3) {
                let xs = outline.map(p => Number(p.x));
                let ys = outline.map(p => Number(p.y));
                xs = xs.concat(xs[0]);
                ys = ys.concat(ys[0]);

                traces.push({
                    x: xs.map(v => v + xShift),
                    y: ys.map(v => v + yShift),
                    mode: 'lines',
                    name: mesh.name ? `Room: ${mesh.name}` : `Room ${idx + 1}`,
                    showlegend: false,
                    line: { width: 1 },
                    fill: 'toself',
                    fillcolor: 'rgba(0, 0, 255, 0.10)'
                });
                return;
            }

            // Rectangle rooms
            if (!mesh.geometry || !mesh.position) return;
            const params = mesh.geometry.parameters || {};
            const L = Number(params.width);
            const W = Number(params.height);
            if (!Number.isFinite(L) || !Number.isFinite(W)) return;

            const cx = Number(mesh.position.x);
            const cy = Number(mesh.position.y);
            const rot = Number(mesh.rotation?.z || 0);

            const { xs, ys } = rectCorners2D(cx, cy, L, W, rot);

            traces.push({
                x: xs.map(v => v + xShift),
                y: ys.map(v => v + yShift),
                mode: 'lines',
                name: mesh.name ? `Room: ${mesh.name}` : `Room ${idx + 1}`,
                showlegend: false,
                line: { width: 1 },
                fill: 'toself',
                fillcolor: 'rgba(0, 0, 255, 0.10)'
            });
        });

        return traces;
    }

    function buildMusteringTraces() {
        const traces = [];
        if (!musteringStations_inner || musteringStations_inner.length === 0) return traces;
        
        musteringStations_inner.forEach((mustering_inner, idx) => {
            if (!mustering_inner || !mustering_inner.geometry || !mustering_inner.position) return;
            const params = mustering_inner.geometry.parameters || {};
            const L = Number(params.width);
            const W = Number(params.height);
            if (!Number.isFinite(L) || !Number.isFinite(W)) return;

            const cx = Number(mustering_inner.position.x);
            const cy = Number(mustering_inner.position.y);
            const rot = Number(mustering_inner.rotation?.z || 0);

            const { xs, ys } = rectCorners2D(cx, cy, L, W, rot);

            traces.push({
                x: xs.map(v => v + xShift),
                y: ys.map(v => v + yShift),
                mode: 'lines',
                name: mustering_inner.name || `Mustering station ${idx + 1}`,
                showlegend: false,
                line: { width: 2 },
                fill: 'toself',
                fillcolor: 'rgba(255, 0, 0, 0.10)'
            });
        });
        
        return traces;
    }


    function buildOriginAxisTraces() {
        // Small axis marker at the global origin (0,0) in *plot* coordinates.
        // Use xShift/yShift so it matches the same coordinate system as the plotted deck/rooms/person paths.
        const ox = 0 + xShift;
        const oy = 0 + yShift;

        const maxDim = Math.max(Number(deck_length || 0), Number(deck_width || 0));
        const axisLen = Math.max(1, 0.05 * (Number.isFinite(maxDim) ? maxDim : 100));

        const xAxis = {
            x: [ox, ox + axisLen],
            y: [oy, oy],
            mode: 'lines',
            showlegend: false,
            hoverinfo: 'skip',
            line: { width: 3 }
        };

        const yAxis = {
            x: [ox, ox],
            y: [oy - axisLen, oy + axisLen],
            mode: 'lines',
            showlegend: false,
            hoverinfo: 'skip',
            line: { width: 3 }
        };

        const originPt = {
            x: [ox],
            y: [oy],
            mode: 'markers',
            showlegend: false,
            hoverinfo: 'skip',
            marker: { size: 10 }
        };

        return [xAxis, yAxis, originPt];
    }

    // Assemble traces: deck + rooms + mustering + persons
    const data = [];
    data.push(buildDeckOutlineTrace());
    data.push(...buildRoomTraces());
    data.push(...buildMusteringTraces());
    data.push(...buildOriginAxisTraces());

    for (let i = 0; i < no_persons; i++) {
        if (!persons[i] || !Array.isArray(persons[i].x)) continue;
        data.push({
            x: persons[i].x,
            y: persons[i].y,
            mode: 'lines',
            line: { width: 4 },   // <-- Plotly uses "line", not "lines"
            name: 'person ' + String(i + 1)
        });
    }

    const layout = {
        title: 'Movement Paths',
        xaxis: { title: 'X [m]', zeroline: true },
        yaxis: { title: 'Y [m]', zeroline: true, scaleanchor: 'x', scaleratio: 1 },
        width: 1750,
        height: 700,
        margin: { l: 70, r: 20, t: 60, b: 60 }
    };

    const config = {
        responsive: true,
        displaylogo: false,
        toImageButtonOptions: {
            format: 'png',
            filename: 'high_res_plot',
            height: 1400,
            width: 3500,
            scale: 4
        }
    };

        const TESTER = document.getElementById('movment2D');

    Plotly.newPlot(TESTER, data, layout, config);
});

$("#saveResultCSV").on("click", function() {
  for (let i = 0; i < no_persons; i++) {
      let results_textline = "time;x;y;z\n";
      console.log("person "+i+" movment points");
      for (let j = 0; j < persons[i].x.length; j++) {
          results_textline+=String(persons[i].time[j]+";"+persons[i].x[j])+";"+String(persons[i].y[j])+";"+String(persons[i].z[j])+"\n";
      }
      var myFile = new File([results_textline], "movment_points_person_"+String(i+1)+".csv", {
          type: "text/plain;charset=utf-8"
      });
      saveAs(myFile); // This initiates a file download for each person
  }
});

$("#saveResultJSON").on("click", function() {
    if (!Array.isArray(persons) || persons.length === 0) {
        alert("No simulation results available yet.");
        return;
    }

    function buildPathPoints(p) {
        const xs = Array.isArray(p.x) ? p.x : [];
        const ys = Array.isArray(p.y) ? p.y : [];
        const zs = Array.isArray(p.z) ? p.z : [];
        const ts = Array.isArray(p.time) ? p.time : [];
        const n = Math.min(xs.length, ys.length, zs.length, ts.length);

        const out = [];
        for (let k = 0; k < n; k++) {
            const t = Number(ts[k]);
            const x = Number(xs[k]);
            const y = Number(ys[k]);
            const z = Number(zs[k]);

            let v = 0;
            if (k > 0) {
                const dt = Number(ts[k]) - Number(ts[k - 1]);
                if (dt > 0) {
                    const dx = Number(xs[k]) - Number(xs[k - 1]);
                    const dy = Number(ys[k]) - Number(ys[k - 1]);
                    const dz = Number(zs[k]) - Number(zs[k - 1]);
                    v = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
                }
            }

            out.push({ t, x, y, z, v });
        }
        return out;
    }

    const results = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        deckConfiguration: deck_configuration,
        customGeometryLayoutFile: (deck_configuration === 'json') ? (customGeometryLayoutFileName || null) : null,
        noPersons: Number(no_persons) || persons.length,
        persons: persons.map((p, i) => ({
            id: (p && p.id != null) ? Number(p.id) : i,
            desiredSpeed: (p && p.speed != null) ? Number(p.speed) : 0,
            targetMusteringStationIndex: (p && p.targetMusteringStationIndex != null) ? Number(p.targetMusteringStationIndex) : 0,
            path: buildPathPoints(p)
        }))
    };

    const jsonText = JSON.stringify(results, null, 2);
    const safeStamp = results.generatedAt.replace(/[:.]/g, '-');
    const outName = "simulation_results_" + String(deck_configuration) + "_" + safeStamp + ".json";
    const outFile = new File([jsonText], outName, { type: "application/json;charset=utf-8" });
    saveAs(outFile);
});
