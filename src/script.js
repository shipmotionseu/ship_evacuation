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
        this.signx = 1;
        this.signy = 1;
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

function createCompartments() {
    let compartments = [];
    let compartmentsBB = [];
    for (let i = 0; i < 1; i++) {
        const compartment = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 2), new THREE.MeshBasicMaterial({
            color: 'yellow',
        }));
        compartment.position.x = 0;
        compartment.position.y = 0;
        compartment.position.z = 0;
        const compartmentBB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
        compartmentBB.setFromObject(compartment);

        scene.add(compartment);
        compartments.push(compartment);
        compartmentsBB.push(compartmentBB);
    }
    return {
        compartments,
        compartmentsBB
    };
}
const person_colors = ['#006400', '#008000', '#556B2F', '#228B22', '#2E8B57', '#808000', '#6B8E23', '#3CB371', '#32CD32', '#00FF00', '#00FF7F', '#00FA9A', '#8FBC8F', '#66CDAA', '#9ACD32', '#7CFC00', '#7FFF00', '#90EE90', '#ADFF2F', '#98FB98']


let deck_length=105.2;
let deck_width=34;

let person_size_x=0.4
let person_size_y=0.4
let mes_x_global = 105; 
let mes_y_global = 17;
let mes_width = 10;
let mes_length = 5;
let mes_x = mes_x_global-deck_length/2;
let mes_y = mes_y_global-deck_width/2;

let deltaT = 0;
let clock = new THREE.Clock();
let time_step=0;
let persons = [];
let inMES = [];

let init_vars_scene = createEmptyScene();
let scene = init_vars_scene.scene;
let camera = init_vars_scene.camera;
let renderer = init_vars_scene.renderer;
persons=createPerson(no_persons).persons;
//let controls = init_vars_scene.controls;


function createPerson(no_persons) {
    for (let i = 0; i <= no_persons - 1; i++) {
        persons[i] = new Human(i + 1001, 3 + getRandomInt(3), new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.8), new THREE.MeshBasicMaterial({
            color: person_colors[i % person_colors.length],
        })));
        persons[i].speed = 5 + getRandomInt(4);
        persons[i].geometry.position.x =-30 + getRandomInt(5) - 2.5;
        persons[i].geometry.position.y = getRandomInt(deck_width) - (deck_width / 2-2);
        persons[i].x[0] = persons[i].geometry.position.x+deck_length/2;
        persons[i].y[0] = persons[i].geometry.position.y;
        persons[i].z[0] = persons[i].geometry.position.z;
        persons[i].time[0] = 0;
        persons[i].BB.setFromObject(persons[i].geometry);
        inMES[i] = 0;
    }

    for (let i = 0; i < no_persons; i++) {
        scene.add(persons[i].geometry);
    }
    renderer.setAnimationLoop(ShowDeck);
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



