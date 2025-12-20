import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

let no_compartments = 5;
let no_persons = 2; // Initialize with the default value from your HTML input

let compartments = [], compartmentsBB = [], compartmentsMeshes = [];
let animationId, scene, camera, renderer, deck, deckBB, mustering, mustering_inner, MusteringBB;
let persons = [], inMES = [];
let orbitControls, compDragControls, MESdragControls;

let deck_configuration = "simple";
let mes_x_global, mes_y_global, mes_width, mes_length, deck_length, deck_width;
let deckMinX = 0, deckMaxX = 0, deckMinY = 0, deckMaxY = 0;
let deckCenterX = 0, deckCenterY = 0;
let deltaT = 0;
const clock = new THREE.Clock();
let time_step = 0;

let deckArrangement = null;
let deckOutline = null;         // optional outline when loaded from JSON
let customInterfaces = [];      // holds parsed interface attributes
let interfaceMeshes = [];       // mesh instances for cleanup
let interfaceCompNames = new Set(); 
let geometryLoadInProgress = false;

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

// Ray casting point-in-polygon (2D)
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

function loadGeometryFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    // Prevent double-trigger (e.g., inline onchange + addEventListener)
    if (geometryLoadInProgress) return;
    geometryLoadInProgress = true;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        deckArrangement = JSON.parse(e.target.result);
        deck_configuration = 'json';
        // re-draw with new data
        resetScene();
        const r3 = document.getElementById('radio3');
        if (r3) r3.checked = true;
      } finally {
        geometryLoadInProgress = false;
      }
    };
    reader.onerror = () => { geometryLoadInProgress = false; };
    reader.readAsText(file);
  }

