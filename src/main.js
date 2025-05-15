import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { Holistic } from "@mediapipe/holistic";
import { Camera } from "@mediapipe/camera_utils";
import { marchingCubes, metaBalls } from "./MarchingCubes";

let oscValues = {
  alpha: 0.0,
  beta: 0.0,
  delta: 0.0,
};

// ==== DOM Setup ====
const container = document.getElementById("container");
const videoElement = document.createElement("video");
document.body.appendChild(videoElement);
videoElement.style.position = "absolute";
videoElement.style.top = "0";
videoElement.style.left = "0";
videoElement.style.width = "100%";
videoElement.style.height = "100%";
videoElement.style.zIndex = "-1";

const canvasElement = document.createElement("canvas");
canvasElement.style.display = "none";
const canvasCtx = canvasElement.getContext("2d");
document.body.appendChild(canvasElement);

// ==== Three.js Setup ====
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  35,
  sizes.width / sizes.height,
  0.01,
  1000
);
camera.position.set(0, 0, 20);
scene.add(camera);
scene.background = new THREE.Color(0x000000);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(sizes.pixelRatio);
renderer.setSize(sizes.width, sizes.height);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 3;
container.appendChild(renderer.domElement);

// ==== Environment Map ====
new RGBELoader().load("./urban_alley_01_1k.hdr", (envMap) => {
  envMap.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = envMap;
});

// ==== Material ====
let uniforms = {
  uTime: { value: 0.0 },
  uIntensity: { value: 0.2 },
  uSpeed: { value: 0.0 },
  uColor: { value: 0.0 },
};

