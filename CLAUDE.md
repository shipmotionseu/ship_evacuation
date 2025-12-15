# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ship Evacuation is a browser-based 3D simulation tool for modeling person movement in ship corridors and evacuation scenarios. The simulation uses Three.js for 3D visualization, Plotly for 2D path plotting, and jQuery for UI interactions.

## Architecture

### Core Files

- `index.html` - Main HTML entry point with UI controls and library imports
- `src/script.js` - Primary simulation engine (active/current version)
- `src/script2.js` - Alternative/experimental version
- `src/script_org.js` - Original implementation (reference)

### Dependencies

The project uses:
- **Three.js** (local copy in `three.js-master/`) - 3D rendering and scene management
- **Plotly.js** (CDN) - 2D path visualization
- **jQuery** (CDN) - DOM manipulation and event handling
- **FileSaver.js** (CDN) - CSV export functionality
- **JSZip** (CDN) - Archive creation

### Deck Configurations

The simulation supports three deck configuration modes:

1. **Simple deck** (`deck_configuration = "simple"`)
   - Default 5-compartment rectangular layout
   - Fixed dimensions: 105.2 x 34 meters
   - Persons spawn randomly across the deck (avoiding compartments)

2. **Test 6 - L-shape** (`deck_configuration = "test6"`)
   - MSC.1/Circ.1533 Test 6 compliance (corner rounding test)
   - Single compartment in 12 x 12 meter deck
   - Persons spawn in bottom-left 4x2 meter area

3. **Custom JSON** (`deck_configuration = "json"`)
   - User-loaded geometry from JSON file
   - Supports custom compartments, mustering stations, and interfaces (doors)
   - Persons can spawn inside compartments if interfaces are defined
   - Interface-aware pathfinding when doors are present

### JSON Geometry Schema

Custom geometries are loaded via JSON with this structure:

```json
{
  "arrangements": {
    "deck": {
      "attributes": { "length": 105.2, "width": 34 }
    },
    "compartments": {
      "MusteringStation": {
        "attributes": { "x": 105, "y": 17, "length": 5, "width": 10 }
      },
      "Comp1": {
        "attributes": {
          "x": -30, "y": -5, "rotation": 0,
          "length": 10, "width": 20, "height": 2,
          "color": "yellow"
        }
      }
    },
    "interfaces": {
      "Door1": {
        "attributes": {
          "x": 10, "y": 5, "z": 0,
          "width": 2, "height": 2, "thickness": 0.1,
          "type": "door",
          "connects": ["Comp1", "deck"]
        }
      }
    }
  }
}
```

### Movement Logic

The simulation uses two pathfinding modes:

**Direct Movement** (`directMovement()`)
- Vector-based navigation toward mustering station
- Collision detection with compartment bounding boxes
- Vertical obstacle avoidance when blocked
- Used for: simple/test6 decks, JSON decks without interfaces, or after exiting compartments

**Interface-Aware Movement** (`interfaceAwareMovement()`)
- Active when person starts inside a compartment with defined door
- First navigates to the interface/door position
- Switches to direct movement after reaching door
- Uses `person.hasReachedInterface` flag to track state
- Temporarily retargets `mustering_inner` position to door location

### Interaction Controls

- **Mouse drag** (default) - OrbitControls for scene rotation
- **Ctrl/Cmd + drag** - DragControls for moving compartments and mustering station
- Dragging updates bounding boxes and regenerates persons
- Controls toggle via `setupControlKeyListeners()`

### Person Class

Each `Human` instance tracks:
- `geometry` - Three.js mesh (0.5 x 0.5 x 1.8 box)
- `speed` - Random velocity (3-5 m/s)
- `dist` - Total distance traveled
- `x`, `y`, `z`, `time` - Position history arrays
- `currentCompartmentIndex` - Which compartment they're inside
- `hasReachedInterface` - Whether they've exited via door

### Scene Management

Key functions:
- `resetScene()` - Disposes all meshes, reinitializes configuration, recreates scene
- `disposeMeshes()` / `disposePersons()` - Proper cleanup to prevent memory leaks
- `adjustCameraPosition()` - Auto-fits camera based on deck size
- `animate()` - Main render loop, continues until all persons reach mustering station

## Development Workflow

### Running the Application

Open `index.html` in a modern browser. No build step required - all dependencies are loaded via CDN or local files.

### Testing Different Scenarios

1. Adjust "Number of persons" input (1-50)
2. Select deck configuration via radio buttons
3. For custom JSON: click "Custom geometry" radio to trigger file picker
4. Click START to begin simulation
5. After completion, use "Plot results!" or "Save results to CSV!"

### Key Global Variables

- `no_persons` - Number of persons in simulation
- `deck_configuration` - Current mode: "simple", "test6", or "json"
- `persons[]` - Array of Human instances
- `compartmentsBB[]` - Bounding boxes for collision detection
- `deckArrangement` - Parsed JSON for custom geometries
- `customInterfaces[]` - Door/interface definitions from JSON
- `interfaceCompNames` - Set of compartment names that have doors

### Plot Configuration

2D plot settings (line 827-845):
- Default: 1750 x 700 px display
- Export: 3500 x 1400 px at 4x scale for high DPI
- Format: PNG via Plotly's toImageButtonOptions

### Known Behaviors

- Person 0 in JSON mode with interfaces will spawn inside an interface-connected compartment
- Other persons spawn on open deck areas
- Collision detection uses bounding boxes expanded by 1 unit
- Movement records position every frame for path visualization
- CSV export creates separate file per person with columns: time;x;y;z

## File Organization

```
/
├── index.html              # Main entry point
├── src/
│   ├── script.js          # Primary simulation (USE THIS)
│   ├── script2.js         # Alternative version
│   └── script_org.js      # Original reference
└── three.js-master/
    ├── build/
    │   └── three.module.js
    └── examples/jsm/       # Three.js addons (OrbitControls, DragControls)
```

## Coordinate System

- Deck is centered at origin (0, 0, 0)
- JSON coordinates are absolute; converted to centered coords via: `x - deck_length/2`, `y - deck_width/2`
- Z-axis: deck at z=0, compartments at z=1, persons at z=0 (base)
- Mustering station uses inner bounding box (1 meter margin) for arrival detection