function ShowDeck() {
    renderer.render(scene, camera);
  }
  let init_vars_deck = createDeck(deck_length,deck_width,0);
  let deck = init_vars_deck.deck;
  let init_vars_compartments = createCompartments();
    let compartments = init_vars_compartments.compartments;
  let compartmentsBB = init_vars_compartments.compartmentsBB;
  let init_vars_mustering = addMusteringStation(mes_x,mes_y,mes_width,mes_length,0);
  let mustering = init_vars_mustering.mustering;
  let mustering_inner = init_vars_mustering.mustering_inner;
  var  MusteringBB = init_vars_mustering.MusteringBB;

  const dragControls = new DragControls([mustering], camera, renderer.domElement);
  dragControls.addEventListener('drag', function(event) {
      console.log('drag');

      event.object.position.z = 0; 

      // This will prevent moving z axis, but will be on 0 line. change this to your object position of z axis.
  })

 dragControls.addEventListener('dragend', function(event) {
    console.log('dragend');
    for (let i = 0; i < persons.length; i++) {
        scene.remove(persons[i].geometry);
    }
    persons=createPerson(no_persons).persons;
    mes_x = event.object.position.x;
    mes_y = event.object.position.y;

    mustering_inner.position.x = mes_x;
    mustering_inner.position.y = mes_y;
    MusteringBB.setFromObject(mustering_inner);


});
 //   dragControls.addEventListener('hoveron', function (event) { controls.enabled = false; });
 //   dragControls.addEventListener('hoveroff', function (event) { controls.enabled = true; });
 // controls.addEventListener('start', function (event) { dragControls.deactivate(); }); 
 // controls.addEventListener('end', function (event) { dragControls.activate(); });

  function animate() {
    deltaT = clock.getDelta();
    if (inMES.includes(0)) {
        requestAnimationFrame(animate);
    
        for (let i = 0; i < persons.length; i++) {
            if (inMES[i] == 0) {
                persons[i].signx = 1;
                persons[i].signy = 1;
                let test_dist = 1;
                const person_outer=new THREE.Mesh(new THREE.BoxGeometry(1.5*0.4, 1.5*0.4, 1.8), new THREE.MeshBasicMaterial({
                    color: 'blue',
                    opacity: 1,
                    transparent: true
                }));
                scene.add(person_outer);

                person_outer.position.x=persons[i].geometry.position.x;
                person_outer.position.y=persons[i].geometry.position.y;
                person_outer.position.z=persons[i].geometry.position.z;
    
                let delta_mes_x=mustering_inner.position.x-persons[i].geometry.position.x;
                let delta_mes_y=mustering_inner.position.y-persons[i].geometry.position.y;
                let tgt=delta_mes_y/delta_mes_x;
                let angle=Math.atan(tgt);
    
                let prev_x = persons[i].geometry.position.x;
                let prev_y = persons[i].geometry.position.y;
                let prev_z = persons[i].geometry.position.z;

                time_step+=deltaT;

                let move=deltaT * persons[i].speed;
                let move_x=Math.sign(delta_mes_x)*move*Math.cos(angle);
                let move_y=Math.sign(delta_mes_x)*move*Math.sin(angle);

                person_outer.position.x = prev_x + move_x;
                person_outer.position.y = prev_y + move_y;
                let person_outerBB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
                person_outerBB.setFromObject(person_outer);      
                if (compartmentsBB[0].intersectsBox(person_outerBB)) {
                    console.log("Person "+i+" is in compartment");
                    const positionAtrribute=compartments[0].geometry.attributes.position;
                    let closestVertex = new THREE.Vector3();
                    let minDistance = Infinity;
                    const tempVector = new THREE.Vector3();
                    for (let w = 0; w < positionAtrribute.count; w++) {
                        tempVector.fromBufferAttribute(positionAtrribute, w);
                        compartments[0].localToWorld(tempVector);
                        const distance = tempVector.distanceTo(person_outer.position);
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestVertex = tempVector;
                        }
                    }
                    if (person_outer.position.y<closestVertex.y) {
                        person_outer.position.y = prev_y + move;
                        test_dist=1;
                    }
                    else {
                        person_outer.position.y = prev_y - move;
                        test_dist=-1;
                    }
   
                    person_outer.position.x = prev_x;

                    let person_outerBB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
                    person_outerBB.setFromObject(person_outer);      
                    if (!compartmentsBB[0].intersectsBox(person_outerBB)) {
                        persons[i].signx=0;
                        persons[i].signy=1;
                        move_y=move;
                    }
                    else{
                        person_outer.position.y=prev_y
                        const positionAtrribute=compartments[0].geometry.attributes.position;
                        let closestVertex = new THREE.Vector3();
                        let minDistance = Infinity;
                        const tempVector = new THREE.Vector3();
                        for (let w = 0; w < positionAtrribute.count; w++) {
                            tempVector.fromBufferAttribute(positionAtrribute, w);
                            compartments[0].localToWorld(tempVector);
                            const distance = tempVector.distanceTo(person_outer.position);
                            if (distance < minDistance) {
                                minDistance = distance;
                                closestVertex = tempVector;
                            }
                        }
                        if (person_outer.position.x<closestVertex.x) {
                            person_outer.position.x = prev_x + move;
                            test_dist=1;
                        }
                        else {
                            person_outer.position.x = prev_x - move;
                            test_dist=-1;
                        }
    
                        let person_outerBB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
                        person_outerBB.setFromObject(person_outer);      
                        if (!compartmentsBB[0].intersectsBox(person_outerBB)) {
                            persons[i].signx=1;
                            persons[i].signy=0;
                            move_x=move;
                        }

                    }
            }


                persons[i].geometry.position.x = prev_x + persons[i].signx*move_x;
                persons[i].geometry.position.y = prev_y + persons[i].signy*move_y;
                persons[i].geometry.position.z = prev_z;
            
                let walk_dist = Math.sqrt(Math.pow(move_x,2)+Math.pow(move_y,2)); 
                persons[i].dist+=walk_dist;
                document.getElementById("movment"+String(i+1)).innerText = persons[i].dist;   

                persons[i].x.push(persons[i].geometry.position.x+deck_length/2);
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
    }
    else {
        console.log("All persons are in MES")
        $("#plotFigure").prop("disabled", false);
        $("#saveResultCSV").prop("disabled", false);
        $("#saveResultJSON").prop("disabled", false);
        $("#startSim").prop("disabled", false);
        renderer.setAnimationLoop(null);
    }
   
  //controls.update();
  };

  $("#startSim").on("click", function() {
    $("#plotFigure").prop("disabled", true);
    $("#saveResultCSV").prop("disabled", true);
    $("#saveResultJSON").prop("disabled", true);
    $("#startSim").prop("disabled", true);
    let init_vars_deck = createDeck(deck_length,deck_width,0);
    let init_vars_compartments = createCompartments();
    let deck = init_vars_deck.deck;
    let init_vars_mustering = addMusteringStation(mes_x,mes_y,mes_width,mes_length,0);
    let mustering = init_vars_mustering.mustering;
    let mustering_inner = init_vars_mustering.mustering_inner;
    var  MusteringBB = init_vars_mustering.MusteringBB;
    
    console.log("start")
    //renderer.setAnimationLoop(animate);
    animate();
    console.log("end")
});

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
    for (let i = 0; i < persons.length; i++) {
        scene.remove(persons[i].geometry);
    }
    createEmptyScene();
    persons=createPerson(no_persons).persons;

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