const material = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: `
    uniform float uTime;
    uniform float uIntensity;
    uniform float uSpeed;
    varying vec2 vUv;

    float noise(vec3 p) {
      return sin(p.x * 10.0 + uTime * uSpeed) * 0.1;
    }

    void main() {
      vUv = uv;
      vec3 newPosition = position + normal * noise(position) * uIntensity;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uColor;
    varying vec2 vUv;

    void main() {
      vec3 color = vec3(vUv.x, vUv.y, uColor);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  wireframe: false,
});

const socket = new WebSocket("ws://localhost:3000");
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const [val] = data.args;

  switch (data.address) {
    case "/muse/elements/alpha_absolute":
      oscValues.alpha = val;
      break;
    case "/muse/elements/beta_absolute":
      oscValues.beta = val;
      break;
    case "/muse/elements/delta_absolute":
      oscValues.delta = val;
      break;
    default:
      console.log("Unknown OSC:", data);
  }
};

const blobMaterial = new THREE.MeshPhysicalMaterial({
  color: "#00ff00",
  metalness: 0.1,
  roughness: 0.05,
  transmission: 0.9,
  ior: 1.5,
  thickness: 2,
  transparent: true,
  opacity: 0.75,
  side: THREE.DoubleSide,
  envMap: scene.environment,
  reflectivity: 1,
});

// ==== Pose Recording Logic ====
let isRecording = false;
let isReplaying = false;
let poseRecording = [];

document.addEventListener("keydown", (e) => {
  if (e.key === "r") {
    poseRecording = [];
    isRecording = true;
    const startTime = performance.now();
    console.log("Recording started for 5 seconds...");

    setTimeout(() => {
      isRecording = false;
      console.log("Recording ended. Saving file...");
      savePoseToServer(poseRecording);
    }, 5000);
  }
});

function savePoseToServer(data) {
  fetch("/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
    .then((res) => res.text())
    .then((msg) => console.log(msg))
    .catch((err) => console.error("Save failed:", err));
}

const replayBtn = document.getElementById("replayBtn");
replayBtn.addEventListener("click", () => {
  loadRandomPose();
});

function loadRandomPose() {
  fetch("/random-pose")
    .then((res) => res.json())
    .then((data) => replayPoseData(data))
    .catch((err) => console.error("Failed to load pose:", err));
}

function replayPoseData(data) {
  if (!data || data.length === 0) return;

  isReplaying = true;
  console.log("Replaying pose data...");

  let i = 0;
  function step() {
    if (i >= data.length) {
      isReplaying = false;
      return;
    }

    const frame = data[i];
    console.log("Frame", i, frame); // ✅ DEBUG
    updateBlobFromResults(frame);

    const nextFrame = data[i + 1];
    const delay = nextFrame ? nextFrame.timestamp - frame.timestamp : 33;

    i++;
    setTimeout(step, delay);
  }

  step();
}

function updateBlobFromResults(results) {
  metaBalls.length = 0;

  const nose = results.faceLandmarks?.[0];
  if (nose) {
    metaBalls.push({
      center: new THREE.Vector3(
        (nose.x - 0.5) * 10,
        -(nose.y - 0.5) * 10,
        (nose.z || 0) * 10
      ),
      radius: 1.5,
    });
  }

  const leftIndexTip = results.leftHandLandmarks?.[9];
  if (leftIndexTip) {
    metaBalls.push({
      center: new THREE.Vector3(
        (leftIndexTip.x - 0.5) * 11,
        -(leftIndexTip.y - 0.5) * 3,
        (leftIndexTip.z || 0) * 10
      ),
      radius: 0.5,
    });
  }

  const rightIndexTip = results.rightHandLandmarks?.[9];
  if (rightIndexTip) {
    metaBalls.push({
      center: new THREE.Vector3(
        (rightIndexTip.x - 0.5) * 11,
        -(rightIndexTip.y - 0.5) * 3,
        (rightIndexTip.z || 0) * 10
      ),
      radius: 0.5,
    });
  }

  const leftKnee = results.poseLandmarks?.[25];
  if (leftKnee) {
    metaBalls.push({
      center: new THREE.Vector3(
        (leftKnee.x - 0.5) * 26, // Adjust scaling as needed
        -(leftKnee.y - 0.5) * 6.3, // Adjust scaling as needed
        (leftKnee.z || 0) * 10 // Adjust scaling as needed
      ),
      radius: 0.7, // Adjust radius as needed
    });
  }

  const rightKnee = results.poseLandmarks?.[26];
  if (rightKnee) {
    metaBalls.push({
      center: new THREE.Vector3(
        (rightKnee.x - 0.5) * 26, // Adjust scaling as needed
        -(rightKnee.y - 0.5) * 6.3, // Adjust scaling as needed
        (rightKnee.z || 0) * 10 // Adjust scaling as needed
      ),
      radius: 0.7, // Adjust radius as needed
    });
  }

  if (results.poseLandmarks) {
    const torso = getTorsoCenter(results.poseLandmarks);
    if (torso) {
      metaBalls.push({ center: torso, radius: 3.0 });
    }
  }

  const triangles = marchingCubes();
  updateBlobMesh(triangles);
  render();
}

// ==== MediaPipe Holistic Setup ====
const holistic = new Holistic({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
});

holistic.setOptions({
  modelComplexity: 1,
  smoothLandmarks: false,
  enableSegmentation: false,
  refineFaceLandmarks: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  selfieMode: true,
});

holistic.onResults((results) => {
  if (isReplaying) return;

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(
    results.image,
    0,
    0,
    canvasElement.width,
    canvasElement.height
  );

  if (isRecording) {
    poseRecording.push({
      timestamp: performance.now(),
      poseLandmarks: results.poseLandmarks || [],
      faceLandmarks: results.faceLandmarks || [],
      leftHandLandmarks: results.leftHandLandmarks || [],
      rightHandLandmarks: results.rightHandLandmarks || [],
    });
  }

  updateBlobFromResults(results);
});

function getTorsoCenter(poseLandmarks) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];

  if (!(leftShoulder && rightShoulder && leftHip && rightHip)) return null;

  const avg = (a, b, c, d) => (a + b + c + d) / 4;

  const x = avg(leftShoulder.x, rightShoulder.x, leftHip.x, rightHip.x);
  const y = avg(leftShoulder.y, rightShoulder.y, leftHip.y, rightHip.y);
  const z = avg(leftShoulder.z, rightShoulder.z, leftHip.z, rightHip.z);

  return new THREE.Vector3((x - 0.5) * 10, -(y - 0.5) * 10, (z || 0) * 10);
}

// ==== Camera Feed ====
const liveCam = new Camera(videoElement, {
  onFrame: async () => {
    await holistic.send({ image: videoElement });
  },
  width: window.innerWidth,
  height: window.innerHeight,
});
liveCam.start();

// ==== Blob Mesh Update ====
function updateBlobMesh(trianglePoints) {
  scene.traverse((obj) => {
    if (obj.isMesh && obj.userData.isBlob) {
      scene.remove(obj);
    }
  });

  const vertices = new Float32Array(trianglePoints.length * 3);
  for (let i = 0; i < trianglePoints.length; i++) {
    const p = trianglePoints[i];
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.isBlob = true;
  scene.add(mesh);
}

// ==== Animation Loop ====
function render() {
  renderer.render(scene, camera);
}

function animate(time) {
  requestAnimationFrame(animate);

  uniforms.uTime.value = time * 0.001;
  uniforms.uIntensity.value = THREE.MathUtils.lerp(
    uniforms.uIntensity.value,
    oscValues.delta * 1.2,
    0.1
  );
  uniforms.uSpeed.value = THREE.MathUtils.lerp(
    uniforms.uSpeed.value,
    oscValues.alpha * 1.7,
    0.1
  );
  uniforms.uColor.value = THREE.MathUtils.lerp(
    uniforms.uColor.value,
    oscValues.beta * 1.2,
    0.1
  );

  const uiSave = document.getElementById("ui-save");
  if (isRecording) {
    // Show "Press R once to record" when not recording
    uiSave.textContent = "Learning";
  } else if (isReplaying) {
    uiSave.textContent = "This is what I learnt";
  } else if (!isRecording && !isReplaying) {
    uiSave.textContent = "Press R once to record";
  }

  render();
}
animate();

window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
});
