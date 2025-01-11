import * as THREE from 'three';
import {
    OrbitControls
} from 'three/addons/controls/OrbitControls.js';
import {
    DragControls
} from 'three/addons/controls/DragControls.js';



class Human {
    constructor(idname, speed, geometry, color) {
        this.idname = idname;
        this.speed = speed;
        this.geometry = geometry;
        this.color = color
        this.x = [];
        this.y = [];
        this.z = [];
        this.time = [];
        this.dist = 0;
        this.BB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function createEmptyScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(0.88 * window.innerWidth, 0.88 * window.innerHeight);
    document.querySelector("#movment3D").appendChild(renderer.domElement);
    
    scene.background = new THREE.Color(0xffffff);
    camera.position.z = 60;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.movementSpeed = 100;
    controls.rollSpeed = Math.PI / 24;
    controls.autoForward = 0;
    controls.dragToLook = true;
    let time_step=0;
    let deltaT = 0;
    return {
        scene,
        camera,
        renderer,
        controls
    };
};

function createDeck(deck_length,deck_width,deck_location_z) {
    let deck_array = [];
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deck_length, deck_width, 0.02), new THREE.MeshBasicMaterial({
        color: 'lightblue'
    }));
    deck.position.z = deck_location_z

    scene.add(deck);
    return {
        deck,
    };
};
const person_colors = ['#006400', '#008000', '#556B2F', '#228B22', '#2E8B57', '#808000', '#6B8E23', '#3CB371', '#32CD32', '#00FF00', '#00FF7F', '#00FA9A', '#8FBC8F', '#66CDAA', '#9ACD32', '#7CFC00', '#7FFF00', '#90EE90', '#ADFF2F', '#98FB98']


let deck_length=105.2;
let deck_width=34;
let deck_array = []
let person_size_x=0.4
let person_size_y=0.4

let deltaT = 0;
let clock = new THREE.Clock();
let time_step=0;
let persons = [];
let inMES = []

let init_vars_scene = createEmptyScene();
let scene = init_vars_scene.scene;
let camera = init_vars_scene.camera;
let renderer = init_vars_scene.renderer;
let controls = init_vars_scene.controls;
let init_vars_deck = createDeck(deck_length,deck_width,0);
let deck = init_vars_deck.deck;

function createPerson(no_persons) {
    for (let i = 0; i <= no_persons - 1; i++) {
        persons[i] = new Human(i + 1001, 3 + getRandomInt(3), new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.8), new THREE.MeshBasicMaterial({
            color: person_colors[i % person_colors.length],
        })));
        persons[i].speed = 1 + getRandomInt(4);
        persons[i].geometry.position.x =-30 + getRandomInt(5) - 2.5;
        persons[i].geometry.position.y = getRandomInt(18) - 8;
        persons[i].x[0] = persons[i].geometry.position.x;
        persons[i].y[0] = persons[i].geometry.position.y;
        persons[i].z[0] = persons[i].geometry.position.z;
        persons[i].time[0] = 0;
        persons[i].BB.setFromObject(persons[i].geometry);
        inMES[i] = 0;
    }

    for (let i = 0; i < no_persons; i++) {
        scene.add(persons[i].geometry);
    }
    return {persons};
}

persons=createPerson(10).persons;


function ShowDeck() {
    renderer.render(scene, camera);
  }


  //ShowDeck();
  requestAnimationFrame(animate);

  function animate() {
    deltaT = clock.getDelta();
    requestAnimationFrame(animate);
   
    for (let i = 0; i < persons.length; i++) {
        if (inMES[i] == 0) {
            persons[i].geometry.position.x = persons[i].geometry.position.x + deltaT * persons[i].speed;
            persons[i].x.push(persons[i].geometry.position.x);
            persons[i].y.push(persons[i].geometry.position.y);
            persons[i].z.push(persons[i].geometry.position.z);
            persons[i].time.push(time_step);
        }
    }

    renderer.render(scene, camera);
  controls.update();
  }