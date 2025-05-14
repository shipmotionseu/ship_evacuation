import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

// --- Global Variables ---
let no_compartments = 5;
let no_persons = 2; // Default, will be updated from input

let compartments = [], compartmentsBB = [], compartmentsMeshes = [];
let animationId, scene, camera, renderer, deck, deckBB, mustering, mustering_inner, MusteringBB;
let persons = [], inMES = []; // inMES: array to track if person i is in Mustering Evacuation Station
let orbitControls, compDragControls, MESdragControls;

let deck_configuration = "simple"; // Default deck configuration
let mes_x_global, mes_y_global, mes_width, mes_length, deck_length, deck_width; // Mustering station and deck dimensions
let deltaT = 0; // Time delta for animation
const clock = new THREE.Clock(); // Clock for animation timing
let time_step = 0; // Accumulated time step

let deckArrangement = null; // For JSON loaded deck configuration
let customInterfaces = []; // Holds parsed interface attributes from JSON
let interfaceMeshes = []; // Mesh instances for interfaces (for cleanup)
let interfaceCompNames = new Set(); // Names of compartments connected by interfaces

// --- Initialization and Scene Setup ---

// Function to load geometry from a JSON file
function loadGeometryFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            deckArrangement = JSON.parse(e.target.result);
            deck_configuration = 'json';
            resetScene(); // Redraw with new data
            document.getElementById('radio3').checked = true;
        } catch (error) {
            console.error("Error parsing JSON geometry file:", error);
            alert("Error parsing JSON file. Please check its format.");
        }
    };
    reader.readAsText(file);
}
// Expose to global scope if called from HTML attribute
if (typeof window !== 'undefined') {
    window.loadGeometryFile = loadGeometryFile;
}


// Initializes configuration variables based on the selected deck_configuration
function initializeConfiguration() {
    if (deck_configuration === "simple") {
        no_compartments = 5;
        mes_x_global  = 105; mes_y_global  = 17; // Mustering station position
        mes_length    = 5; mes_width     = 10; // Mustering station dimensions
        deck_length   = 105.2; deck_width    = 34; // Deck dimensions
        customInterfaces = []; interfaceCompNames.clear(); // Reset JSON specific data
    } else if (deck_configuration === "test6") {
        no_compartments = 1;
        deck_length = 12; deck_width = 12;
        mes_x_global = 11; mes_y_global = 11;
        mes_length = 2; mes_width = 2;
        customInterfaces = []; interfaceCompNames.clear(); // Reset JSON specific data
    } else if (deck_configuration === "json" && deckArrangement) {
        try {
            const deckEntry = deckArrangement.arrangements.deck;
            if (deckEntry && deckEntry.attributes) {
                deck_length = Number(deckEntry.attributes.length);
                deck_width  = Number(deckEntry.attributes.width);
            } else {
                console.warn('JSON missing deck entry; using simple defaults');
                deck_length = 105.2; deck_width  = 34;
            }
            no_compartments = Object.keys(deckArrangement.arrangements.compartments)
                                     .filter(k => k !== 'MusteringStation').length;
            const ms = deckArrangement.arrangements.compartments.MusteringStation.attributes;
            mes_length   = Number(ms.length); mes_width    = Number(ms.width);
            mes_x_global = Number(ms.x); mes_y_global = Number(ms.y);

            customInterfaces = []; // Clear previous interfaces
            interfaceCompNames.clear();
            const ifaceDefs = deckArrangement.arrangements.interfaces;
            if (ifaceDefs && Object.keys(ifaceDefs).length > 0) {
                customInterfaces = Object.keys(ifaceDefs).map(name => ({
                    name, ...ifaceDefs[name].attributes
                }));
                customInterfaces.forEach(iface => {
                    if (Array.isArray(iface.connects)) {
                        iface.connects.filter(n => n !== 'deck').forEach(n => interfaceCompNames.add(n));
                    }
                });
            } else {
                console.warn("Custom geometry JSON contains no interface definitions.");
            }
        } catch (error) {
            console.error("Error processing JSON deck arrangement:", error);
            // Fallback to simple if JSON processing fails
            deck_configuration = "simple";
            initializeConfiguration(); 
        }
    } else { // Fallback for unhandled or error states
        console.warn("Deck configuration not recognized or JSON data missing, defaulting to 'simple'.");
        deck_configuration = "simple";
        initializeConfiguration();
    }
}

