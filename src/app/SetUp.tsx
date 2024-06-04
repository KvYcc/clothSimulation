"use client";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import Stats from "three/addons/libs/stats.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import CannonUtils from "./Utils/cannonUtils";

const SetUp = () => {
  const ref = useRef<HTMLDivElement>(null);
  const statsDiv = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentRef = ref.current;
    const currentStatsDiv = statsDiv.current;
    if (!currentRef) return;

    //setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(5, 15, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    currentRef.appendChild(renderer.domElement);

    //light
    const light = new THREE.AmbientLight(0x404040);
    scene.add(light);
    const spotLight = new THREE.SpotLight("white", 100);
    spotLight.castShadow = true;
    scene.add(spotLight);

    const lightHelper = new THREE.AmbientLight();
    scene.add(lightHelper);

    // grid helper
    const gridHelper = new THREE.GridHelper(50, 50);
    scene.add(gridHelper);

    //orbit control
    const orbit = new OrbitControls(camera, renderer.domElement);

    //stat
    const stats = new Stats();
    stats.showPanel(0);
    if (currentStatsDiv) {
      currentStatsDiv.appendChild(stats.dom);
    }
    //Cannon.js
    const world = new CANNON.World();
    world.gravity.set(0, -9.81, 0);

    //ground mesh
    const massGround: number = 0;
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotateX(-Math.PI / 2);
    scene.add(groundMesh);

    //ground body
    const groundBody = new CANNON.Body({
      shape: new CANNON.Plane(),
      mass: massGround,
      // wireframe: true
    });
    groundBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI / 2
    );
    world.addBody(groundBody);

    //spider
    const catUrl = new URL("./assets/blackCat2.glb", import.meta.url);
    const assetLoader = new GLTFLoader();

    assetLoader.load(catUrl.href, function (gltf) {
      const model = gltf.scene;
      model.scale.set(0.5, 0.5, 0.5);
      model.castShadow = true;
      // model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);

      scene.add(model);

      const meshes: any = [];
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes.push(child);
        }
      });
      console.log("Meshes:", meshes);

      let normalMesh: THREE.Mesh | undefined;
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          normalMesh = child as THREE.Mesh;
        }
      });

      if (normalMesh) {
        createConvexHull(meshes[0], normalMesh, world, scene);
      } else {
        console.error("No mesh found in the model");
      }
    });

    //cloth parameter
    const clothSize = 2;
    const cols = 15;
    const rows = 15;
    const dist = clothSize / cols;
    const particles: CANNON.Body[][] = [];

    const constraintLines: THREE.Line[] = [];

    for (let i = 0; i < cols + 1; i++) {
      particles.push([]);
      for (let j = 0; j < rows + 1; j++) {
        const particle = new CANNON.Body({
          mass: 0.1,
          position: new CANNON.Vec3(
            (i - cols * 0.5) * dist,
            4,
            (j - rows * 0.5) * dist
          ),
          shape: new CANNON.Sphere(0.15),
        });
        particles[i].push(particle);
        world.addBody(particle);
      }
    }

    // function createConstraintLine(p1: CANNON.Body, p2: CANNON.Body) {
    //   const geometry = new THREE.BufferGeometry();
    //   const vertices = new Float32Array([
    //     p1.position.x,
    //     p1.position.y,
    //     p1.position.z,
    //     p2.position.x,
    //     p2.position.y,
    //     p2.position.z,
    //   ]);
    //   geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    //   const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    //   const line = new THREE.Line(geometry, material);
    //   scene.add(line);
    //   constraintLines.push(line);
    // }

    function connectGround(
      i1: number,
      j1: number,
      i2: number,
      j2: number
    ): void {
      world.addConstraint(
        new CANNON.DistanceConstraint(
          particles[i1][j1],
          particles[i2][j2],
          dist
        )
      );
      // createConstraintLine(particles[i1][j1], particles[i2][j2])
    }

    for (let i = 0; i < cols + 1; i++) {
      for (let j = 0; j < rows + 1; j++) {
        if (i < cols) connectGround(i, j, i + 1, j);
        if (j < rows) connectGround(i, j, i, j + 1);
      }
    }

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load("Denim.jpg");

    const clothGeo = new THREE.PlaneGeometry(clothSize, clothSize, cols, rows);
    const clothMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      // wireframe: true,
      map: texture,
    });

    const clothMesh = new THREE.Mesh(clothGeo, clothMaterial);
    clothMesh.position.set(0, 0, 0);
    scene.add(clothMesh);

    function updateParticules(): void {
      for (let i = 0; i < cols + 1; i++) {
        for (let j = 0; j < rows + 1; j++) {
          const index: number = j * (cols + 1) + i;
          const positionAttribute = clothGeo.attributes.position;
          const position = particles[i][rows - j].position;
          positionAttribute.setXYZ(index, position.x, position.y, position.z);
          positionAttribute.needsUpdate = true;
        }
      }
    }

    // function updateConstraintLines(): void {
    //   for (let i = 0; i < constraintLines.length; i++) {
    //     const line = constraintLines[i];
    //     const positions = line.geometry.attributes.position.array as Float32Array;

    //     const p1 = world.constraints[i].bodyA.position;
    //     const p2 = world.constraints[i].bodyB.position;

    //     positions[0] = p1.x;
    //     positions[1] = p1.y;
    //     positions[2] = p1.z;
    //     positions[3] = p2.x;
    //     positions[4] = p2.y;
    //     positions[5] = p2.z;

    //     line.geometry.attributes.position.needsUpdate = true;
    //   }
    // }

    //createConvexHull
    function createConvexHull(
      monkey: THREE.Object3D,
      normalMesh: THREE.Mesh,
      world: CANNON.World,
      scene: THREE.Scene
    ) {
      const clothMaterial = new THREE.MeshPhongMaterial({
        color: "#ECD9BA",
        side: THREE.DoubleSide,
        wireframe: false,
        flatShading: true,
      });

      const convexGeo = new THREE.Mesh(normalMesh.geometry, clothMaterial);
      convexGeo.userData.selectable = false;
      convexGeo.castShadow = true;
      convexGeo.receiveShadow = true; 
      monkey.add(convexGeo);

      convertConvexHullToTrimesh();

      function convertConvexHullToTrimesh() {
        const shape = CannonUtils.CreateTrimesh(convexGeo.geometry);
        let body = new CANNON.Body({ mass: 0 });
        body.allowSleep = true;
        body.addShape(shape);

        body.position.x = monkey.position.x;
        body.position.y = monkey.position.y;
        body.position.z = monkey.position.z;
        body.quaternion.x = monkey.quaternion.x;
        body.quaternion.y = monkey.quaternion.y;
        body.quaternion.z = monkey.quaternion.z;
        body.quaternion.w = monkey.quaternion.w;
        world.addBody(body);

        // const redMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        // const redMesh = new THREE.Mesh(convexGeo.geometry, redMaterial);
        // redMesh.position.copy(body.position);
        // redMesh.quaternion.copy(body.quaternion);
        // scene.add(redMesh);
      }
    }

    //Resize
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onWindowResize);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      world.step(1 / 60);
      updateParticules();
      // updateConstraintLines()

      stats.begin();
      stats.end();

      // Render the scene
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", onWindowResize);
      if (currentRef) {
        currentRef.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);
  return (
    <div ref={ref} className="w-full h-screen">
      <div ref={statsDiv} className="'stats"></div>
      <div className="absolute top-10 left-0 p-4 text-white"></div>
    </div>
  );
};

export default SetUp;
