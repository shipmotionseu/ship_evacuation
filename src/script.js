import * as THREE from 'three';
import {
    OrbitControls
} from 'three/addons/controls/OrbitControls.js';
import {
    DragControls
} from 'three/addons/controls/DragControls.js';

function createEmptyScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(0.88 * window.innerWidth, 0.88 * window.innerHeight);
    document.querySelector("#movment3D").appendChild(renderer.domElement);

    scene.background = new THREE.Color(0xffffff);
    camera.position.z = 80;
    return {
        scene,
        camera,
        renderer
    };
};

function createDeck(deck_length,deck_width,deck_location_z,cell_x,cell_y) {
    let deck_array = [];
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deck_length*cell_x, deck_width*cell_y, 0.02), new THREE.MeshBasicMaterial({
        color: 'lightblue'
    }));
    deck.position.z = deck_location_z - (2.5 / 2)
    for (let i = 0; i < deck_length + 1; i++) {
        deck_array[i] = [];
        for (let j = 0; j < deck_width + 1; j++) {
            deck_array[i][j] = -1;
        }
    }
    return {
        deck,
        deck_array
    };
    scene.add(deck);
};

let deck_length=35
let deck_width=20

let cell_x=0.4
let cell_y=0.4

let init_vars_scene = createEmptyScene();
let scene = init_vars_scene.scene;
let camera = init_vars_scene.camera;
let renderer = init_vars_scene.renderer;
let init_vars_deck = createDeck(deck_length,deck_width,0,cell_x,cell_y);


function ShowDeck() {
    renderer.render(scene, camera);
  }