// Adjusts camera position to fit the deck in view
function adjustCameraPosition() {
    if (!deck || !camera) return;
    deckBB = new THREE.Box3().setFromObject(deck);
    const deckSize = new THREE.Vector3();
    deckBB.getSize(deckSize);
    const maxDim = Math.max(deckSize.x, deckSize.y, deckSize.z); // Use max of x, y, z
    if (maxDim === 0) return; // Avoid division by zero if deck is not yet sized

    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.7; // Zoom out a bit (60% view approx)
    
    camera.position.set(deckBB.getCenter(new THREE.Vector3()).x, deckBB.getCenter(new THREE.Vector3()).y, cameraZ);
    camera.lookAt(deckBB.getCenter(new THREE.Vector3()));
    camera.updateProjectionMatrix();
}

// Creates the main Three.js scene, camera, and renderer
function createScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000); // Increased far plane
    camera.position.z = 60; // Default camera Z position

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(0.88 * window.innerWidth, 0.88 * window.innerHeight); // Adjust size as needed
    renderer.setPixelRatio(window.devicePixelRatio);

    const movementDiv = document.querySelector("#movment3D");
    if (movementDiv) {
        movementDiv.innerHTML = ""; // Clear previous renderer
        movementDiv.appendChild(renderer.domElement);
    }
    scene.background = new THREE.Color(0xffffff); // White background
}

// Disposes of Three.js meshes to free up resources
function disposeMeshes(meshArray) {
    if (!scene) return;
    meshArray.forEach((item) => {
        if (!item) return;
        // Handle arrays of meshes (e.g., from persons.map(p => p.geometry))
        if (Array.isArray(item)) {
            item.forEach(subMesh => {
                if (subMesh) {
                    scene.remove(subMesh);
                    if (subMesh.geometry) subMesh.geometry.dispose();
                    if (subMesh.material) {
                        if (Array.isArray(subMesh.material)) subMesh.material.forEach(mat => mat.dispose());
                        else subMesh.material.dispose();
                    }
                }
            });
        } else { // Handle single mesh
            scene.remove(item);
            if (item.geometry) item.geometry.dispose();
            if (item.material) {
                if (Array.isArray(item.material)) item.material.forEach(mat => mat.dispose());
                else item.material.dispose();
            }
        }
    });
}

// Creates the main deck geometry
function createDeck() {
    if (!scene) return;
    deck = new THREE.Mesh(
        new THREE.BoxGeometry(deck_length, deck_width, 0.02), // Very thin deck
        new THREE.MeshStandardMaterial({ color: 'lightblue', metalness: 0.3, roughness: 0.6 })
    );
    deck.position.set(0, 0, -0.01); // Position deck slightly below z=0
    deckBB = new THREE.Box3().setFromObject(deck);
    scene.add(deck);
    // Add a simple grid helper for better orientation
    const gridHelper = new THREE.GridHelper(Math.max(deck_length, deck_width) * 1.2, 20);
    gridHelper.position.y = -0.02; // Place grid slightly below deck
    scene.add(gridHelper);

    // Add ambient and directional light for better visuals with MeshStandardMaterial
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 100);
    scene.add(directionalLight);
}

// Gets compartment configuration data based on the selected deck_configuration
function getCompartmentConfiguration(configType) {
    // ... (implementation from your provided script.js, ensure it's robust)
    // Example for simple:
    if (configType === "simple") {
        return {
            comp_x: [-30, -15, 20, 20, -5], comp_y: [-5, 6, -5, 9, -11],
            compy_angle: [0, 0, 0, 90, 90], comp_length: [10, 10, 10, 10, 10],
            comp_width: [20, 20, 20, 20, 20], comp_height: [2, 2, 2, 2, 2]
        };
    } else if (configType === "test6") {
        return {
            comp_x: [-1], comp_y: [1], compy_angle: [0],
            comp_length: [10], comp_width: [10], comp_height: [2]
        };
    } else if (configType === "json" && deckArrangement) {
        const comps = deckArrangement.arrangements.compartments;
        const keys = Object.keys(comps).filter(k => k !== 'MusteringStation');
        return {
            comp_x: keys.map(k => Number(comps[k].attributes.x)),
            comp_y: keys.map(k => Number(comps[k].attributes.y)),
            compy_angle: keys.map(k => Number(comps[k].attributes.rotation) || 0),
            comp_length: keys.map(k => Number(comps[k].attributes.length)),
            comp_width: keys.map(k => Number(comps[k].attributes.width)),
            comp_height: keys.map(k => Number(comps[k].attributes.height))
        };
    }
    // Fallback
    console.warn("Unknown compartment config, falling back to simple.");
    return getCompartmentConfiguration("simple");
}

