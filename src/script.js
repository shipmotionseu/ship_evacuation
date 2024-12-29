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

let init_vars_scene = createEmptyScene();
