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
//    const controls = new OrbitControls(camera, renderer.domElement);
//    controls.movementSpeed = 100;
//    controls.rollSpeed = Math.PI / 24;
//    controls.autoForward = 0;
//    controls.dragToLook = true;
    let time_step=0;
    let deltaT = 0;
    return {
        scene,
        camera,
        renderer //,
 //       controls
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
//let controls = init_vars_scene.controls;
let init_vars_deck = createDeck(deck_length,deck_width,0);
let deck = init_vars_deck.deck;

function createPerson(no_persons) {
    for (let i = 0; i <= no_persons - 1; i++) {
        persons[i] = new Human(i + 1001, 3 + getRandomInt(3), new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.8), new THREE.MeshBasicMaterial({
            color: person_colors[i % person_colors.length],
        })));
        persons[i].speed = 5 + getRandomInt(4);
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

function addMusteringStation(mes_x,mes_y,mes_rows,mes_columns,deck_location_z) {
    // let mes_rows = 10;
    // let mes_columns = 5;
     const mustering = new THREE.Mesh(new THREE.BoxGeometry(mes_columns, mes_rows, 2.5), new THREE.MeshBasicMaterial({
        color: 'red',
        opacity: 0.5,
        transparent: true
    }));
     mustering.position.x = mes_x
     mustering.position.y = mes_y
     mustering.position.z = deck_location_z
     const MusteringBB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
     const mustering_inner = new THREE.Mesh(new THREE.BoxGeometry(mes_columns -1, mes_rows - 1, 2.5), new THREE.MeshBasicMaterial({
        color: 'red',
        opacity: 0.5,
        transparent: true
    }));
    mustering_inner.position.x = mes_x
    mustering_inner.position.y = mes_y
    mustering_inner.position.z = deck_location_z
     MusteringBB.setFromObject(mustering_inner);

     scene.add(mustering);
     renderer.setAnimationLoop(ShowDeck);
    return {
            mustering,
            mustering_inner,
            MusteringBB
        };
    }

persons=createPerson(10).persons;

let init_vars_mustering = addMusteringStation(50,0,10,5,0);
let mustering = init_vars_mustering.mustering;
let mustering_inner = init_vars_mustering.mustering_inner;
var  MusteringBB = init_vars_mustering.MusteringBB;

function ShowDeck() {
    renderer.render(scene, camera);
  }

  const dragControls = new DragControls([mustering], camera, renderer.domElement);
  dragControls.addEventListener('drag', function(event) {
      console.log('drag');
      mustering_inner.position.x = mustering.position.x;
      mustering_inner.position.y = mustering.position.y;
      mustering_inner.position.z = mustering.position.z;
      MusteringBB.setFromObject(mustering_inner);

      event.object.position.z = deck1_location_z; 

      // This will prevent moving z axis, but will be on 0 line. change this to your object position of z axis.
  })

 dragControls.addEventListener('dragend', function(event) {
    console.log('dragend');
    for (let i = 0; i < persons.length; i++) {
        scene.remove(persons[i].geometry);
    }
    persons=createPerson(no_persons).persons;
});
 //   dragControls.addEventListener('hoveron', function (event) { controls.enabled = false; });
 //   dragControls.addEventListener('hoveroff', function (event) { controls.enabled = true; });
 // controls.addEventListener('start', function (event) { dragControls.deactivate(); }); 
 // controls.addEventListener('end', function (event) { dragControls.activate(); });

  ShowDeck();
  requestAnimationFrame(animate);

  function animate() {
    deltaT = clock.getDelta();
    if (inMES.includes(0)) {
        requestAnimationFrame(animate);
    }
   
    for (let i = 0; i < persons.length; i++) {
        if (inMES[i] == 0) {
            const person_outer=new THREE.Mesh(new THREE.BoxGeometry(1.5*0.4, 1.5*0.4, 1.8), new THREE.MeshBasicMaterial({
                color: 'blue',
                opacity: 1,
                transparent: true
            }));
            scene.add(person_outer);
            person_outer.position.x=persons[i].geometry.position.x;
            person_outer.position.y=persons[i].geometry.position.y;
            person_outer.position.z=persons[i].geometry.position.z;
            let person_outerBB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
            person_outerBB.setFromObject(person_outer);

            let delta_mes_x=mustering_inner.position.x-persons[i].geometry.position.x;
            let delta_mes_y=mustering_inner.position.y-persons[i].geometry.position.y;
            let tgt=delta_mes_y/delta_mes_x;
            let angle=Math.atan(tgt);

            let prev_x = persons[i].geometry.position.x;
            let prev_y = persons[i].geometry.position.y;
            let prev_z = persons[i].geometry.position.z;
          
            let move=deltaT * persons[i].speed;
            let move_x=move*Math.cos(angle);
            let move_y=move*Math.sin(angle);

            persons[i].geometry.position.x = prev_x + move_x;
            persons[i].geometry.position.y = prev_y + move_y;

            persons[i].x.push(persons[i].geometry.position.x);
            persons[i].y.push(persons[i].geometry.position.y);
            persons[i].z.push(persons[i].geometry.position.z);
            persons[i].time.push(time_step);
            persons[i].BB.setFromObject(persons[i].geometry);
            scene.remove(person_outer);
            if (MusteringBB.intersectsBox(persons[i].BB)) {
                inMES[i] = 1;
            }
        }
    }

    renderer.render(scene, camera);
  //controls.update();
  }