// Creates compartment geometries
function createCompartments() {
    if (!scene) return;
    const config = getCompartmentConfiguration(deck_configuration);
    compartments = []; compartmentsBB = []; compartmentsMeshes = [];

    for (let i = 0; i < no_compartments; i++) {
        const compartment = new THREE.Mesh(
            new THREE.BoxGeometry(config.comp_length[i], config.comp_width[i], config.comp_height[i]),
            new THREE.MeshStandardMaterial({ 
                color: 'yellow', transparent: true, opacity: 0.4,
                metalness: 0.2, roughness: 0.7
            })
        );
        // Center of deck is (0,0). Compartment positions from JSON are absolute.
        // If config positions are relative to deck center, no change needed.
        // If config positions are relative to a corner, adjust:
        // E.g., config.comp_x[i] - deck_length / 2
        compartment.position.set(config.comp_x[i], config.comp_y[i], config.comp_height[i] / 2); // Place base on deck
        compartment.rotation.z = THREE.MathUtils.degToRad(config.compy_angle[i]);
        scene.add(compartment);

        if (deck_configuration === 'json' && deckArrangement) {
            const compNames = Object.keys(deckArrangement.arrangements.compartments)
                                  .filter(k => k !== 'MusteringStation');
            compartment.name = compNames[i]; // Assign name for interface logic
        }
        compartmentsMeshes.push(compartment);
        compartmentsBB.push(new THREE.Box3().setFromObject(compartment));
    }
}

// Adds the mustering station geometry
function addMusteringStation() {
    if (!scene) return;
    mustering = new THREE.Mesh(
        new THREE.BoxGeometry(mes_length, mes_width, 2.5), // Height of mustering station
        new THREE.MeshStandardMaterial({ color: 'red', opacity: 0.6, transparent: true, metalness: 0.2, roughness: 0.7 })
    );
    // Adjust position if mes_x_global, mes_y_global are absolute or relative
    // Assuming they are relative to deck center for this example:
    mustering.position.set(mes_x_global, mes_y_global, 2.5 / 2); // Place base on deck
    scene.add(mustering);

    // Inner bounding box for arrival detection (slightly smaller)
    mustering_inner = new THREE.Mesh( // Visual representation, can be invisible
        new THREE.BoxGeometry(mes_length - 0.5, mes_width - 0.5, 2.4), // Slightly smaller
        new THREE.MeshBasicMaterial({ color: 'darkred', opacity: 0.3, transparent: true, wireframe: true })
    );
    mustering_inner.position.copy(mustering.position);
    MusteringBB = new THREE.Box3().setFromObject(mustering_inner); // Used for collision/arrival
    // scene.add(mustering_inner); // Optional: make inner BB visible for debugging
}

// Creates interface geometries (doors, openings) for JSON configurations
function createInterfaces() {
    if (!scene || deck_configuration !== 'json' || customInterfaces.length === 0) return;
    disposeMeshes(interfaceMeshes); // Clear old interfaces
    interfaceMeshes = [];

    customInterfaces.forEach(iface => {
        const { x, y, z = 0, width, height, thickness = 0.2, type } = iface; // z default to deck level
        const geom = new THREE.BoxGeometry(width, height, thickness);
        const mat  = new THREE.MeshStandardMaterial({
            color: type === 'door' ? 'saddlebrown' : 'darkgrey',
            transparent: true, opacity: 0.7, metalness: 0.1, roughness: 0.8
        });
        const mesh = new THREE.Mesh(geom, mat);
        // JSON coords might be absolute. Adjust if deck is centered at (0,0)
        // Assuming x,y from JSON are relative to deck center for this example
        mesh.position.set(x, y, z + thickness / 2); // Place base at z
        scene.add(mesh);
        interfaceMeshes.push(mesh);
    });
}

// Disposes of person geometries
function disposePersons() {
    if (persons && persons.length > 0) {
        const personGeometries = persons.map(p => p.geometry).filter(g => g);
        disposeMeshes(personGeometries);
    }
    persons = []; // Clear the array
}

// --- Controls Setup ---
function setupOrbitControls() {
    if (!camera || !renderer) return;
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true; orbitControls.dampingFactor = 0.1;
    orbitControls.target.set(0, 0, 0); // Target center of the scene
    orbitControls.enabled = true; // Enabled by default
}

