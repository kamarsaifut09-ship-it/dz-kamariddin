import * as THREE from "three";

/* =========================================================
   LONG.PLAY — cinematic interactive hero
   Three files only: index.html, style.css, script.js
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const hero = $("#hero");
const canvas = $("#scene");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 760px)").matches;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8192c2, 0.018);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 4.0, 12.8);
    this.camera.lookAt(0, 2.1, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isMobile,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.8));
    this.renderer.shadowMap.enabled = !isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.pointerWorld = new THREE.Vector3(0, 0, 0);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.resize();
    window.addEventListener("resize", () => this.resize(), { passive: true });
  }

  resize() {
    const width = hero.clientWidth;
    const height = hero.clientHeight;
    this.camera.aspect = width / height;
    this.camera.position.z = width < 600 ? 15.2 : width < 900 ? 14 : 12.8;
    this.camera.fov = width < 600 ? 47 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setPointer(event) {
    const rect = hero.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerActive = true;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.pointerWorld)) this.pointerWorld.set(0, 0, 0);
  }

  clearPointer() {
    this.pointerActive = false;
    this.pointer.set(0, 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

class Sky {
  constructor(manager) {
    this.manager = manager;
    const geometry = new THREE.SphereGeometry(48, 32, 20);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = normalize(world.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform float uTime;
        void main() {
          float h = normalize(vWorld).y;
          vec3 top = vec3(0.12, 0.23, 0.60);
          vec3 blue = vec3(0.25, 0.43, 0.88);
          vec3 lavender = vec3(0.55, 0.59, 0.82);
          vec3 peach = vec3(1.0, 0.68, 0.57);
          float upper = smoothstep(-0.02, 0.72, h);
          vec3 col = mix(lavender, blue, smoothstep(-0.18, 0.36, h));
          col = mix(col, top, smoothstep(0.32, 0.92, h));
          float sunset = exp(-pow((h + 0.12) * 7.0, 2.0));
          col = mix(col, peach, sunset * 0.74);
          float haze = exp(-pow((h - 0.02) * 3.0, 2.0));
          col += vec3(0.12, 0.06, 0.06) * haze;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.mesh = new THREE.Mesh(geometry, material);
    manager.scene.add(this.mesh);
    this.material = material;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }
}

function makeCloudTexture(seed = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // A small seeded random generator makes each cloud shape stable between reloads.
  let state = seed * 92821 + 173;
  const random = (min, max) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return min + (state / 4294967296) * (max - min);
  };

  const glow = (x, y, rx, ry, inner, middle, outer) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const gradient = ctx.createRadialGradient(0, 0, .02, 0, 0, 1);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(.48, middle);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Cool pink-violet volume under the cloud.
  for (let i = 0; i < 12; i++) {
    const x = 140 + i * 66 + random(-25, 25);
    const y = 292 + random(-18, 30);
    glow(
      x, y, random(72, 150), random(35, 76),
      "rgba(184,151,177,.22)",
      "rgba(204,166,180,.13)",
      "rgba(213,178,190,0)"
    );
  }

  // Overlapping uneven lobes form a broken, natural cloud silhouette.
  const lobes = [
    [105, 250, 118, 86], [210, 194, 132, 116], [330, 177, 145, 132],
    [472, 194, 158, 116], [620, 174, 146, 132], [760, 206, 138, 106],
    [880, 250, 112, 76], [270, 278, 150, 74], [520, 284, 190, 72],
    [730, 278, 150, 82]
  ];
  for (const [x, y, rx, ry] of lobes) {
    const ox = random(-18, 18);
    const oy = random(-16, 16);
    glow(
      x + ox, y + oy, rx * random(.82, 1.12), ry * random(.82, 1.16),
      "rgba(255,247,242,.64)",
      "rgba(255,229,225,.38)",
      "rgba(255,220,220,0)"
    );
  }

  // Soft sunlit tops and thinner wisps break up the edges.
  for (let i = 0; i < 22; i++) {
    const x = random(65, 950);
    const y = random(115, 245);
    glow(
      x, y, random(35, 92), random(19, 51),
      "rgba(255,250,244,.40)",
      "rgba(255,236,232,.19)",
      "rgba(255,230,225,0)"
    );
  }
  for (let i = 0; i < 14; i++) {
    const x = random(60, 960);
    const y = random(245, 335);
    glow(
      x, y, random(48, 118), random(8, 20),
      "rgba(255,220,218,.18)",
      "rgba(255,214,216,.09)",
      "rgba(255,214,216,0)"
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

class CloudSystem {
  constructor(manager) {
    this.manager = manager;
    this.layers = [];
    this.textures = [makeCloudTexture(3), makeCloudTexture(8), makeCloudTexture(15)];

    const configs = [
      { x: -14.0, y: 6.0, z: -13.0, w: 11.8, h: 3.1, speed: .86, opacity: .36, texture: 0 },
      { x: -6.2, y: 5.35, z: -10.5, w: 9.6, h: 2.7, speed: .68, opacity: .31, texture: 1 },
      { x: 3.5, y: 4.65, z: -9.0, w: 10.0, h: 2.8, speed: -.78, opacity: .29, texture: 2 },
      { x: 13.5, y: 6.25, z: -13.5, w: 12.4, h: 3.2, speed: -.62, opacity: .34, texture: 0 },
      { x: -11.0, y: 3.45, z: -8.5, w: 8.4, h: 2.25, speed: .98, opacity: .22, texture: 2 },
      { x: -1.5, y: 3.85, z: -11.5, w: 8.8, h: 2.35, speed: .54, opacity: .24, texture: 1 },
      { x: 8.5, y: 3.3, z: -9.8, w: 9.2, h: 2.45, speed: -.91, opacity: .23, texture: 0 },
      { x: 18.0, y: 4.5, z: -12.0, w: 10.5, h: 2.7, speed: .73, opacity: .25, texture: 2 }
    ];

    configs.forEach((config, index) => {
      const material = new THREE.MeshBasicMaterial({
        map: this.textures[config.texture],
        transparent: true,
        opacity: config.opacity,
        depthWrite: false,
        blending: THREE.NormalBlending,
        color: index % 2 ? 0xffe1df : 0xffffff,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(config.w, config.h),
        material
      );
      mesh.position.set(config.x, config.y, config.z);
      mesh.rotation.z = (index % 2 ? -1 : 1) * (0.018 + (index % 3) * 0.008);
      manager.scene.add(mesh);

      this.layers.push({
        mesh,
        speed: config.speed,
        origin: config.x,
        originY: config.y,
        opacity: config.opacity,
        phase: index * 1.83,
        width: config.w,
        wrapWidth: 54
      });
    });
  }

  update(time, pointer) {
    this.layers.forEach((layer) => {
      const { mesh, speed, origin, originY, opacity, phase, width, wrapWidth } = layer;

      // Constant horizontal drift with enough margin for the whole cloud to leave the frame before wrapping.
      const travel = origin + time * speed;
      const wrapped = ((travel + wrapWidth * .5) % wrapWidth + wrapWidth) % wrapWidth - wrapWidth * .5;
      mesh.position.x = wrapped + pointer.x * .10;
      mesh.position.y = originY
        + Math.sin(time * .17 + phase) * .10
        + Math.sin(time * .07 + phase * 1.4) * .045;
      mesh.rotation.z += Math.sin(time * .11 + phase) * .000035;
      mesh.material.opacity = opacity * (.94 + Math.sin(time * .2 + phase) * .045);
    });
  }
}

function hillGround(x, z) {
  // One continuous meadow with a gentle overall rise rather than one oversized mound.
  const meadowBase = .22 * Math.exp(-Math.pow((z - 1.4) / 11.5, 2));

  // Five broad, overlapping grassy hills. Each has its own height, width and depth,
  // creating a rolling landscape instead of three merged peaks or a single tall mountain.
  const hillA = .92 * Math.exp(-Math.pow((x + 14.0) / 3.5, 2)) *
    Math.exp(-Math.pow((z - .7) / 10.0, 2));
  const hillB = 1.18 * Math.exp(-Math.pow((x + 8.0) / 3.25, 2)) *
    Math.exp(-Math.pow((z - .2) / 9.7, 2));
  const hillC = 1.02 * Math.exp(-Math.pow((x + 1.0) / 3.1, 2)) *
    Math.exp(-Math.pow((z - 1.0) / 10.2, 2));
  const hillD = 1.36 * Math.exp(-Math.pow((x - 6.3) / 3.45, 2)) *
    Math.exp(-Math.pow((z - .3) / 9.6, 2));
  const hillE = .88 * Math.exp(-Math.pow((x - 13.6) / 3.5, 2)) *
    Math.exp(-Math.pow((z - 1.3) / 10.5, 2));

  // Gentle ridge undulation keeps the contours irregular and natural.
  const ridgeVariation =
    .10 * Math.sin(x * .42 + .55) * Math.exp(-Math.pow((z - .8) / 10.5, 2)) +
    .065 * Math.sin(x * .78 - .8) * Math.exp(-Math.pow((z - 2.1) / 8.8, 2));
  const shoulder = .055 * Math.sin(x * .25 + .7) * Math.exp(-Math.pow((z - .2) / 8.5, 2));
  const roll = .04 * Math.sin(x * .62 + z * .24) + .02 * Math.cos(z * .49 - x * .19);

  return -.15 + meadowBase + hillA + hillB + hillC + hillD + hillE + ridgeVariation + shoulder + roll;
}

class HillSystem {
  constructor(manager) {
    this.manager = manager;
    this.hills = [];

    const layers = [
      { z: -5.8, base: .24, height: 1.02, color: 0x7586ad, opacity: .48, seed: 1.7 },
      { z: -4.9, base: .07, height: 1.18, color: 0x526b91, opacity: .66, seed: 4.2 },
      { z: -4.0, base: -.12, height: 1.32, color: 0x344d76, opacity: .84, seed: 7.1 },
      { z: -3.05, base: -.34, height: 1.08, color: 0x1c3155, opacity: 1, seed: 10.4 }
    ];

    layers.forEach((layer, index) => {
      const width = 38;
      const columns = 160;
      const rows = 18;
      const positions = [];
      const colors = [];
      const indices = [];
      const baseColor = new THREE.Color(layer.color);
      const litColor = baseColor.clone().lerp(new THREE.Color(0xb98c91), .20 - index * .035);
      const darkColor = baseColor.clone().multiplyScalar(.42);

      const ridge = (x) => {
        const broad = Math.sin(x * .22 + layer.seed) * layer.height * .42;
        const rolling = Math.sin(x * .49 + layer.seed * 1.8) * layer.height * .26;
        const detail = Math.sin(x * .93 + layer.seed * 2.7) * layer.height * .10;
        const asymmetric = Math.sin(x * .13 + layer.seed * .7) * layer.height * .30;
        const peakA = Math.exp(-Math.pow((x - (3.8 - index * 1.1)) / 2.7, 2)) * layer.height * .48;
        const valley = Math.exp(-Math.pow((x + 4.6) / 3.2, 2)) * layer.height * .30;
        return layer.base + broad + rolling + detail + asymmetric + peakA - valley;
      };

      for (let row = 0; row <= rows; row++) {
        const depth = row / rows;
        for (let col = 0; col <= columns; col++) {
          const x = -width / 2 + (col / columns) * width;
          const top = ridge(x);
          const y = THREE.MathUtils.lerp(top, -5.2, depth);
          const z = layer.z + depth * (1.15 + index * .12);
          positions.push(x, y, z);

          const sideShade = .94 + .06 * Math.sin(x * .34 + layer.seed);
          const color = litColor.clone().lerp(darkColor, Math.pow(depth, .72));
          color.multiplyScalar(sideShade);
          colors.push(color.r, color.g, color.b);
        }
      }

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const a = row * (columns + 1) + col;
          const b = a + 1;
          const c = a + columns + 2;
          const d = a + columns + 1;
          indices.push(a, d, b, b, d, c);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        transparent: layer.opacity < 1,
        opacity: layer.opacity,
        side: THREE.DoubleSide,
        depthWrite: index > 1
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      manager.scene.add(mesh);
      this.hills.push({ mesh, index, seed: layer.seed });
    });

    const width = 38, depth = 18, cols = 150, rows = 90;
    const positions = [], colors = [], indices = [];
    const grasslandBase = new THREE.Color(0x293e37);
    const sunlit = new THREE.Color(0x66734a);
    for (let row = 0; row <= rows; row++) {
      const z = -4.2 + (row / rows) * depth;
      for (let col = 0; col <= cols; col++) {
        const x = -width / 2 + (col / cols) * width;
        const y = hillGround(x, z);
        positions.push(x, y, z);
        const crownLight = clamp((y + .15) / .85, 0, 1) * .30;
        const rollingShade = .035 * Math.sin(x * .34 + z * .22) + .022 * Math.cos(z * .48 - x * .17);
        const light = clamp(crownLight + rollingShade, 0, .36);
        const c = grasslandBase.clone().lerp(sunlit, light);
        colors.push(c.r, c.g, c.b);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const a = row * (cols + 1) + col;
        indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    }
    const groundGeometry = new THREE.BufferGeometry();
    groundGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    groundGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    groundGeometry.setIndex(indices);
    groundGeometry.computeVertexNormals();
    this.ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide
    }));
    this.ground.receiveShadow = true;
    manager.scene.add(this.ground);
  }

  update(time, pointer) {
    this.hills.forEach(({ mesh, index, seed }) => {
      const parallax = .035 + index * .035;
      mesh.position.x = pointer.x * parallax;
      mesh.position.y = Math.sin(time * (.055 + index * .009) + seed) * .012;
    });
  }
}

class GrassSystem {
  constructor(manager) {
    this.manager = manager;
    this.count = isMobile ? 14500 : 32000;
    this.uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector3(0, 0, 0) },
      uPointerActive: { value: 0 },
      uTvPosition: { value: new THREE.Vector3(0, 1.5, 0) },
      uLightDirection: { value: new THREE.Vector3(0, 0, 1) },
      uLightPower: { value: 1.0 }
    };

    const blade = new THREE.BufferGeometry();
    const singleBlade = [
      -.036, 0, 0,    .036, 0, 0,   -.028, .16, .006,
       .036, 0, 0,    .028, .16, .006, -.028, .16, .006,
      -.028, .16, .006, .028, .16, .006, -.013, .31, .020,
       .028, .16, .006, .013, .31, .020, -.013, .31, .020,
      -.013, .31, .020, .013, .31, .020, .026, .49, .038
    ];
    const tuftVertices = [];
    const tuftBlades = [
      { x: -.035, z: -.018, angle: -.78, height: .88, width: .92 },
      { x: 0, z: 0, angle: .18, height: 1.0, width: 1.0 },
      { x: .035, z: .018, angle: 1.02, height: .82, width: .90 }
    ];
    for (const tuft of tuftBlades) {
      for (let i = 0; i < singleBlade.length; i += 3) {
        const bx = singleBlade[i] * tuft.width;
        const by = singleBlade[i + 1] * tuft.height;
        const bz = singleBlade[i + 2];
        const ca = Math.cos(tuft.angle), sa = Math.sin(tuft.angle);
        tuftVertices.push(
          bx * ca - bz * sa + tuft.x,
          by,
          bx * sa + bz * ca + tuft.z
        );
      }
    }
    const vertices = new Float32Array(tuftVertices);
    blade.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    blade.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x718744,
      roughness: .88,
      metalness: 0,
      side: THREE.DoubleSide,
      vertexColors: true
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uPointer = this.uniforms.uPointer;
      shader.uniforms.uPointerActive = this.uniforms.uPointerActive;
      shader.uniforms.uTvPosition = this.uniforms.uTvPosition;
      shader.uniforms.uLightDirection = this.uniforms.uLightDirection;
      shader.uniforms.uLightPower = this.uniforms.uLightPower;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform vec3 uPointer;
         uniform float uPointerActive;
         uniform vec3 uTvPosition;
         uniform vec3 uLightDirection;
         uniform float uLightPower;
         varying float vTvGlow;
         varying float vBladeHeight;
         `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec4 worldBase = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
         float bladeH = clamp(transformed.y / 0.49, 0.0, 1.0);
         float seed = instanceColor.r * 31.0 + instanceColor.g * 17.0 + instanceColor.b * 9.0;
         float wind = sin(uTime * (1.05 + instanceColor.g * 1.1) + seed + worldBase.x * .65) * .085;
         wind += sin(uTime * .53 + worldBase.z * .8 + seed) * .035;
         vec2 bend = vec2(wind, cos(uTime * .7 + seed) * .018) * bladeH;
         vec2 pointerDelta = worldBase.xz - uPointer.xz;
         float pointerDist = length(pointerDelta);
         float influence = (1.0 - smoothstep(0.35, 4.2, pointerDist)) * uPointerActive;
         vec2 away = pointerDist > .001 ? pointerDelta / pointerDist : vec2(0.0, 1.0);
         bend += away * influence * .31 * bladeH;
         transformed.x += bend.x;
         transformed.z += bend.y;
         vBladeHeight = bladeH;
         float tvDist = distance(worldBase.xz, uTvPosition.xz);
         vec2 bladeToLight = normalize(uLightDirection.xz + vec2(0.001));
         vec2 bladeFromTv = normalize(pointerDelta + vec2(0.001));
         float facing = max(0.0, dot(bladeFromTv, bladeToLight));
         vTvGlow = exp(-tvDist * .34) * (.42 + facing * .58) * uLightPower;
         `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         varying float vTvGlow;
         varying float vBladeHeight;
         `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float tipLight = smoothstep(.35, 1.0, vBladeHeight);
         diffuseColor.rgb *= (0.94 + tipLight * .62);
         diffuseColor.rgb += vec3(1.0, .66, .34) * vTvGlow * .72 * (0.22 + tipLight * 1.15);
         `
      );
      material.userData.shader = shader;
    };

    this.mesh = new THREE.InstancedMesh(blade, material, this.count);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const random = (min, max) => min + Math.random() * (max - min);
    const spread = clamp(10 + manager.camera.aspect * 4.2, 13, 23);
    const gridColumns = Math.ceil(Math.sqrt(this.count * 1.65));
    const gridRows = Math.ceil(this.count / gridColumns);
    const cellWidth = (spread * 2) / gridColumns;
    const cellDepth = 12.0 / gridRows;
    for (let i = 0; i < this.count; i++) {
      const col = i % gridColumns;
      const row = Math.floor(i / gridColumns);
      const x = -spread + (col + random(.12, .88)) * cellWidth;
      const z = -2.9 + (row + random(.12, .88)) * cellDepth;
      const depthTint = clamp((z + 2.9) / 12.0, 0, 1);
      const foregroundKeep = .985 + (1.0 - depthTint) * .015;
      const nearScreen = Math.abs(x) < 1.24 && z > -.15 && z < 2.55;

      // Keep the CRT readable and gently thin the nearest foreground so individual blades remain visible.
      if ((nearScreen && Math.random() < .985) || Math.random() > foregroundKeep) {
        dummy.position.set(x, -20, z);
        dummy.scale.setScalar(.001);
      } else {
        const scale = random(.72, 1.16) * (z > 2.2 ? 1.06 : 1);
        const groundY = hillGround(x, z);
        const slopeX = (hillGround(x + .04, z) - hillGround(x - .04, z)) / .08;
        const slopeZ = (hillGround(x, z + .04) - hillGround(x, z - .04)) / .08;
        dummy.position.set(x, groundY + random(-.018, .018), z);
        dummy.rotation.set(
          -slopeZ * .22 + random(-.09, .09),
          random(0, Math.PI),
          slopeX * .22 + random(-.14, .14)
        );
        dummy.scale.set(
          scale * random(.72, 1.24),
          scale * random(.82, 1.24),
          scale * random(.78, 1.22)
        );
      }
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      const palette = Math.random();
      const variation = random(.88, 1.12);
      let red, green, blue;
      if (palette < .56) {
        red = .17; green = .25; blue = .085;       // muted olive
      } else if (palette < .84) {
        red = .22; green = .30; blue = .105;      // soft meadow green
      } else {
        red = .27; green = .235; blue = .105;     // dry warm grass
      }
      color.setRGB(
        (red + depthTint * .055) * variation,
        (green + depthTint * .045) * variation,
        (blue + depthTint * .018) * variation
      );
      this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    manager.scene.add(this.mesh);
  }

  update(time, pointerWorld, active, tvPosition, lightDirection, power) {
    this.uniforms.uTime.value = time;
    this.uniforms.uPointer.value.copy(pointerWorld);
    this.uniforms.uPointerActive.value = active ? 1 : 0;
    this.uniforms.uTvPosition.value.copy(tvPosition);
    this.uniforms.uLightDirection.value.copy(lightDirection);
    this.uniforms.uLightPower.value = power;
  }
}

class FireflySystem {
  constructor(manager) {
    this.manager = manager;
    this.count = isMobile ? 72 : 150;
    this.positions = new Float32Array(this.count * 3);
    this.seeds = new Float32Array(this.count);
    this.base = [];

    for (let i = 0; i < this.count; i++) {
      const x = (Math.random() - .5) * 22;
      const y = Math.random() * 5.2 + .25;
      const z = (Math.random() - .5) * 10 - 1;
      this.base.push({
        x, y, z,
        phase: Math.random() * Math.PI * 2,
        speed: .22 + Math.random() * .72
      });
      this.positions.set([x, y, z], i * 3);
      this.seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(this.seeds, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec3 p = position;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float pulse = .5 + .5 * sin(uTime * (1.1 + aSeed * 2.0) + aSeed * 19.0);
          vAlpha = smoothstep(.12, .92, pulse) * (.42 + aSeed * .42);
          vSeed = aSeed;
          gl_PointSize = clamp((2.8 + aSeed * 4.2 + pulse * 2.2) * (19.0 / max(1.0, -mv.z)), 2.0, 11.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec2 p = gl_PointCoord - .5;
          float d = length(p);
          float core = exp(-d * d * 90.0);
          float halo = exp(-d * d * 11.0);
          float alpha = (core * .82 + halo * .48) * vAlpha;
          vec3 amber = mix(vec3(1.0, .63, .31), vec3(1.0, .91, .68), vSeed);
          gl_FragColor = vec4(amber, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.points = new THREE.Points(geometry, this.material);
    manager.scene.add(this.points);
    this.geometry = geometry;
  }

  update(time) {
    for (let i = 0; i < this.count; i++) {
      const b = this.base[i];
      const t = time * b.speed + b.phase;
      this.positions[i * 3] = b.x + Math.sin(t * .72 + this.seeds[i]) * .42;
      this.positions[i * 3 + 1] = b.y + Math.sin(t * 1.3) * .32;
      this.positions[i * 3 + 2] = b.z + Math.cos(t * .8) * .3;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.material.uniforms.uTime.value = time;
  }
}

class Television {
  constructor(manager) {
    this.manager = manager;
    this.group = new THREE.Group();
    this.baseY = hillGround(0, .65) + .94;
    this.group.position.set(0, this.baseY, .65);
    manager.scene.add(this.group);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x171a20, roughness: .34, metalness: .3
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x34302a, roughness: .3, metalness: .48
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x090d15, roughness: .55, metalness: .18
    });

    const roundedRect = (w, h, r) => {
      const x = -w / 2, y = -h / 2;
      const shape = new THREE.Shape();
      shape.moveTo(x + r, y);
      shape.lineTo(x + w - r, y);
      shape.quadraticCurveTo(x + w, y, x + w, y + r);
      shape.lineTo(x + w, y + h - r);
      shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      shape.lineTo(x + r, y + h);
      shape.quadraticCurveTo(x, y + h, x, y + h - r);
      shape.lineTo(x, y + r);
      shape.quadraticCurveTo(x, y, x + r, y);
      return shape;
    };

    const cabinetGeometry = new THREE.ExtrudeGeometry(
      roundedRect(2.28, 1.58, .12),
      { depth: .76, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .035, bevelThickness: .035, curveSegments: 8 }
    );
    cabinetGeometry.translate(0, 0, -.38);
    const cabinet = new THREE.Mesh(cabinetGeometry, bodyMat);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.group.add(cabinet);

    const bezelShape = roundedRect(1.72, 1.34, .09);
    const bezelHole = roundedRect(1.47, 1.10, .045);
    bezelShape.holes.push(new THREE.Path(bezelHole.getPoints(12)));
    const bezelGeometry = new THREE.ExtrudeGeometry(bezelShape, {
      depth: .105, bevelEnabled: true, bevelSegments: 3,
      bevelSize: .018, bevelThickness: .018, curveSegments: 8
    });
    bezelGeometry.translate(0, 0, -.052);
    const bezel = new THREE.Mesh(bezelGeometry, trimMat);
    bezel.position.set(-.13, .02, .405);
    bezel.castShadow = true;
    this.group.add(bezel);

    // Fine inner lip: a subtle second layer around the CRT opening.
    const lipShape = roundedRect(1.82, 1.43, .105);
    const lipHole = roundedRect(1.72, 1.33, .085);
    lipShape.holes.push(new THREE.Path(lipHole.getPoints(16)));
    const lipGeometry = new THREE.ExtrudeGeometry(lipShape, {
      depth: .026, bevelEnabled: true, bevelSegments: 2,
      bevelSize: .008, bevelThickness: .008, curveSegments: 10
    });
    lipGeometry.translate(0, 0, -.013);
    const lip = new THREE.Mesh(lipGeometry, new THREE.MeshStandardMaterial({
      color: 0x57402b, roughness: .38, metalness: .42
    }));
    lip.position.set(-.13, .02, .385);
    this.group.add(lip);

    // Small metal fasteners on the cabinet corners.
    const screwMat = new THREE.MeshStandardMaterial({
      color: 0x9b8060, metalness: .78, roughness: .3
    });
    for (const [sx, sy] of [[-1.035, .69], [.99, .69], [-1.035, -.69], [.99, -.69]]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .012, 12), screwMat);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(sx, sy, .405);
      this.group.add(screw);
    }

    // Small maker badge on the lower front lip.
    const badgeCanvas = document.createElement("canvas");
    badgeCanvas.width = 256;
    badgeCanvas.height = 64;
    const badgeContext = badgeCanvas.getContext("2d");
    badgeContext.clearRect(0, 0, 256, 64);
    badgeContext.fillStyle = "#c6a77b";
    badgeContext.font = "600 27px Arial";
    badgeContext.textAlign = "center";
    badgeContext.textBaseline = "middle";
    badgeContext.fillText("LONG.PLAY", 128, 32);
    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    badgeTexture.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(.43, .108),
      new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true, depthWrite: false })
    );
    badge.position.set(-.13, -.695, .405);
    this.group.add(badge);

    // Convex CRT phosphor surface: the center of the glass bulges toward the viewer.
    const screenGeometry = new THREE.BufferGeometry();
    const cols = 32, rows = 24;
    const screenPositions = [];
    const screenIndices = [];
    for (let y = 0; y <= rows; y++) {
      const v = y / rows * 2 - 1;
      for (let x = 0; x <= cols; x++) {
        const u = x / cols * 2 - 1;
        screenPositions.push(
          u * .72,
          v * .535,
          .065 * (1 - u * u) * (1 - v * v)
        );
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const a = y * (cols + 1) + x;
        const b = a + 1;
        const c = a + cols + 2;
        const d = a + cols + 1;
        screenIndices.push(a, b, d, b, c, d);
      }
    }
    screenGeometry.setAttribute("position", new THREE.Float32BufferAttribute(screenPositions, 3));
    screenGeometry.setIndex(screenIndices);
    screenGeometry.computeVertexNormals();

    const screenMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xfff9e9,
      emissive: 0xffc66d,
      emissiveIntensity: 1.55,
      roughness: .12,
      metalness: 0,
      clearcoat: .85,
      clearcoatRoughness: .12,
      side: THREE.DoubleSide
    });
    this.screen = new THREE.Mesh(screenGeometry, screenMaterial);
    this.screen.position.set(-.13, .02, .535);
    this.group.add(this.screen);

    const reflection = new THREE.Mesh(
      new THREE.PlaneGeometry(1.24, .16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: .085,
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    reflection.position.set(-.13, .31, .598);
    reflection.rotation.z = -.12;
    this.group.add(reflection);

    const glassGlint = new THREE.Mesh(
      new THREE.PlaneGeometry(.72, .055),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: .045,
        depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );
    glassGlint.position.set(-.39, .43, .607);
    glassGlint.rotation.z = -.16;
    this.group.add(glassGlint);

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 256;
    const glowContext = glowCanvas.getContext("2d");
    const glowGradient = glowContext.createRadialGradient(128, 128, 8, 128, 128, 128);
    glowGradient.addColorStop(0, "rgba(255,246,214,0.92)");
    glowGradient.addColorStop(.22, "rgba(255,190,91,0.62)");
    glowGradient.addColorStop(.52, "rgba(255,130,48,0.22)");
    glowGradient.addColorStop(1, "rgba(255,110,35,0)");
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 256, 256);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;

    this.glowLayers = [];
    [
      { w: 3.9, h: 3.0, z: .475, opacity: .62 },
      { w: 2.65, h: 2.05, z: .49, opacity: .42 },
      { w: 1.95, h: 1.52, z: .505, opacity: .28 }
    ].forEach((layer) => {
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(layer.w, layer.h),
        new THREE.MeshBasicMaterial({
          map: glowTexture, color: 0xffc078,
          transparent: true, opacity: layer.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
          toneMapped: false
        })
      );
      glow.position.set(-.13, .02, layer.z);
      this.group.add(glow);
      this.glowLayers.push(glow);
    });

    // Fine ventilation slots and a small power indicator add scale and material detail.
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x05070b, roughness: .72 });
    for (let i = 0; i < 7; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(.035, .012, .012), ventMat);
      vent.position.set(.83 + (i % 2) * .055, -.48 - Math.floor(i / 2) * .045, .39);
      this.group.add(vent);
    }
    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(.018, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb66c })
    );
    indicator.position.set(.91, -.57, .405);
    this.group.add(indicator);
    this.indicator = indicator;

    const sideSeam = new THREE.Mesh(
      new THREE.BoxGeometry(.012, 1.24, .014),
      new THREE.MeshStandardMaterial({ color: 0x5b4938, metalness: .5, roughness: .42 })
    );
    sideSeam.position.set(1.105, 0, .392);
    this.group.add(sideSeam);

    const knobMaterial = new THREE.MeshStandardMaterial({
      color: 0x77716a, metalness: .72, roughness: .25
    });
    for (let i = 0; i < 2; i++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(.078, .078, .065, 28), knobMaterial);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(.91, .28 - i * .28, .425);
      this.group.add(knob);
      const knobCenter = new THREE.Mesh(
        new THREE.CylinderGeometry(.018, .018, .068, 12),
        darkMat
      );
      knobCenter.rotation.x = Math.PI / 2;
      knobCenter.position.copy(knob.position);
      knobCenter.position.z += .004;
      this.group.add(knobCenter);
    }

    const feetMat = darkMat;
    for (const x of [-.72, .72]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.18, .2, .22), feetMat);
      foot.position.set(x, -.83, .05);
      foot.rotation.z = x < 0 ? -.12 : .12;
      this.group.add(foot);
    }

    const antennaMat = new THREE.MeshStandardMaterial({
      color: 0x55545a, metalness: .72, roughness: .34
    });
    const pivot = new THREE.Group();
    pivot.position.set(0, .82, -.02);
    this.group.add(pivot);

    // Compact central mount so both telescopic rods visibly start at the TV's top.
    const antennaSocket = new THREE.Mesh(
      new THREE.CylinderGeometry(.055, .07, .075, 12),
      darkMat
    );
    antennaSocket.position.set(0, .035, 0);
    pivot.add(antennaSocket);

    // Shorter, thinner rabbit-ear rods with their end caps placed exactly at the rod tips.
    const rodLength = .78;
    const rodRadius = .009;
    const rodAngle = .46;
    const rodCenterX = .16;
    const rodCenterY = .31;
    const rod1 = new THREE.Mesh(
      new THREE.CylinderGeometry(rodRadius * .82, rodRadius, rodLength, 10),
      antennaMat
    );
    // The lower ends meet above the cabinet; the upper ends spread outward like classic rabbit ears.
    rod1.position.set(-rodCenterX, rodCenterY, 0);
    rod1.rotation.z = rodAngle;

    const rod2 = new THREE.Mesh(
      new THREE.CylinderGeometry(rodRadius * .82, rodRadius, rodLength, 10),
      antennaMat
    );
    rod2.position.set(rodCenterX, rodCenterY, 0);
    rod2.rotation.z = -rodAngle;
    pivot.add(rod1, rod2);

    this.tvLight = new THREE.PointLight(0xffbd62, 15, 11.5, 1.45);
    this.tvLight.position.set(-.13, .02, 1.00);
    this.group.add(this.tvLight);

    this.spot = new THREE.SpotLight(0xffc36c, 5.2, 12, Math.PI / 4.2, .78, 1.15);
    this.spot.position.set(0, .15, 1.05);
    this.spot.target.position.set(0, -.6, 5.5);
    manager.scene.add(this.spot, this.spot.target);

    this.targetRotX = 0;
    this.targetRotY = 0;
    this.lightDirection = new THREE.Vector3(0, 0, 1);
    this.worldPosition = new THREE.Vector3();
  }

  update(time, pointer, active) {
    const targetY = active ? clamp(pointer.x * .27, -.27, .27) : Math.sin(time * .22) * .018;
    const targetX = active ? clamp(-pointer.y * .12, -.12, .12) : 0;
    this.group.rotation.y = lerp(this.group.rotation.y, targetY, .055);
    this.group.rotation.x = lerp(this.group.rotation.x, targetX, .055);
    this.group.position.y = this.baseY + Math.sin(time * .8) * .025;

    const direction = new THREE.Vector3(0, -.08, 1).applyQuaternion(this.group.quaternion).normalize();
    this.lightDirection.lerp(direction, .12).normalize();

    this.group.getWorldPosition(this.worldPosition);
    const spotOrigin = this.group.localToWorld(new THREE.Vector3(-.13, .02, .60));
    this.spot.position.copy(spotOrigin);
    this.spot.target.position.copy(spotOrigin).add(this.lightDirection.clone().multiplyScalar(5.5));
    this.spot.target.position.y -= .8;
    this.spot.intensity = active ? 6.0 : 5.0;
    const screenPulse = Math.sin(time * 2.2) * .035 + Math.sin(time * 7.1) * .012;
    this.tvLight.intensity = 14.5 + screenPulse * 5.0;
    this.screen.material.emissiveIntensity = 1.55 + screenPulse * 0.65;
    this.glowLayers.forEach((glow, index) => { glow.material.opacity = [ .60, .40, .27 ][index] + screenPulse * (index + 1) * .22; });
    this.indicator.material.color.setHSL(.08, .9, .48 + (Math.sin(time * 2.4) + 1) * .08);
  }
}

class LightingSystem {
  constructor(manager) {
    this.manager = manager;
    this.ambient = new THREE.HemisphereLight(0x9fb9ff, 0x26331d, 1.45);
    manager.scene.add(this.ambient);

    this.sunset = new THREE.DirectionalLight(0xffb9a2, 1.45);
    this.sunset.position.set(-5, 5, -4);
    this.sunset.castShadow = !isMobile;
    this.sunset.shadow.mapSize.set(1024, 1024);
    this.sunset.shadow.camera.left = -10;
    this.sunset.shadow.camera.right = 10;
    this.sunset.shadow.camera.top = 8;
    this.sunset.shadow.camera.bottom = -5;
    manager.scene.add(this.sunset);
  }
}

class InteractionManager {
  constructor(manager) {
    this.manager = manager;
    this.targetPointer = new THREE.Vector2();
    this.currentPointer = new THREE.Vector2();
    this.active = false;

    hero.addEventListener("pointermove", (event) => {
      manager.setPointer(event);
      this.targetPointer.copy(manager.pointer);
      this.active = true;
    }, { passive: true });

    hero.addEventListener("pointerleave", () => {
      manager.clearPointer();
      this.active = false;
    }, { passive: true });

    hero.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        manager.setPointer(event);
        this.targetPointer.copy(manager.pointer);
        this.active = true;
      }
    }, { passive: true });
  }

  update(delta = 1 / 60) {
    const blend = 1 - Math.exp(-delta * 5.0);
    this.currentPointer.lerp(this.targetPointer, blend);
    return this.currentPointer;
  }
}

class AnimationManager {
  constructor(sceneManager, systems) {
    this.manager = sceneManager;
    this.systems = systems;
    this.frame = 0;
    this.running = false;
    this.animate = this.animate.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.start();
  }

  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.manager.clock.start();
    this.frame = requestAnimationFrame(this.animate);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  onVisibilityChange() {
    if (document.hidden) this.stop();
    else this.start();
  }

  animate() {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.manager.clock.getDelta(), .04);
    this.manager.elapsed += delta;
    const time = this.manager.elapsed;

    if (!reducedMotion) {
      const pointer = this.systems.interaction.update(delta);
      this.systems.sky.update(time);
      this.systems.clouds.update(time, pointer);
      this.systems.hills.update(time, pointer);
      this.systems.television.update(time, pointer, this.systems.interaction.active);
      this.systems.fireflies.update(time);

      this.systems.grass.update(
        time,
        this.manager.pointerWorld,
        this.systems.interaction.active,
        this.systems.television.worldPosition,
        this.systems.television.lightDirection,
        this.systems.interaction.active ? 2.35 : 2.1
      );
    }
    this.manager.render();
  }
}

/* Scene boot */
const manager = new SceneManager();
const systems = {
  sky: new Sky(manager),
  clouds: new CloudSystem(manager),
  hills: new HillSystem(manager),
  lighting: new LightingSystem(manager),
  television: new Television(manager),
  grass: null,
  fireflies: new FireflySystem(manager),
  interaction: null
};
systems.grass = new GrassSystem(manager);
systems.interaction = new InteractionManager(manager);
new AnimationManager(manager, systems);

/* Mobile navigation */
const menuToggle = $(".menu-toggle");
const nav = $(".main-nav");
menuToggle?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});
nav?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

