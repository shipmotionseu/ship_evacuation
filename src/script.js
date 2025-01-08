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
    camera.position.z = 30;
    return {
        scene,
        camera,
        renderer
    };
};

function createDeck(deck_length,deck_width,deck_location_z,cell_x,cell_y) {
    let deck_array = [];
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deck_length, deck_width, 0.02), new THREE.MeshBasicMaterial({
        color: 'lightblue'
    }));
    deck.position.z = deck_location_z - (2.5 / 2)
    let deck_length_cell=deck_length*cell_x;
    let deck_width_cell=deck_width*cell_y;
    for (let i = 0; i < deck_length + 1; i++) {
        deck_array[i] = [];
        for (let j = 0; j < deck_width + 1; j++) {
            deck_array[i][j] = -1;
        }
    }
    scene.add(deck);
    return {
        deck,
        deck_array
    };
};

function createMustering(mustering_x_begin,mustering_x_end, mustering_y_begin, mustering_y_end,deck_array)
{
    let mustering_array = [];
    mustering_array = JSON.parse(JSON.stringify(deck_array))
    let mustering = new THREE.Mesh(new THREE.BoxGeometry(mustering_x_end-mustering_x_begin, mustering_y_end-mustering_y_begin, 0.02), new THREE.MeshBasicMaterial({
        color: 'red'
    }));
    mustering.position.x = mustering_x_begin + (mustering_x_end-mustering_x_begin)/2
    mustering.position.y = mustering_y_begin + (mustering_y_end-mustering_y_begin)/2

    for (let i = mustering_x_begin; i < mustering_x_end + 1; i++) {
        for (let j = mustering_y_begin; j < mustering_y_end + 1; j++) {
            mustering_array[i][j] = 1;
        }
    }
    scene.add(mustering);
    
    return {
        mustering,
        mustering_array
    };
};

let deck_length=45;
let deck_width=35;
let deck_array = []
let cell_x=0.4
let cell_y=0.4

let init_vars_scene = createEmptyScene();
let scene = init_vars_scene.scene;
let camera = init_vars_scene.camera;
let renderer = init_vars_scene.renderer;
let init_vars_deck = createDeck(deck_length,deck_width,0,cell_x,cell_y);
let deck = init_vars_deck.deck;
deck_array = JSON.parse(JSON.stringify(init_vars_deck.deck_array))

let mustering_x_begin=1;
let mustering_x_end=1;
let mustering_y_begin=7;
let mustering_y_end=8;

let init_vars_mustering = createMustering(mustering_x_begin,mustering_x_end, mustering_y_begin, mustering_y_end,deck_array);
deck_array = JSON.parse(JSON.stringify(init_vars_mustering.mustering));


function ShowDeck() {
    renderer.render(scene, camera);
  }


  ShowDeck();