function setupDragControls() {
    if (!camera || !renderer) return;
    if (compDragControls) compDragControls.dispose();
    if (MESdragControls) MESdragControls.dispose();

    compDragControls = new DragControls(compartmentsMeshes, camera, renderer.domElement);
    compDragControls.addEventListener('dragstart', () => orbitControls.enabled = false);
    compDragControls.addEventListener('drag', (event) => event.object.position.z = event.object.geometry.parameters.height / 2); // Keep on deck
    compDragControls.addEventListener('dragend', () => {
        orbitControls.enabled = true;
        compartmentsMeshes.forEach((mesh, i) => compartmentsBB[i].setFromObject(mesh));
        // Consider re-initializing persons or just re-rendering
        cancelAnimationFrame(animationId); 
        disposePersons(); 
        createPersons(no_persons); 
        renderer.render(scene, camera);
        document.getElementById("startSim").disabled = false;
    });
    compDragControls.enabled = false; // Initially disabled, enable with Ctrl

    MESdragControls = new DragControls([mustering].filter(m => m), camera, renderer.domElement); // Filter out if mustering is null
    MESdragControls.addEventListener('dragstart', () => orbitControls.enabled = false);
    MESdragControls.addEventListener('drag', (event) => event.object.position.z = event.object.geometry.parameters.height / 2); // Keep on deck
    MESdragControls.addEventListener('dragend', (event) => {
        orbitControls.enabled = true;
        mustering_inner.position.copy(event.object.position);
        MusteringBB.setFromObject(mustering_inner);
        cancelAnimationFrame(animationId); 
        disposePersons(); 
        createPersons(no_persons); 
        renderer.render(scene, camera);
        document.getElementById("startSim").disabled = false;
    });
    MESdragControls.enabled = false; // Initially disabled, enable with Ctrl
}

function setupControlKeyListeners() {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Control' || event.key === 'Meta') { // Meta for Mac Command key
            if (orbitControls) orbitControls.enabled = false;
            if (compDragControls) compDragControls.enabled = true;
            if (MESdragControls) MESdragControls.enabled = true;
        }
    });
    document.addEventListener('keyup', (event) => {
        if (event.key === 'Control' || event.key === 'Meta') {
            if (orbitControls) orbitControls.enabled = true;
            if (compDragControls) compDragControls.enabled = false;
            if (MESdragControls) MESdragControls.enabled = false;
        }
    });
}


// --- Person Class and Movement Logic ---
class Human {
    constructor(id, speed, color) {
        this.id = id;
        this.geometry = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 1.8, 16), // Cylinder for person
            new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.8 })
        );
        this.geometry.position.z = 1.8 / 2; // Base on deck
        this.speed = speed; // m/s
        this.BB = new THREE.Box3().setFromObject(this.geometry); // Bounding Box for collision
        this.movingUp = Math.random() < 0.5; // For obstacle avoidance
        this.stuckCount = 0;
        // Data recording arrays
        this.x = []; this.y = []; this.z = []; this.time = [];
        this.dist = 0; // Total distance moved
        scene.add(this.geometry);
        this.hasReachedInterface = false; // For JSON interface navigation
        this.currentCompartmentIndex = null; // For JSON interface navigation
        this.avoidingObstacle = false; // State for obstacle avoidance
    }
}

function getRandomPositionOnLimitedArea(limits) {
    const { minX, maxX, minY, maxY } = limits;
    const x = THREE.MathUtils.randFloat(minX, maxX);
    const y = THREE.MathUtils.randFloat(minY, maxY);
    return new THREE.Vector3(x, y, 0.9); // Spawn at person height / 2
}

function isPositionInsideAnyCompartment(position) {
    if (!compartmentsBB || compartmentsBB.length === 0) return false;
    return compartmentsBB.some(bb => bb.clone().expandByScalar(0.1).containsPoint(position)); // Slightly expanded check
}

function isPositionInMusteringStation(position) {
    if (!MusteringBB) return false;
    return MusteringBB.clone().expandByScalar(0.1).containsPoint(position); // Slightly expanded check
}

