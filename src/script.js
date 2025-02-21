import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

class Human {
    constructor(idname, speed, geometry, color) {
        this.idname = idname;
        this.speed = speed;
        this.geometry = geometry;
        this.color = color;
        this.BB = new THREE.Box3().setFromObject(geometry);
        this.movingUp = Math.random() < 0.5;
        this.avoidingObstacle = false;
        this.stuckCount = 0;
        this.distanceTraveled = 0;
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function createScene() {
    const scene = new THREE.Scene();

    // debugger

    var width = document.querySelector("#movment3D").getBoundingClientRect().width
    var height = document.querySelector("#movment3D").getBoundingClientRect().height

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 60;

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
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
        { x: -30, y: -5 }, { x: -15, y: 6 }, { x: 0, y: -7 },
        { x: 15, y: 11 }, { x: 30, y: -11 }
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

function createGoal(scene) {
    const goal = new THREE.Mesh(
        new THREE.BoxGeometry(5, 10, 2),
        new THREE.MeshBasicMaterial({ color: 'red' })
    );
    goal.position.set(55, 0, 0);
    scene.add(goal);
    return new THREE.Box3().setFromObject(goal);
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
        persons.push(new Human(i + 1, 25 + getRandomInt(3), geometry, '#008000'));
    }
    return persons;
}

function animate(scene, camera, renderer, persons, obstacles, deckBB, goalBB) {
    function movePersons() {




        persons = persons.filter(person => {
            let moveStep = person.speed * 0.01;
            let newPos = person.geometry.position.clone().add(new THREE.Vector3(moveStep, 0, 0));
            let newBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(moveStep, 0, 0));
            let collision = obstacles.some(obstacle => obstacle.intersectsBox(newBB));

            if (goalBB.intersectsBox(newBB)) {
            	document.getElementById("FinishedResults").innerHTML += `<p>Person ${person.idname} traveled: ${person.distanceTraveled.toFixed(2)} units</p>`;
                scene.remove(person.geometry);
                return false;
            }

            if (!collision && deckBB.containsPoint(newPos)) {
                person.geometry.position.copy(newPos);
                person.distanceTraveled += moveStep;
                person.avoidingObstacle = false;
                person.stuckCount = 0;
            } else {
                if (!person.avoidingObstacle) {
                    person.movingUp = Math.random() < 0.5;
                    person.avoidingObstacle = true;
                }

                let verticalMove = person.movingUp ? moveStep : -moveStep;
                let testPos = person.geometry.position.clone().add(new THREE.Vector3(0, verticalMove, 0));
                let testBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(0, verticalMove, 0));

                if (!obstacles.some(obstacle => obstacle.intersectsBox(testBB)) && deckBB.containsPoint(testPos)) {
                    person.geometry.position.copy(testPos);
                    person.distanceTraveled += moveStep;
                    person.stuckCount = 0;
                } else {
                    person.stuckCount++;
                    if (person.stuckCount > 10) {
                        person.movingUp = !person.movingUp;
                        person.stuckCount = 0;
                    }
                }
            }
            return true;
        });

        document.getElementById("IDresults").innerHTML =  persons.map( person => `<p>Person ${person.idname} traveled: ${person.distanceTraveled.toFixed(2)} units</p>` ).join('');

        renderer.render(scene, camera);
        // if (persons.length > 0) {
            requestAnimationFrame(movePersons);
        // } else {
        //     console.log("All persons have reached the goal. Simulation complete.");
        // }
    }
    movePersons();
}

const { scene, camera, renderer } = createScene();
const deckBB = createDeck(scene);
const { obstacles, obstacleMeshes } = createObstacles(scene);
const goalBB = createGoal(scene);
let persons = [];

const dragControls = new DragControls(obstacleMeshes, camera, renderer.domElement);
dragControls.addEventListener('dragstart', function (event) {
    event.object.material.opacity = 0.5;
});
dragControls.addEventListener('dragend', function (event) {
    event.object.material.opacity = 1.0;

    const index = obstacleMeshes.indexOf(event.object);
    if (index !== -1) {
        obstacles[index].setFromObject(event.object);
    }
});
let numPersons = 1;

document.getElementById("IDresults").innerHTML = "";
document.getElementById("FinishedResults").innerHTML = "";
persons.forEach(person => scene.remove(person.geometry));
persons = createPersons(scene, 1);

document.getElementById("startSim").addEventListener("click", function() {
    document.getElementById("IDresults").innerHTML = "";
    document.getElementById("FinishedResults").innerHTML = "";
    persons.forEach(person => scene.remove(person.geometry));
    persons = createPersons(scene, numPersons);
    animate(scene, camera, renderer, persons, obstacles, deckBB, goalBB);
});

document.getElementById("startSim").addEventListener("change", function() {
    document.getElementById("IDresults").innerHTML = "";
    document.getElementById("FinishedResults").innerHTML = "";
    persons.forEach(person => scene.remove(person.geometry));
    persons = createPersons(scene, numPersons);
    animate(scene, camera, renderer, persons, obstacles, deckBB, goalBB);
});

document.getElementById("no_persons").addEventListener("click", function() {
    numPersons = parseInt(this.value);
});
