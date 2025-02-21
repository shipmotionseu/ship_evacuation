import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

var numPersons = 1

class Human {
    constructor(idname, speed, geometry, color) {
        this.idname = idname;
        this.speed = speed;
        this.geometry = geometry;
        this.color = color;
        this.BB = new THREE.Box3().setFromObject(geometry);
        this.movingUp = Math.random() < 0.5; // Decide initial vertical direction
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function createScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 60;

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth * 0.88, window.innerHeight * 0.88);
    document.querySelector("#movment3D").appendChild(renderer.domElement);

    return { scene, camera, renderer };
}

function createDeck(scene) {
    const deck = new THREE.Mesh(
        new THREE.BoxGeometry(105.2, 34, 0.02),
        new THREE.MeshBasicMaterial({ color: 'lightblue' })
    );
    scene.add(deck);
    return new THREE.Box3().setFromObject(deck);
}

function createObstacles(scene) {
    const obstacles = [];
    const obstacleMeshes = [];
    const positions = [
        { x: -30, y: -5 }, { x: -15, y: 6 }, { x: 15, y: -7 },
        { x: 30, y: 11 }, { x: 0, y: -11 }
    ];
    positions.forEach(pos => {
        const obstacle = new THREE.Mesh(
            new THREE.BoxGeometry(10, 20, 2),
            new THREE.MeshBasicMaterial({ color: 'yellow' })
        );
        obstacle.position.set(pos.x, pos.y, 0);
        scene.add(obstacle);
        obstacles.push(new THREE.Box3().setFromObject(obstacle));
        obstacleMeshes.push(obstacle);
    });
    return { obstacles, obstacleMeshes };
}

function createPersons(scene, numPersons) {
    const persons = [];
    for (let i = 0; i < numPersons; i++) {
        const geometry = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 1.8),
            new THREE.MeshBasicMaterial({ color: '#008000' })
        );
        geometry.position.set(-40 + getRandomInt(5), getRandomInt(34) - 17, 0);
        scene.add(geometry);
        persons.push(new Human(i + 1, 10 + getRandomInt(3), geometry, '#008000'));
    }
    return persons;
}

function animate(scene, camera, renderer, persons, obstacles, deckBB) {
    function movePersons() {
        persons.forEach(person => {
            let moveStep = person.speed * 0.01;
            let newPos = person.geometry.position.clone().add(new THREE.Vector3(moveStep, 0, 0));
            let newBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(moveStep, 0, 0));
            let collision = obstacles.some(obstacle => obstacle.intersectsBox(newBB));

            if (!collision && deckBB.containsPoint(newPos)) {
                person.geometry.position.copy(newPos);
            } else {
                let verticalMove = person.movingUp ? moveStep : -moveStep;
                let testPos = person.geometry.position.clone().add(new THREE.Vector3(0, verticalMove, 0));
                let testBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(0, verticalMove, 0));

                if (obstacles.some(obstacle => obstacle.intersectsBox(testBB)) || !deckBB.containsPoint(testPos)) {
                    person.movingUp = !person.movingUp; // Switch direction
                    verticalMove = person.movingUp ? moveStep : -moveStep;
                    testPos = person.geometry.position.clone().add(new THREE.Vector3(0, verticalMove, 0));
                }

                if (deckBB.containsPoint(testPos)) {
                    person.geometry.position.copy(testPos);
                }
            }
        });
        renderer.render(scene, camera);
        requestAnimationFrame(movePersons);
    }
    movePersons();
}

const { scene, camera, renderer } = createScene();
const deckBB = createDeck(scene);
const { obstacles, obstacleMeshes } = createObstacles(scene);
let persons = [];

const dragControls = new DragControls(obstacleMeshes, camera, renderer.domElement);
dragControls.addEventListener('dragstart', function (event) {
    event.object.material.opacity = 0.5;
});
dragControls.addEventListener('dragend', function (event) {
    event.object.material.opacity = 1.0;

    // Update the bounding boxes after drag
    const index = obstacleMeshes.indexOf(event.object);
    if (index !== -1) {
        obstacles[index].setFromObject(event.object);
    }
});

document.getElementById("startSim").addEventListener("click", function() {
    persons.forEach(person => scene.remove(person.geometry));
    persons = createPersons(scene, numPersons);
    animate(scene, camera, renderer, persons, obstacles, deckBB);
});

document.getElementById("no_persons").addEventListener("change", function() {
    numPersons = parseInt(this.value);
    // persons.forEach(person => scene.remove(person.geometry));
    // persons = createPersons(scene, numPersons);
});