function createPersons(num) {
    disposePersons(); // Clear any existing persons
    num = Number(num);
    if (isNaN(num) || num <= 0) {
        console.warn("Invalid number of persons:", num, "Defaulting to 0.");
        num = 0;
        no_persons = 0; // Update global no_persons if it was invalid
    }

    const person_colors = ['#006400', '#008000', '#556B2F', '#228B22', '#2E8B57', '#808000', '#6B8E23', '#3CB371', '#32CD32', '#00FF00', '#00FF7F', '#00FA9A', '#8FBC8F', '#66CDAA', '#9ACD32', '#7CFC00', '#7FFF00', '#90EE90', '#ADFF2F', '#98FB98'];
    
    let PersonLocLimits; // Define spawn area limits
    if (!deckBB) createDeck(); // Ensure deckBB is available

    const margin = 1; // Margin from deck edges
    PersonLocLimits = {
        minX: deckBB.min.x + margin, maxX: deckBB.max.x - margin,
        minY: deckBB.min.y + margin, maxY: deckBB.max.y - margin
    };
    // Specific limits for 'test6' or other configurations can be added here
    if (deck_configuration === "test6") {
        PersonLocLimits = { minX: -5, maxX: -1, minY: -5, maxY: -3 }; // Example for test6
    }

    inMES = Array(num).fill(0); // Reset arrival status
    persons = []; // Initialize persons array

    for (let i = 0; i < num; i++) {
        let human = new Human(i, THREE.MathUtils.randFloat(2.5, 3.5), person_colors[i % person_colors.length]);
        let candidatePos;
        let attempts = 0;
        const maxAttempts = 200;

        // Simplified spawning logic for now, can be expanded as in original
        do {
            candidatePos = getRandomPositionOnLimitedArea(PersonLocLimits);
            human.geometry.position.copy(candidatePos); // Temporarily set position for BB update
            human.BB.setFromObject(human.geometry); // Update BB
            attempts++;
            if (attempts > maxAttempts) {
                console.warn(`Could not find valid spot for Person ${i} after ${maxAttempts} attempts. Placing at default.`);
                human.geometry.position.set(PersonLocLimits.minX, PersonLocLimits.minY, 0.9); // Fallback position
                break;
            }
        } while (isPositionInsideAnyCompartment(human.geometry.position) || isPositionInMusteringStation(human.geometry.position));
        
        persons.push(human);
    }
    console.log(`Created ${persons.length} persons.`);
}


function directMovement(person, personIndex) {
    if (!person || !person.geometry || !mustering_inner || !deckBB) return;

    const targetPosition = mustering_inner.position;
    const currentPosition = person.geometry.position;
    
    const direction = new THREE.Vector3().subVectors(targetPosition, currentPosition).normalize();
    const moveDistance = person.speed * deltaT;

    const proposedMove = direction.clone().multiplyScalar(moveDistance);
    const newPos = currentPosition.clone().add(proposedMove);
    newPos.z = person.geometry.position.z; // Keep person at their current Z height (on deck)

    // Create a bounding box for the new position to check for collisions
    const tempBB = person.BB.clone().translate(proposedMove);

    let collision = false;
    // Check collision with compartments
    for (let bb of compartmentsBB) {
        if (bb.intersectsBox(tempBB)) {
            collision = true;
            break;
        }
    }

    // Check collision with other persons (simplified: check distance)
    for (let otherPerson of persons) {
        if (otherPerson.id === person.id) continue;
        if (newPos.distanceTo(otherPerson.geometry.position) < 0.6) { // 0.6m personal space
            collision = true;
            break;
        }
    }
    
    if (!collision && deckBB.containsPoint(newPos)) {
        person.geometry.position.copy(newPos);
        person.avoidingObstacle = false; // No longer avoiding
        person.stuckCount = 0;
    } else { // Collision occurred or out of bounds
        person.avoidingObstacle = true;
        // Simple avoidance: try to move perpendicular to original direction
        const perpendicularMove = person.movingUp 
            ? new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(moveDistance)
            : new THREE.Vector3(direction.y, -direction.x, 0).multiplyScalar(moveDistance);
        
        const avoidancePos = currentPosition.clone().add(perpendicularMove);
        avoidancePos.z = person.geometry.position.z;
        const avoidanceBB = person.BB.clone().translate(perpendicularMove);

        let avoidanceCollision = false;
        for (let bb of compartmentsBB) {
            if (bb.intersectsBox(avoidanceBB)) {
                avoidanceCollision = true;
                break;
            }
        }
        // Add person-person collision check for avoidance too if needed

        if (!avoidanceCollision && deckBB.containsPoint(avoidancePos)) {
            person.geometry.position.copy(avoidancePos);
        } else {
            person.stuckCount++;
            if (person.stuckCount > 5) { // Try changing direction if stuck for too long
                person.movingUp = !person.movingUp;
                person.stuckCount = 0;
            }
        }
    }

    person.BB.setFromObject(person.geometry); // Update person's bounding box
    person.dist += person.geometry.position.distanceTo(currentPosition); // More accurate distance

    // Record data
    person.x.push(person.geometry.position.x);
    person.y.push(person.geometry.position.y);
    person.z.push(person.geometry.position.z); // Record Z, even if constant
    person.time.push(time_step);

    const distDisplay = document.getElementById("movment" + String(personIndex + 1));
    if (distDisplay) distDisplay.innerText = person.dist.toFixed(2);

    if (MusteringBB && MusteringBB.intersectsBox(person.BB)) {
        inMES[personIndex] = 1; // Person has arrived
    }
}

