"use client";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import Stats from "three/addons/libs/stats.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import CannonUtils from "./Utils/cannonUtils";
import * as dat from "dat.gui";

const SetUp = () => {
  const ref = useRef<HTMLDivElement>(null);
  const statsDiv = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(15);
  const [wireframe, setWireframe] = useState(false);
  const [springParams, setSpringParams] = useState({
    stiffness: 100,
    damping: 0.5,
    restLength: 1.5 / size / 3
  });
  const [showSprings, setShowSprings] = useState(false);
  const [showConstraints, setShowConstraints] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
    const params = { size: size };

    const clothSize = 2;
    let cols = params.size;
    let rows = params.size;
    let dist = clothSize / cols;
    const particles: CANNON.Body[][] = [];
    const springs: CANNON.Spring[] = [];
    const springLines: THREE.Line[] = [];
    const constraintLines: THREE.Line[] = [];

    const createParticles = () => {
      const particleRadius = clothSize / cols;
      for (let i = 0; i < cols + 1; i++) {
        particles.push([]);
        for (let j = 0; j < rows + 1; j++) {
          const particle = new CANNON.Body({
            mass: 0.2,
            position: new CANNON.Vec3(
              (i - cols * 0.5) * dist,
              4,
              (j - rows * 0.5) * dist
            ),
            shape: new CANNON.Sphere(particleRadius),
          });
          particles[i].push(particle);
          world.addBody(particle);
        }
      }
    };

    function connectGround(
      i1: number,
      j1: number,
      i2: number,
      j2: number
    ): void {
      const distance = new CANNON.DistanceConstraint(
        particles[i1][j1],
        particles[i2][j2],
        dist
      );
      world.addConstraint(distance);

      // Add line for visualizing the constraint
      const constraintMaterial = new THREE.LineBasicMaterial({
        color: 0xff0000,
      });
      const constraintPoints = [
        new THREE.Vector3(),
        //   particles[i1][j1].position.x,
        //   particles[i1][j1].position.y,
        //   particles[i1][j1].position.z
        new THREE.Vector3(),
        //   particles[i2][j2].position.x,
        //   particles[i2][j2].position.y,
        //   particles[i2][j2].position.z
      ];
      const constraintGeometry = new THREE.BufferGeometry().setFromPoints(
        constraintPoints
      );
      const constraintLine = new THREE.Line(
        constraintGeometry,
        constraintMaterial
      );
      scene.add(constraintLine);
      constraintLines.push(constraintLine);

      // Spring
      const spring = new CANNON.Spring(particles[i1][j1], particles[i2][j2], {
        restLength: dist,
        stiffness: springParams.stiffness,
        damping: springParams.damping,
      });
      springs.push(spring);

      // Add line for visualizing the spring
      const springMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
      const springPoints = [
        new THREE.Vector3(),
        //   particles[i1][j1].position.x,
        //   particles[i1][j1].position.y,
        //   particles[i1][j1].position.z
        new THREE.Vector3(),
        //   particles[i2][j2].position.x,
        //   particles[i2][j2].position.y,
        //   particles[i2][j2].position.z
      ];
      const springGeometry = new THREE.BufferGeometry().setFromPoints(
        springPoints
      );
      const springLine = new THREE.Line(springGeometry, springMaterial);
      scene.add(springLine);
      springLines.push(springLine);
    }

    const createCloth = () => {
      for (let i = 0; i < cols + 1; i++) {
        for (let j = 0; j < rows + 1; j++) {
          if (i < cols) connectGround(i, j, i + 1, j);
          if (j < rows) connectGround(i, j, i, j + 1);
          if (i < cols && j < rows) connectGround(i, j, i + 1, j + 1);
          if (i > 0 && j < rows) connectGround(i, j, i - 1, j + 1);
        }
      }
    };

    const resetCloth = () => {
      particles.forEach((row) =>
        row.forEach((particle) => world.removeBody(particle))
      );
      particles.length = 0;
      springs.length = 0;
      constraintLines.forEach((line) => scene.remove(line));
      constraintLines.length = 0;
      springLines.forEach((line) => scene.remove(line));
      springLines.length = 0;
      createParticles();
      createCloth();
    };

    createParticles();
    createCloth();

    const gui = new dat.GUI();

    gui.add(springParams, "stiffness", 0, 150).onChange((value) => {
      setSpringParams((prev) => ({ ...prev, stiffness: value }));
      springs.forEach((spring) => {
        spring.stiffness = value;
      });
    });

    gui.add(springParams, "damping", 0, 1).onChange((value) => {
      setSpringParams((prev) => ({ ...prev, damping: value }));
      springs.forEach((spring) => {
        spring.damping = value;
      });
    });

    gui.add(springParams, "restLength", 0, 1).onChange((value) => {
      setSpringParams((prev) => ({ ...prev, restLength: value }));
      springs.forEach((spring) => {
        spring.restLength = value;
      });
    });

    gui.add(params, "size", 15, 45, 15).onChange((value) => {
      cols = value;
      rows = value;
      dist = clothSize / cols;
      resetCloth();
      clothMesh.geometry.dispose();
      clothMesh.geometry = new THREE.PlaneGeometry(
        clothSize,
        clothSize,
        cols,
        rows
      );
      setSize(value);
    });

    gui.add({ wireframe }, "wireframe").onChange((value) => {
      setWireframe(value);
    });

    gui.add({ showSprings }, "showSprings").onChange((value) => {
      setShowSprings(value);
    });

    gui.add({ showConstraints }, "showConstraints").onChange((value) => {
      setShowConstraints(value);
    });

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load("Denim.jpg");

    const clothGeo = new THREE.PlaneGeometry(clothSize, clothSize, cols, rows);
    const clothMaterial = new THREE.MeshBasicMaterial({
      color: "white",
      side: THREE.DoubleSide,
      wireframe: wireframe,
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
      //constraitn update
      constraintLines.forEach((line, index) => {
        const constraint = world.constraints[
          index
        ] as CANNON.DistanceConstraint;
        const bodyA = constraint.bodyA.position;
        const bodyB = constraint.bodyB.position;
        const positions = line.geometry.attributes.position
          .array as Float32Array;
        positions[0] = bodyA.x;
        positions[1] = bodyA.y;
        positions[2] = bodyA.z;
        positions[3] = bodyB.x;
        positions[4] = bodyB.y;
        positions[5] = bodyB.z;
        line.geometry.attributes.position.needsUpdate = true;
      });
    }

    function updateSprings(): void {
      for (const spring of springs) {
        spring.applyForce();
      }
      springLines.forEach((line, index) => {
        const spring = springs[index];
        const bodyA = spring.bodyA.position;
        const bodyB = spring.bodyB.position;
        const positions = line.geometry.attributes.position.array;
        positions[0] = bodyA.x;
        positions[1] = bodyA.y;
        positions[2] = bodyA.z;
        positions[3] = bodyB.x;
        positions[4] = bodyB.y;
        positions[5] = bodyB.z;
        line.geometry.attributes.position.needsUpdate = true;
      });
    }

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
        body.position.y = monkey.position.y - 0.24;
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
      updateSprings();

      constraintLines.forEach((line) => {
        line.visible = showConstraints;
      });

      springLines.forEach((line) => {
        line.visible = showSprings;
      });

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
      gui.destroy();
    };
  }, [size, wireframe, springParams, showSprings, showConstraints]);
  return (
    <div ref={ref} className="w-full h-screen">
      <div ref={statsDiv} className="'stats"></div>
      <div className="absolute top-10 left-0 p-4 text-white"></div>
    </div>
  );
};

export default SetUp;
