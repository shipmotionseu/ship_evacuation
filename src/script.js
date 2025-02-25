import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

let no_compartments = 5;
let compartments = [], compartmentsBB = [], compartmentsMeshes = [];
let animationId, scene, camera, renderer, deck, deckBB, mustering, mustering_inner, MusteringBB;
let persons = [], inMES = [];
let compDragControls, MESdragControls;

let deck_configuration = "simple";
let mes_x_global, mes_y_global, mes_width, mes_length, deck_length, deck_width;
let deltaT = 0;
const clock = new THREE.Clock();
let time_step = 0;

function initializeConfiguration() {
    if (deck_configuration === "simple") {
        mes_x_global = 105;
        mes_y_global = 17;
        mes_width = 10;
        mes_length = 5;
        deck_length = 105.2;
        deck_width = 34;
    } else {
        mes_x_global = 11;
        mes_y_global = 0;
        mes_width = 2;
        mes_length = 2;
        deck_length = 13;
        deck_width = 14;
    }
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
    meshes.forEach((mesh) => {
        if (mesh) {
            scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach((mat) => mat.dispose());
                else mesh.material.dispose();
            }
        }
    });
}

function createDeck() {
    deck = new THREE.Mesh(
        new THREE.BoxGeometry(deck_length, deck_width, 0.02),
        new THREE.MeshBasicMaterial({ color: 'lightblue' })
    );
    deck.position.z = 0;
    deckBB = new THREE.Box3().setFromObject(deck);
    scene.add(deck);
}

function getCompartmentConfiguration(config) {
    return config === "simple"
        ? {
              comp_x: [-30, -15, 20, 20, -5],
              comp_y: [-5, 6, -5, 9, -11],
              compy_angle: [0, 0, 0, 90, 90],
              comp_length: [10, 10, 10, 10, 10],
              comp_width: [20, 20, 20, 20, 20],
              comp_height: [2, 2, 2, 2, 2],
          }
        : {
              comp_x: [-25, -10, 15, 20, -2],
              comp_y: [-6, 8, -3, 11, -9],
              compy_angle: [0, 0, 0, 90, 90],
              comp_length: [12, 14, 10, 8, 10],
              comp_width: [18, 20, 22, 20, 18],
              comp_height: [2, 2, 2, 2, 2],
          };
}

function createCompartments() {
    const config = getCompartmentConfiguration(deck_configuration);
    compartments = [];
    compartmentsBB = [];
    compartmentsMeshes = [];

    for (let i = 0; i < no_compartments; i++) {
        const compartment = new THREE.Mesh(
            new THREE.BoxGeometry(config.comp_length[i], config.comp_width[i], config.comp_height[i]),
            new THREE.MeshBasicMaterial({ color: 'yellow' })
        );
        compartment.position.set(config.comp_x[i], config.comp_y[i], 1);
        compartment.rotation.z = (Math.PI * config.compy_angle[i]) / 180.0;
        scene.add(compartment);

        compartmentsMeshes.push(compartment);
        compartmentsBB.push(new THREE.Box3().setFromObject(compartment));
    }
}

function addMusteringStation() {
    mustering = new THREE.Mesh(
        new THREE.BoxGeometry(mes_width, mes_length, 2.5),
        new THREE.MeshBasicMaterial({ color: 'red', opacity: 0.5, transparent: true })
    );
    mustering.position.set(mes_x_global - deck_length / 2, mes_y_global - deck_width / 2, 0);

    mustering_inner = new THREE.Mesh(
        new THREE.BoxGeometry(mes_width - 1, mes_length - 1, 2.5),
        new THREE.MeshBasicMaterial({ color: 'red', opacity: 0.5, transparent: true })
    );
    mustering_inner.position.copy(mustering.position);
    MusteringBB = new THREE.Box3().setFromObject(mustering_inner);

    scene.add(mustering);
}