// interfaceAwareMovement can be complex; for now, ensure directMovement is robust
// function interfaceAwareMovement(person, i) { ... } // (As per your original script if needed)


function animate() {
    deltaT = clock.getDelta(); // Time since last frame
    time_step += deltaT;       // Accumulate simulation time

    if (orbitControls && orbitControls.enabled) {
        orbitControls.update();
    }

    let allInMES = true; // Assume all have arrived
    if (persons && persons.length > 0) {
        persons.forEach((person, i) => {
            if (inMES[i] === 0) { // If person i has not arrived
                allInMES = false; // At least one person is still moving
                // Choose movement strategy
                if (deck_configuration === 'json' && customInterfaces.length > 0 && !person.hasReachedInterface) {
                    // Implement interfaceAwareMovement or simplify for now
                    // For simplicity, using directMovement until interface logic is fully integrated
                    // interfaceAwareMovement(person, i); 
                    directMovement(person, i);
                } else {
                    directMovement(person, i);
                }
            }
        });
    } else {
        allInMES = false; // No persons, so not "all in MES" for enabling buttons
    }
    

    renderer.render(scene, camera);

    if (!allInMES && persons.length > 0) { // Continue if not all arrived AND there are persons
        animationId = requestAnimationFrame(animate);
    } else {
        console.log('Simulation complete or no persons to simulate.');
        document.getElementById('startSim').disabled = false;
        if (persons.length > 0) { // Only enable save/plot if there was a simulation
            document.getElementById('plotFigure').disabled = false;
            document.getElementById('saveResultCSV').disabled = false;
            document.getElementById('saveResultSingleCSV').disabled = false; // Enable new button
            document.getElementById('saveResultJSON').disabled = false;
        }
        cancelAnimationFrame(animationId);
    }
}

// --- Scene Management and UI Interaction ---

function resetScene() {
    console.log("Resetting scene for configuration:", deck_configuration);
    cancelAnimationFrame(animationId);
    time_step = 0; // Reset simulation time
    clock.stop(); // Stop the clock

    // Dispose of all relevant objects
    disposePersons();
    disposeMeshes([deck, mustering, mustering_inner, ...compartmentsMeshes, ...interfaceMeshes]);
    // Also dispose of gridHelper if added
    const gridHelper = scene.getObjectByProperty('type', 'GridHelper');
    if (gridHelper) disposeMeshes([gridHelper]);
    const ambientLight = scene.getObjectByProperty('type', 'AmbientLight');
    if (ambientLight) scene.remove(ambientLight);
    const directionalLight = scene.getObjectByProperty('type', 'DirectionalLight');
    if (directionalLight) scene.remove(directionalLight);


    compartmentsMeshes = []; interfaceMeshes = []; // Clear arrays

    initializeConfiguration(); // Re-initialize dimensions based on deck_configuration
    
    // Recreate scene elements
    // createScene(); // Renderer and camera might not need full recreation unless window resized
    createDeck();
    createCompartments();
    addMusteringStation();
    if (deck_configuration === 'json' && customInterfaces.length > 0) {
        createInterfaces();
    }
    
    no_persons = Number(document.getElementById('no_persons').value) || 0;
    createPersons(no_persons); // Create new persons
    updatePersonMovementDisplayUI(no_persons); // Update UI for person distances

    // setupDragControls(); // Re-setup drag controls for new objects
    
    requestAnimationFrame(() => { // Ensure DOM is ready for renderer and camera updates
        if (renderer) renderer.render(scene, camera);
        adjustCameraPosition();
    });

    // Disable result buttons
    document.getElementById("plotFigure").disabled = true;
    document.getElementById("saveResultCSV").disabled = true;
    document.getElementById("saveResultSingleCSV").disabled = true;
    document.getElementById("saveResultJSON").disabled = true;
    document.getElementById("startSim").disabled = false;
    document.getElementById("movment2D").style.display = "none"; // Hide plot
}