function initializeConfiguration() {
    // Reset outline unless JSON redefines it.
    deckOutline = null;
    deckCenterX = 0; deckCenterY = 0;
    deckMinX = 0; deckMaxX = 0; deckMinY = 0; deckMaxY = 0;
    if (deck_configuration === "simple") {
      no_compartments = 5;
      mes_x_global  = 105;  
      mes_y_global  = 17;
      mes_length    = 5;
      mes_width     = 10;
      deck_length   = 105.2;
      deck_width    = 34;
      deckMinX = -deck_length / 2; deckMaxX = deck_length / 2;
      deckMinY = -deck_width / 2;  deckMaxY = deck_width / 2;
      deckCenterX = 0; deckCenterY = 0;
    }
    else if (deck_configuration === "test6") {
      no_compartments = 1;
      deck_length = 12; deck_width = 12;
      mes_x_global = 11; mes_y_global = 11;
      mes_length = 2; mes_width = 2;
      deckMinX = -deck_length / 2; deckMaxX = deck_length / 2;
      deckMinY = -deck_width / 2;  deckMaxY = deck_width / 2;
      deckCenterX = 0; deckCenterY = 0;
    }
    else if (deck_configuration === "json" && deckArrangement) {
        // Reset interface-related state for each new JSON load
        interfaceCompNames.clear();
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
      
        // 2) Count compartments (exclude MusteringStation):
        no_compartments = Object.keys(deckArrangement.arrangements.compartments)
                                 .filter(k => k !== 'MusteringStation').length;
      
        // 3) Mustering station parameters:
        const ms = deckArrangement.arrangements.compartments.MusteringStation.attributes;
        mes_length   = Number(ms.length);
        mes_width    = Number(ms.width);
        mes_x_global = Number(ms.x);
        mes_y_global = Number(ms.y);
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
          deckCenterX = 0;
          deckCenterY = 0;
        } else {
          deckOutline = null;
          deckMinX = Number(deckEntry.attributes.min_x ?? deckEntry.attributes.minX ?? -deck_length / 2);
          deckMaxX = Number(deckEntry.attributes.max_x ?? deckEntry.attributes.maxX ??  deck_length / 2);
          deckMinY = Number(deckEntry.attributes.min_y ?? deckEntry.attributes.minY ?? -deck_width / 2);
          deckMaxY = Number(deckEntry.attributes.max_y ?? deckEntry.attributes.maxY ??  deck_width / 2);
          deckCenterX = 0;
          deckCenterY = 0;
        }
        // 4) Interface definitions (if any):
        const ifaceDefs = deckArrangement.arrangements.interfaces;
        if (ifaceDefs && Object.keys(ifaceDefs).length > 0) {
              // Convert each into a flat attributes object
              customInterfaces = Object.keys(ifaceDefs).map(name => ({
                name,
                ...ifaceDefs[name].attributes
              }));
              console.warn("Custom geometry JSON contains interface definitions.");
              // Gather all compartment names mentioned in any interface
                customInterfaces.forEach(iface => {
                if (Array.isArray(iface.connects)) {
                // populate the GLOBAL set instead of a local one:
                 iface.connects.filter(n => n !== 'deck')
                 .forEach(n => interfaceCompNames.add(n));
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
        scene.add(deck);
    } else {
        deck = new THREE.Mesh(
            new THREE.BoxGeometry(deck_length, deck_width, 0.02),
            new THREE.MeshBasicMaterial({ color: deckColor, side: THREE.DoubleSide })
        );
        deck.position.z = 0;
        deckBB = new THREE.Box3().setFromObject(deck);
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
            const outline = normalizeOutline(attrs.outline);

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
                mesh.position.set(Number(attrs.x ?? 0), Number(attrs.y ?? 0), zCenter);
                mesh.rotation.z = (Math.PI * rotDeg) / 180.0;
                mesh.userData.shape = 'rectangle';
                mesh.userData.zCenter = zCenter;
                mesh.userData.height = height;
            }

            mesh.name = name;
            scene.add(mesh);
            compartmentsMeshes.push(mesh);
            compartmentsBB.push(new THREE.Box3().setFromObject(mesh));
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
    mustering = new THREE.Mesh(
        new THREE.BoxGeometry(mes_length, mes_width, 2.5),
        new THREE.MeshBasicMaterial({ color: 'red', opacity: 0.5, transparent: true })
    );
    mustering.position.set(
        mes_x_global - offsetX,
        mes_y_global - offsetY,
        0
      );

    mustering_inner = new THREE.Mesh(
        new THREE.BoxGeometry(mes_length - 1, mes_width - 1, 2.5),
        new THREE.MeshBasicMaterial({ color: 'red', opacity: 0.5, transparent: true })
    );
    mustering_inner.position.copy(mustering.position);
    MusteringBB = new THREE.Box3().setFromObject(mustering_inner);

    scene.add(mustering);
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
            compartmentsBB[i].setFromObject(mesh);
        });
        cancelAnimationFrame(animationId);
        disposePersons();
        createPersons(no_persons);
        renderer.render(scene, camera);
        document.getElementById("startSim").disabled = false;
    });

    MESdragControls = new DragControls([mustering], camera, renderer.domElement);
    // While dragging, force the mustering station to remain at z = 0.
    MESdragControls.addEventListener('drag', (event) => {
        event.object.position.z = 0;
    });
    MESdragControls.addEventListener('dragend', (event) => {
        mustering_inner.position.copy(event.object.position);
        MusteringBB.setFromObject(mustering_inner);
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

class Human {
    constructor(id, speed, color) {
        this.geometry = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 1.8),
            new THREE.MeshBasicMaterial({ color })
        );
        this.speed = speed;
        this.BB = new THREE.Box3().setFromObject(this.geometry);
        this.movingUp = Math.random() < 0.5;
        this.stuckCount = 0;
        this.x = [];
        this.y = [];
        this.z = [];
        this.time = [];
        this.dist = 0;
        scene.add(this.geometry);
        this.hasReachedInterface = false;
        this.currentCompartmentIndex = null;     // directMovement can ignore the right room
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
function isPositionInMusteringStation(position) {
    if (!MusteringBB) return false;
    const expandedBB = MusteringBB.clone().expandByScalar(1);
    return expandedBB.containsPoint(position);
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

function createPersons(num) {
    num = Number(num);  // Ensure num is a number.
    const person_colors = [
        '#006400', '#008000', '#556B2F', '#228B22', '#2E8B57',
        '#808000', '#6B8E23', '#3CB371', '#32CD32', '#00FF00', 
        '#00FF7F', '#00FA9A', '#8FBC8F', '#66CDAA', '#9ACD32', 
        '#7CFC00', '#7FFF00', '#90EE90', '#ADFF2F', '#98FB98'
    ];
    
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
        // —— BREAKDOWN BY deck_configuration —— 
        if (deck_configuration === 'simple' || deck_configuration === 'l-shape') {
          // ► simple & L-shape: keep everyone on the deck as before
          do {
            candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
            attempts++;
            if (attempts > 1000) {
              console.warn(`Could not find valid spot for Person ${i} on ${deck_configuration}`);
              break;
            }
          } while (
            !isPointInsideDeck(candidate) ||
            isPositionInsideAnyCompartment(candidate) ||
            isPositionInMusteringStation(candidate)
          );
             } else if (deck_configuration === 'json') {
          if (customInterfaces.length > 0
              && interfaceCompNames.size > 0
              && i === 0) {
            // ► JSON + interfaces: Person 0 must start inside one of those interface compartments
            do {
              candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
              attempts++;
              if (attempts > 1000) {
                console.warn("Couldn't seed Person 0 inside an interface compartment");
                break;
              }
            } while (
              // 1) must be in *some* compartment…
              !isPositionInsideAnyCompartment(candidate)
              ||
              // 2) …and that compartment’s name must be in our interfaceCompNames
              ![...interfaceCompNames].some(name => {
                const idx = compartmentsMeshes.findIndex(m => m.name === name);
                return idx >= 0 && isPointInsideCompartmentIndex(candidate, idx);
              })
              ||
              // 3) must also sit on the deck outline
              !isPointInsideDeck(candidate)
            );
          } else {
            // ► JSON without interfaces (or Persons 1+) fall back to “deck only”
            do {
              candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
              attempts++;
              if (attempts > 1000) {
                console.warn(`Could not find valid spot for Person ${i} on JSON deck`);
                break;
              }
            } while (
              !isPointInsideDeck(candidate) ||
              isPositionInsideAnyCompartment(candidate) ||
              isPositionInMusteringStation(candidate)
            );
          }
             } else {
          // ► any other (future?) configuration: default to “deck only”
          do {
            candidate = getRandomPositionOnLimitedArea(PersonLocLimits);
            attempts++;
            if (attempts > 1000) { break; }
          } while (
            !isPointInsideDeck(candidate) ||
            isPositionInsideAnyCompartment(candidate) ||
            isPositionInMusteringStation(candidate)
          );
        }
        human.geometry.position.copy(candidate);
        return human;
    });
}

function directMovement(person,i) {
    const deltaX = mustering_inner.position.x - person.geometry.position.x;
    const deltaY = mustering_inner.position.y - person.geometry.position.y;
    const angle = Math.atan2(deltaY, deltaX);
    const move = deltaT * person.speed;

    // Remove Math.sign – angle already gives the correct direction.
    const moveX = move * Math.cos(angle);
    const moveY = move * Math.sin(angle);
    const newPos = person.geometry.position.clone().add(new THREE.Vector3(moveX, moveY, 0));
    const newBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(moveX, moveY, 0));
    let collision = compartmentsBB.some((bb, idx) => {
        // ignore the wall of the compartment you’re currently inside—
        // so you can actually step through the opening
        if (idx === person.currentCompartmentIndex
            && isPointInsideCompartmentIndex(person.geometry.position, idx)) {
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
    person.x.push(deck_configuration === 'json' ? person.geometry.position.x : (person.geometry.position.x + deck_length / 2));
    person.y.push(person.geometry.position.y);
    person.time.push(time_step);
    person.BB.setFromObject(person.geometry);
    document.getElementById("movment" + String(i + 1)).innerText = person.dist.toFixed(2);
    if (MusteringBB.intersectsBox(person.BB)) {
        inMES[i] = 1;
    }
}

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
    const iface = customInterfaces.find(
      iface => Array.isArray(iface.connects)
            && iface.connects.includes(compName)
            && iface.connects.includes('deck')
    );
    if (!iface) {
      // no door? just avoid as before
      directMovement(person, i);
      return;
    }
  
    // 3) Compute the door’s position (JSON coords are deck-centered)
    const targetX = deck_configuration === 'json' ? iface.x : (iface.x - deck_length/2);
    const targetY = deck_configuration === 'json' ? iface.y : (iface.y - deck_width/2);
    // if we’re close enough to the door, switch to mustering logic
    const distToDoor = person.geometry.position.distanceTo(
      new THREE.Vector3(targetX, targetY, person.geometry.position.z)
    );
    if (distToDoor < 0.5) {
      person.hasReachedInterface = true;   // NEW
      return;                              // leave the room this frame
    }
    // 4) Temporarily steer ‘mustering_inner’ to the door…
    const oldPos = mustering_inner.position.clone();
    mustering_inner.position.set(targetX, targetY, oldPos.z);
  
    // 5) Reuse your directMovement logic to navigate to the door
    directMovement(person, i);
  
    // 6) Restore the real mustering station
    mustering_inner.position.copy(oldPos);
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
        mustering,
        mustering_inner,
        deck,
        persons.map((p) => p.geometry),
        interfaceMeshes
  ]);
  interfaceMeshes = [];

    initializeConfiguration();
    createDeck();
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
    deck_configuration = document.querySelector('input[name="options"]:checked').value;
    initializeConfiguration();
    createScene();
    createDeck();
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
    const xShift = isJson ? 0 : (deck_length / 2);   // persons.x for non-JSON is stored as x_local + deck_length/2
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

    function buildMusteringTrace() {
        if (!mustering_inner || !mustering_inner.geometry || !mustering_inner.position) return null;
        const params = mustering_inner.geometry.parameters || {};
        const L = Number(params.width);
        const W = Number(params.height);
        if (!Number.isFinite(L) || !Number.isFinite(W)) return null;

        const cx = Number(mustering_inner.position.x);
        const cy = Number(mustering_inner.position.y);
        const rot = Number(mustering_inner.rotation?.z || 0);

        const { xs, ys } = rectCorners2D(cx, cy, L, W, rot);

        return {
            x: xs.map(v => v + xShift),
            y: ys.map(v => v + yShift),
            mode: 'lines',
            name: 'Mustering station',
            showlegend: false,
            line: { width: 2 },
            fill: 'toself',
            fillcolor: 'rgba(255, 0, 0, 0.10)'
        };
    }

    // Assemble traces: deck + rooms + mustering + persons
    const data = [];
    data.push(buildDeckOutlineTrace());
    data.push(...buildRoomTraces());
    const msTrace = buildMusteringTrace();
    if (msTrace) data.push(msTrace);

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
        xaxis: { title: 'X position', zeroline: false },
        yaxis: { title: 'Y position', zeroline: false, scaleanchor: 'x', scaleratio: 1 },
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

});

// Expose for the inline onchange handler in index.html
if (typeof window !== 'undefined') {
  window.loadGeometryFile = loadGeometryFile;
}