function setupDragControls() {
    if (compDragControls) compDragControls.dispose();
    if (MESdragControls) MESdragControls.dispose();

    compDragControls = new DragControls(compartmentsMeshes, camera, renderer.domElement);
    compDragControls.addEventListener('dragend', () => {
        compartmentsMeshes.forEach((mesh, i) => compartmentsBB[i].setFromObject(mesh));
    });

    MESdragControls = new DragControls([mustering], camera, renderer.domElement);
    MESdragControls.addEventListener('dragend', (event) => {
        mustering_inner.position.copy(event.object.position);
        MusteringBB.setFromObject(mustering_inner);
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
    }
}


function createPersons(num) {
    const person_colors = ['#006400', '#008000', '#556B2F', '#228B22', '#2E8B57', '#808000', '#6B8E23', '#3CB371', '#32CD32', '#00FF00', '#00FF7F', '#00FA9A', '#8FBC8F', '#66CDAA', '#9ACD32', '#7CFC00', '#7FFF00', '#90EE90', '#ADFF2F', '#98FB98']

    inMES = Array(num).fill(0);
    persons = Array.from({ length: num }, (_, i) => {
        let human = new Human(i, 3 + Math.random() * 2, person_colors[i % person_colors.length]);
        // Assign a random starting position within the deck boundaries:
        human.geometry.position.set(
            -deck_length/2 + Math.random() * deck_length,
            -deck_width/2 + Math.random() * deck_width,
            0
        );
        return human;
    });
}
function animate() {
    deltaT = clock.getDelta();
    time_step += deltaT;  // update once per frame

    if (inMES.includes(0)) {
        animationId = requestAnimationFrame(animate);
        persons.forEach((person, i) => {
            if (inMES[i] === 0) {
                const deltaX = mustering_inner.position.x - person.geometry.position.x;
                const deltaY = mustering_inner.position.y - person.geometry.position.y;
                const angle = Math.atan2(deltaY, deltaX);
                const move = deltaT * person.speed;

                // Remove Math.sign – angle already gives the correct direction.
                const moveX = move * Math.cos(angle);
                const moveY = move * Math.sin(angle);
                const newPos = person.geometry.position.clone().add(new THREE.Vector3(moveX, moveY, 0));
                const newBB = new THREE.Box3().setFromObject(person.geometry).translate(new THREE.Vector3(moveX, moveY, 0));
                const collision = compartmentsBB.some((bb) => bb.intersectsBox(newBB));

                if (!collision && deckBB.containsPoint(newPos)) {
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
                    if (!compartmentsBB.some((bb) => bb.intersectsBox(testBB)) && deckBB.containsPoint(testPos)) {
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
                person.x.push(person.geometry.position.x + deck_length / 2);
                person.y.push(person.geometry.position.y);
                person.time.push(time_step);
                person.BB.setFromObject(person.geometry);
                document.getElementById("movment" + String(i + 1)).innerText = person.dist.toFixed(2);
                if (MusteringBB.intersectsBox(person.BB)) {
                    inMES[i] = 1;
                }
            }
        });
        renderer.render(scene, camera);
    } else {
        console.log("All persons are in MES");
        document.getElementById("startSim").disabled = false;
        cancelAnimationFrame(animationId);
        document.getElementById("plotFigure").disabled = false;
        document.getElementById("saveResultCSV").disabled = false;
        document.getElementById("saveResultJSON").disabled = false;
    }
}
function resetScene() {
    cancelAnimationFrame(animationId);
    disposeMeshes([
        ...compartmentsMeshes,
        mustering,
        mustering_inner,
        deck,
        ...persons.map((p) => p.geometry),
    ]);

    initializeConfiguration();
    createDeck();
    createCompartments();
    addMusteringStation();
    createPersons(no_persons);
    setupDragControls();
    renderer.render(scene, camera); // Render static scene until simulation starts
}

function init() {
    initializeConfiguration();
    createScene();
    createDeck();
    createCompartments();
    addMusteringStation();
    createPersons(no_persons);
    setupDragControls();
    renderer.render(scene, camera); // Display static scene initially

    const startButton = document.getElementById("startSim");
    if (startButton) {
        startButton.addEventListener("click", () => {
            startButton.disabled = true;
            clock.start();
            animate();
        });
    }
}

document.querySelectorAll('input[name="options"]').forEach((radio) => {
    radio.addEventListener('change', (event) => {
        deck_configuration = event.target.value;
        resetScene();
    });
});

init();

$("#no_persons").on("change", function() {
    const div = document.getElementById('IDresults');
    no_persons = document.getElementById("no_persons").value
    div.innerHTML = "";
    const para = document.createElement('div');
    for (let i = 0; i <= no_persons - 1; i++) {
        const para = document.createElement('div');
        para.innerText += "Person " + (i + 1) + " movment length: "
        const divmovment = document.createElement('span');
        divmovment.innerText = "0"
        divmovment.id = "movment" + String(i + 1)
        para.appendChild(divmovment);
        div.appendChild(para);
    }
    resetScene();

  });

  $("#plotFigure").on("click", function() {
    for (let i = 0; i < no_persons; i++) {
        let TESTER = document.getElementById('movment2D');
        var data = []
        for (let i = 0; i < no_persons; i++) {
            data.push({
                x: persons[i].x,
                y: persons[i].y,
                mode: 'lines',
                name: 'person ' + String(i + 1)
            })
        }

        Plotly.newPlot(TESTER, data);
    }
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
    console.log("save file for person "+i);
    saveAs(myFile);
}
});

$("#saveResultJSON").on("click", function() {

});