// Updates the "Person X movement length" UI elements
function updatePersonMovementDisplayUI(count) {
    const div = document.getElementById('IDresults');
    if (!div) return;
    div.innerHTML = ''; // Clear previous entries
    for (let i = 0; i < count; i++) {
        const para = document.createElement('div');
        para.innerText = "Person " + (i + 1) + " movement length: ";
        const span = document.createElement('span');
        span.id = "movment" + String(i + 1);
        span.innerText = "0.00"; // Initial display
        para.appendChild(span);
        div.appendChild(para);
    }
}


// Main initialization function
function init() {
    // Set initial deck configuration and number of persons from HTML
    deck_configuration = document.querySelector('input[name="options"]:checked').value || "simple";
    no_persons = Number(document.getElementById('no_persons').value) || 2;

    createScene(); // Create scene, camera, renderer
    initializeConfiguration(); // Set initial dimensions
    
    createDeck();
    createCompartments();
    addMusteringStation();
    if (deck_configuration === 'json' && customInterfaces.length > 0) {
       createInterfaces();
    }
    createPersons(no_persons);
    updatePersonMovementDisplayUI(no_persons);

    setupOrbitControls();
    setupDragControls(); // Call after objects are created
    setupControlKeyListeners();
    
    adjustCameraPosition();
    renderer.render(scene, camera);

    // Event listener for Start Simulation button
    document.getElementById("startSim").addEventListener("click", () => {
        document.getElementById("movment2D").style.display = "none"; // Hide plot
        document.getElementById("startSim").disabled = true;
        // Disable result buttons until simulation is complete
        document.getElementById("plotFigure").disabled = true;
        document.getElementById("saveResultCSV").disabled = true;
        document.getElementById("saveResultSingleCSV").disabled = true;
        document.getElementById("saveResultJSON").disabled = true;
        
        time_step = 0; // Reset simulation time
        deltaT = 0;
        inMES = Array(no_persons).fill(0); // Reset arrival status
        // Reset person data arrays and distance
        persons.forEach(p => { 
            p.x = []; p.y = []; p.z = []; p.time = []; p.dist = 0; 
            const distDisplay = document.getElementById("movment" + String(p.id + 1));
            if (distDisplay) distDisplay.innerText = "0.00";
        });

        clock.start(); // Start the animation clock
        animate();
    });

    // Event listeners for deck configuration radio buttons
    document.querySelectorAll('input[name="options"]').forEach((radio) => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === 'json' && !deckArrangement) {
                // If 'json' is selected but no file loaded yet, don't reset immediately.
                // loadGeometryFile will trigger resetScene.
                // Or, prompt user to select a file.
                // For now, just set deck_configuration. resetScene will be called by loadGeometryFile.
                deck_configuration = 'json'; 
            } else {
                deck_configuration = event.target.value;
                resetScene();
            }
        });
    });

    // Event listener for number of persons input change
    $("#no_persons").on("change", function() {
        const new_no_persons = Number(this.value) || 0;
        if (new_no_persons !== no_persons) {
            no_persons = new_no_persons;
            console.log("Number of persons changed to:", no_persons);
            resetScene(); // Reset scene with new number of persons
        }
    });

    // Event listener for window resize
    window.addEventListener('resize', () => {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(0.88 * window.innerWidth, 0.88 * window.innerHeight);
            adjustCameraPosition(); // Re-adjust camera on resize
            renderer.render(scene, camera);
        }
    });
     // Ensure geometry file input has its listener
    const geometryFileInput = document.getElementById('geometryFileInput');
    if (geometryFileInput) {
        geometryFileInput.addEventListener('change', loadGeometryFile);
    }
}

// --- Result Handling (Plotting and Saving) ---

$("#plotFigure").on("click", function() {
    if (!persons || persons.length === 0) {
        alert("No data to plot. Run simulation first.");
        return;
    }
    document.getElementById("movment2D").style.display = "block";
    let plotData = [];
    for (let i = 0; i < no_persons; i++) {
        if (persons[i] && persons[i].x && persons[i].y) {
            plotData.push({
                x: persons[i].x, y: persons[i].y,
                mode: 'lines', name: 'Person ' + String(i + 1)
            });
        }
    }
    Plotly.newPlot('movment2D', plotData, {title: 'Person Movement Paths'});
});

