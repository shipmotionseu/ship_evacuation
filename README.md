## 1. Overview
**Description:**
The **Ship Evacuation** tool simulates the movement of persons in a ship corridor or complex deck arrangement. It allows users to visualize passenger flow in a 3D environment (Three.js) and analyze trajectory data via 2D plots (Plotly).

**Purpose:**
This tool is designed for educational demonstrations and preliminary evacuation analysis. It supports simplified deck geometries, specific regulatory test cases (e.g., IMO MSC.1/Circ.1533 Test 6), and complex custom geometries loaded via JSON. It calculates movement based on vector logic and collision avoidance algorithms.

## 2. File Structure
The project consists of the following structure:
- `index.html`: The main entry point, UI layout, and library imports.
- `src/`: Directory containing logic scripts.
  - `layout_loader.js`: Handles the parsing of custom geometry JSON files and event dispatching.
  - `script.js`: Contains the core simulation engine, including 3D rendering, agent behavior, collision detection, and result generation.

---

## 3. Detailed Component Description

### A. index.html
**Role:** Sets up the DOM structure, imports visualization libraries (Three.js, Plotly, jQuery), and defines the user control interface.

**Key Elements:**
* **Visualization Containers:**
    * `movment3D`: Container for the Three.js WebGL renderer (Real-time simulation).
    * `movment2D`: Container for the Plotly graph (Post-simulation trajectory analysis).
* **Inputs & Controls:**
    * `no_persons`: Number input (Min: 1, Max: 50) defining the agent count.
    * **Radio Group `options`:** Selects the deck configuration:
        * *Simple deck:* Standard rectangular corridor.
        * *L-shape deck:* Corresponds to **IMO MSC.1/Circ.1533 Test 6** (Rounding corners).
        * *Custom geometry:* Triggers `loadGeometryFile` to parse an uploaded JSON layout.
* **Dependencies:**
    * **Three.js:** For 3D rendering and scene graph management.
    * **Plotly:** For plotting 2D trajectory results.
    * **FileSaver.js:** For exporting CSV data.

### B. src/layout_loader.js
**Role:** A dedicated module for handling file input and parsing JSON geometry data asynchronously.

**Key Functions:**

#### `loadGeometryFile(event)`
* **Description:** Triggered by the file input change event. It reads the file using `FileReader`, parses the JSON content, and dispatches a custom window event to notify the main script.
* **Logic:**
    1. Prevents re-entrant calls using the `geometryLoadInProgress` flag.
    2. Parses `e.target.result` into `deckArrangement`.
    3. Dispatches: `window.dispatchEvent(new CustomEvent('shipEvacuation:geometryLoaded', ...))`.

### C. src/script.js
**Role:** The core engine handling initialization, the render loop, agent behavior (AI), and collision physics.

**Key Classes & Algorithms:**

#### 1. `class PolygonBoundingBox`
* **Description:** A custom collision system for non-rectangular compartments. It replaces standard Axis-Aligned Bounding Boxes (AABB) with polygon ray-casting logic.
* **Scientific Logic (Ray Casting):**
    To determine if a point $P(x, y)$ lies within a compartment polygon defined by vertices $V_0, V_1, \dots, V_n$, the script implements the **Ray Casting algorithm** (Jordan Curve Theorem).
    
    The condition checks if a ray projected from $P$ intersects the polygon edges an odd number of times:
    $$\text{intersect} = ((y_i > y_P) \neq (y_j > y_P)) \land \left( x_P < \frac{(x_j - x_i)(y_P - y_i)}{(y_j - y_i)} + x_i \right)$$
    Where $(x_i, y_i)$ and $(x_j, y_j)$ are the vertices of the polygon edge being tested.

#### 2. `directMovement(person, i)`
* **Description:** Calculates the movement vector for an agent toward their assigned Mustering Station (MES).
* **Logic:**
    1. Calculates the angle $\theta$ between the agent and the target:
       $$\theta = \arctan2(\Delta y, \Delta x)$$
    2. Determines the displacement vector $\vec{d}$ based on time step $\Delta t$ and speed $S$:
       $$\vec{d} = (S \cdot \Delta t \cdot \cos\theta, \quad S \cdot \Delta t \cdot \sin\theta)$$
    3. **Collision Detection:** A tentative new position is calculated. If `intersectsBox` returns true for any compartment (excluding the one the agent is currently inside), the movement is blocked, and an avoidance routine (randomized vertical oscillation) is triggered.

#### 3. `interfaceAwareMovement(person, i)`
* **Description:** Implements a hierarchical pathfinding logic for complex JSON geometries.
* **Logic:**
    If an agent is inside a compartment with a defined "Interface" (Door):
    1. The target is temporarily switched from the global Mustering Station to the **Interface coordinate** $(x_{door}, y_{door})$.
    2. Once the distance to the door $< 0.5m$, the agent state updates to `hasReachedInterface = true`.
    3. The agent then resumes `directMovement` toward the global Mustering Station.

#### 4. `animate()`
* **Description:** The main simulation loop utilizing `requestAnimationFrame`.
* **Flow:**
    1. Calculates `deltaT` via `THREE.Clock`.
    2. Iterates through the `persons` array.
    3. Selects movement logic:
       * If `deck_configuration == 'simple'`: Uses `directMovement`.
       * If `deck_configuration == 'json'`: Checks if `interfaceAwareMovement` is required.
    4. Renders the scene via `renderer.render(scene, camera)`.
    5. Stops when all agents have reached the Mustering Station (`inMES` array check).

---

## 4. Usage Instructions
1.  **Select Configuration:** Choose "Simple", "L-shape" (for IMO Test 6), or "Custom JSON".
2.  **Define Agents:** Enter the number of persons in the simulation input field.
3.  **Start:** Click the **START** button to initialize the 3D WebGL visualization.
4.  **Interact:**
    * **Left Click + Drag:** Rotate the camera (OrbitControls).
    * **Ctrl + Left Click + Drag:** Move compartments or Mustering Stations (DragControls).
5.  **Analyze:** Once all agents reach the red zone, click **Plot results!** to generate the 2D path analysis or **Save results to CSV!** for raw data export.

## 5. Mathematical/Scientific References
* **IMO MSC.1/Circ.1533:** *Revised Guidelines on Evacuation Analysis for New and Existing Passenger Ships*. (Specifically Test Case 6: Rounding Corners).
* **Ray Casting Algorithm:** Used for the `pointInPolygon2D` function to determine containment within irregular architectural spaces.
* **Vector Mechanics:** Agent movement is derived using Euclidean distance and trigonometric vector decomposition: $\vec{v} = v \cdot \hat{u}$.