// Save results to individual CSVs, zipped together
$("#saveResultCSV").on("click", async function() {
    console.log("[SAVE CSV TO ZIP] Initiating. Persons:", no_persons);
    if (!persons || persons.length === 0) {
        alert("No data to save. Run simulation first."); return;
    }
    if (typeof JSZip === 'undefined') {
        alert("JSZip library not found. Cannot create ZIP file."); return;
    }

    var zip = new JSZip();
    for (let i = 0; i < no_persons; i++) {
        if (!persons[i]) continue;
        let csvContent = "time;x;y;z\n";
        if (persons[i].time && persons[i].x && persons[i].y && persons[i].z) {
            for (let j = 0; j < persons[i].time.length; j++) {
                const timeVal = persons[i].time[j] !== undefined ? persons[i].time[j].toFixed(3) : "N/A";
                const xVal = persons[i].x[j] !== undefined ? persons[i].x[j].toFixed(3) : "N/A";
                const yVal = persons[i].y[j] !== undefined ? persons[i].y[j].toFixed(3) : "N/A";
                const zVal = persons[i].z[j] !== undefined ? persons[i].z[j].toFixed(3) : "N/A";
                csvContent += `${timeVal};${xVal};${yVal};${zVal}\n`;
            }
        }
        zip.file(`movment_points_person_${i + 1}.csv`, csvContent);
    }

    try {
        const zipContent = await zip.generateAsync({ type: "blob" });
        let simDate = new Date();
        let dateStr = `${simDate.getFullYear()}${("0"+(simDate.getMonth()+1)).slice(-2)}${("0"+simDate.getDate()).slice(-2)}_${("0"+simDate.getHours()).slice(-2)}${("0"+simDate.getMinutes()).slice(-2)}`;
        saveAs(zipContent, `ship_evacuation_results_${dateStr}.zip`);
    } catch (error) {
        console.error("Error generating ZIP:", error); alert("Error creating ZIP file.");
    }
});

// NEW: Save all results to a single CSV file
$("#saveResultSingleCSV").on("click", function() {
    console.log("[SAVE SINGLE CSV] Initiating. Persons:", no_persons);
    if (!persons || persons.length === 0) {
        alert("No data to save. Run simulation first."); return;
    }

    let singleCsvContent = "time;person;x;y;z\n"; // Header

    for (let i = 0; i < no_persons; i++) {
        if (!persons[i]) continue;
        const personId = i + 1;
        if (persons[i].time && persons[i].x && persons[i].y && persons[i].z) {
            for (let j = 0; j < persons[i].time.length; j++) {
                const timeVal = persons[i].time[j] !== undefined ? persons[i].time[j].toFixed(3) : "N/A";
                const xVal = persons[i].x[j] !== undefined ? persons[i].x[j].toFixed(3) : "N/A";
                const yVal = persons[i].y[j] !== undefined ? persons[i].y[j].toFixed(3) : "N/A";
                const zVal = persons[i].z[j] !== undefined ? persons[i].z[j].toFixed(3) : "N/A";
                singleCsvContent += `${timeVal};${personId};${xVal};${yVal};${zVal}\n`;
            }
        }
    }
    let simDate = new Date();
    let dateStr = `${simDate.getFullYear()}${("0"+(simDate.getMonth()+1)).slice(-2)}${("0"+simDate.getDate()).slice(-2)}_${("0"+simDate.getHours()).slice(-2)}${("0"+simDate.getMinutes()).slice(-2)}`;
    var myFile = new File([singleCsvContent], `all_persons_movement_${dateStr}.csv`, {
        type: "text/plain;charset=utf-8"
    });
    saveAs(myFile);
});


$("#saveResultJSON").on("click", function() {
    // Basic JSON export: exports the 'persons' array which contains x,y,z,time for each.
    if (!persons || persons.length === 0) {
        alert("No data to save. Run simulation first.");
        return;
    }
    // Create a serializable version of persons data
    const exportData = persons.map(p => ({
        id: p.id,
        speed: p.speed,
        time: p.time,
        x: p.x,
        y: p.y,
        z: p.z,
        total_distance: p.dist
    }));

    const jsonData = JSON.stringify(exportData, null, 2); // Pretty print JSON
    let simDate = new Date();
    let dateStr = `${simDate.getFullYear()}${("0"+(simDate.getMonth()+1)).slice(-2)}${("0"+simDate.getDate()).slice(-2)}_${("0"+simDate.getHours()).slice(-2)}${("0"+simDate.getMinutes()).slice(-2)}`;
    var myFile = new File([jsonData], `ship_evacuation_data_${dateStr}.json`, {
        type: "application/json;charset=utf-8"
    });
    saveAs(myFile);
});

// --- Start Application ---
init();

