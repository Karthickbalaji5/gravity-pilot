import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { CompanionTaskState, EmotionType, VisemeType, VRMDiagnostics, ActionTag } from '../types/nila';
import { VRMAnimationController, type AnimationState } from './VRMAnimationController';
import { ClipLibrary, type ActionName } from './ClipLibrary';

export class VRMManager {
  private container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  private clock: THREE.Clock;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lookTarget: THREE.Object3D;
  private firstFrameRendered = false;

  public animationController: VRMAnimationController;
  public clipLibrary: ClipLibrary;
  public currentVRM: VRM | null = null;
  public diagnostics: VRMDiagnostics = {
    loaded: false,
    modelName: 'Nila Avatar (VRM 1.0)',
    vrmVersion: 'VRM 1.0',
    author: 'VRoid',
    expressions: [],
    boneCount: 0,
    springBoneSprings: 0,
    pipelineStages: {},
  };

  // Base bone transforms & framing
  private baseHipsY: number | null = null;
  private headHeight = 1.35;

  // Task & Emotion State
  private currentTaskState: CompanionTaskState = 'IDLE';
  private currentEmotion: EmotionType = 'relaxed';
  private targetEmotion: EmotionType = 'relaxed';
  private emotionBlendWeight = 0;
  private shyWeight = 0;
  private targetShyWeight = 0;

  // Blinking
  private blinkTimer = 0;
  private nextBlinkInterval = 3.5;
  private isBlinking = false;
  private blinkProgress = 0;
  private isDoubleBlink = false;

  // Mouse & Gaze Tracking
  private mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

  // Audio-driven Lip-Sync
  private audioAnalyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private mouthOpenValue = 0;
  private currentViseme: VisemeType = 'aa';
  private manualSpeechPulse = 0;

  // Pet mode
  private petMode = false;
  private lastFrameTime = 0;
  private readonly PET_FPS = 30;

  // Camera framing defaults (full-body default)
  private defaultCameraPos = new THREE.Vector3(0, 0.70, 3.40);
  private defaultTargetPos = new THREE.Vector3(0, 0.70, 0);
  public modelBoundingBox: THREE.Box3 = new THREE.Box3();
  public modelHeight: number = 1.38;
  public modelCenter: THREE.Vector3 = new THREE.Vector3(0, 0.69, 0);
  public currentFramingPreset: 'full' | 'bust' | 'closeup' = 'full';

  public getSceneDebugInfo(): any {
    const gl = this.renderer.getContext();
    const glError = gl ? gl.getError() : null;
    const meshes: any[] = [];

    if (this.currentVRM) {
      this.currentVRM.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const geom = m.geometry;
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          meshes.push({
            name: m.name,
            type: m.type,
            visible: m.visible,
            frustumCulled: m.frustumCulled,
            vertices: geom ? geom.attributes.position?.count : 0,
            matType: mat?.type,
            matVisible: mat?.visible,
            matOpacity: mat?.opacity,
            matTransparent: mat?.transparent,
            position: m.position.toArray(),
            scale: m.scale.toArray(),
          });
        }
      });
    }

    return {
      glError,
      canvas: {
        clientWidth: this.container?.clientWidth,
        clientHeight: this.container?.clientHeight,
        bufferWidth: this.renderer.domElement.width,
        bufferHeight: this.renderer.domElement.height,
      },
      render: {
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        lines: this.renderer.info.render.lines,
        points: this.renderer.info.render.points,
        frame: this.renderer.info.render.frame,
      },
      camera: {
        pos: this.camera.position.toArray(),
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far,
        aspect: this.camera.aspect,
      },
      target: this.controls.target.toArray(),
      sceneChildren: this.scene.children.map((c) => ({
        name: c.name || c.type,
        type: c.type,
        visible: c.visible,
      })),
      vrmScene: this.currentVRM ? {
        visible: this.currentVRM.scene.visible,
        position: this.currentVRM.scene.position.toArray(),
        scale: this.currentVRM.scene.scale.toArray(),
        meshCount: meshes.length,
        meshes: meshes.slice(0, 6),
      } : null,
    };
  }

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.animationController = new VRMAnimationController();
    this.clipLibrary = new ClipLibrary();

    // Ensure container styling prevents canvas blowout and fills available space
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.right = '0';
    this.container.style.bottom = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';

    // Scene
    this.scene = new THREE.Scene();

    // Look target for VRM eyes
    this.lookTarget = new THREE.Object3D();
    this.scene.add(this.lookTarget);

    // Camera initial calculation
    const width = Math.max(container.clientWidth || 360, 100);
    const height = Math.max(container.clientHeight || 480, 100);
    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 50.0);
    this.camera.position.copy(this.defaultCameraPos);

    // Renderer (with full transparency support)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    // Crucial: passing false prevents Three.js from setting inline width/height on DOM style
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Force canvas element strictly to 100% of container via absolute position
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.container.appendChild(canvas);

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.copy(this.defaultTargetPos);
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 8.0;
    this.controls.minPolarAngle = Math.PI / 6;
    this.controls.maxPolarAngle = Math.PI / 1.7;
    this.controls.enablePan = false;
    this.controls.update();

    // Lighting setup tailored for anime cell shading and VRM materials
    this.setupLighting();

    // ResizeObserver on the container keeps WebGL canvas pixel-perfect on any layout change
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.onResize();
      });
      this.resizeObserver.observe(this.container);
    }

    // Window event listeners
    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouseMove);

    // Initial resize trigger to lock in exact dimensions once mounted
    requestAnimationFrame(() => this.onResize());

    // Start render loop
    this.animate();
  }

  private setupLighting(): void {
    // Ambient light - soft warm fill
    const ambientLight = new THREE.AmbientLight(0xf8fafc, 1.1);
    this.scene.add(ambientLight);

    // Key directional light - warm bright front-right
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.4);
    keyLight.position.set(1.5, 2.4, 2.0);
    this.scene.add(keyLight);

    // Fill light - soft cool blue front-left
    const fillLight = new THREE.DirectionalLight(0xc7d2fe, 0.9);
    fillLight.position.set(-1.8, 1.8, 1.8);
    this.scene.add(fillLight);

    // Rim / Back light - anime silhouette glow from behind
    const rimLight = new THREE.DirectionalLight(0xe9d5ff, 1.6);
    rimLight.position.set(0, 2.8, -2.2);
    this.scene.add(rimLight);

    // Subtle bottom bounce light
    const bounceLight = new THREE.DirectionalLight(0xfce7f3, 0.4);
    bounceLight.position.set(0, -1.2, 1.0);
    this.scene.add(bounceLight);
  }

  public async loadVRM(
    url: string,
    onProgress?: (progress: number) => void
  ): Promise<VRM> {
    return new Promise((resolve, reject) => {
      // Diagnostic Stage 1: VRM loading begins
      console.log('[VRM-Pipeline] Stage 1: VRM loading begins', { url });
      this.diagnostics.pipelineStages = {
        ...this.diagnostics.pipelineStages,
        stage1_started: true,
      };

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      loader.load(
        url,
        (gltf) => {
          // Diagnostic Stage 3: GLTF parsing completes
          console.log('[VRM-Pipeline] Stage 3: GLTF parsing completes', {
            scenes: gltf.scenes?.length,
            animations: gltf.animations?.length,
          });

          const vrm = gltf.userData.vrm as VRM;
          if (!vrm) {
            const err = 'Failed to extract VRM data from model file';
            console.error('[VRM-Pipeline] Stage 4: FAILED - Not a valid VRM extension', err);
            this.diagnostics.error = err;
            reject(new Error(err));
            return;
          }

          // Diagnostic Stage 4: VRM extension is recognized
          const isVRM0 = (vrm.meta as any)?.metaVersion === '0';
          if (isVRM0) {
            VRMUtils.rotateVRM0(vrm);
            this.diagnostics.vrmVersion = '0.x';
          } else {
            this.diagnostics.vrmVersion = '1.0';
          }

          console.log('[VRM-Pipeline] Stage 4: VRM extension recognized', {
            modelName: (vrm.meta as any)?.name || (vrm.meta as any)?.title || 'AvatarSample_A',
            vrmVersion: this.diagnostics.vrmVersion,
          });

          // Diagnostic Stage 5: The VRM humanoid and scene are available
          if (!vrm.scene || !vrm.humanoid) {
            const err = 'VRM scene or humanoid definition is missing';
            console.error('[VRM-Pipeline] Stage 5: FAILED', err);
            this.diagnostics.error = err;
            reject(new Error(err));
            return;
          }

          let meshCount = 0;
          let boneCount = 0;

          // CRITICAL FIX: Disable frustum culling on all SkinnedMeshes!
          // In Three.js with @pixiv/three-vrm, SkinnedMeshes default to frustumCulled=true,
          // which tests unskinned rest-pose bounding spheres and culls the meshes when framed closely.
          vrm.scene.traverse((obj) => {
            obj.frustumCulled = false;
            if ((obj as THREE.Mesh).isMesh) {
              meshCount++;
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
            }
            if ((obj as THREE.Bone).isBone) {
              boneCount++;
            }
          });

          console.log('[VRM-Pipeline] Stage 5: VRM humanoid and scene available', {
            boneCount,
            meshCount,
            humanoid: !!vrm.humanoid,
          });

          // Remove previous VRM if exists
          if (this.currentVRM) {
            this.scene.remove(this.currentVRM.scene);
            VRMUtils.deepDispose(this.currentVRM.scene);
          }

          // Diagnostic Stage 6: The model is added to the Three.js scene
          this.currentVRM = vrm;
          this.scene.add(vrm.scene);
          vrm.scene.position.set(0, 0, 0);

          // Connect eye tracking target if available
          if (vrm.lookAt) {
            vrm.lookAt.target = this.lookTarget;
            vrm.lookAt.autoUpdate = true;
          }

          // CRITICAL FIX: Force matrix world update so child bones have valid world coordinates!
          vrm.scene.updateMatrixWorld(true);

          console.log('[VRM-Pipeline] Stage 6: Model added to Three.js scene and matrix world updated', {
            sceneChildren: this.scene.children.length,
          });

          // Diagnostic Stage 7: The camera and model are positioned correctly
          const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips');
          if (hipsNode) {
            const hipsPos = new THREE.Vector3();
            hipsNode.getWorldPosition(hipsPos);
            this.baseHipsY = hipsPos.y;
          }

          // Measure head position to frame camera properly
          const headNode = vrm.humanoid.getNormalizedBoneNode('head');
          if (headNode) {
            const headPos = new THREE.Vector3();
            headNode.getWorldPosition(headPos);
            this.headHeight = headPos.y && headPos.y > 0.8 ? headPos.y : 1.35;
          } else {
            this.headHeight = 1.35;
          }

          // Compute precise bounding box from VRM scene
          const bbox = new THREE.Box3().setFromObject(vrm.scene);
          this.modelBoundingBox = bbox;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          this.modelHeight = size.y > 0.5 ? size.y : 1.38;
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          this.modelCenter.copy(center);

          // Diagnostic Stage 7: Set default full-body camera framing
          this.currentFramingPreset = 'full';
          this.fitCameraToModel('full');

          console.log('[VRM-Pipeline] Stage 7: Full-body camera and model positioned correctly', {
            modelHeight: this.modelHeight,
            headHeight: this.headHeight,
            modelCenter: this.modelCenter.toArray(),
            cameraPos: this.camera.position.toArray(),
            targetPos: this.controls.target.toArray(),
          });

          // Populate diagnostics
          this.diagnostics.loaded = true;
          this.diagnostics.modelName =
            (vrm.meta as any)?.name || (vrm.meta as any)?.title || 'Nila (AvatarSample_A)';
          this.diagnostics.author = Array.isArray((vrm.meta as any)?.authors)
            ? (vrm.meta as any).authors.join(', ')
            : (vrm.meta as any)?.author || 'VRoid Project';
          this.diagnostics.boneCount = boneCount;
          this.diagnostics.headHeight = this.headHeight;
          this.diagnostics.cameraPos = `(${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)})`;
          this.diagnostics.targetPos = `(${this.controls.target.x.toFixed(2)}, ${this.controls.target.y.toFixed(2)}, ${this.controls.target.z.toFixed(2)})`;

          // Extract available expressions
          const expressions: string[] = [];
          if (vrm.expressionManager?.expressions) {
            vrm.expressionManager.expressions.forEach((exp) => {
              expressions.push(exp.expressionName);
            });
          }
          this.diagnostics.expressions = expressions;

          // Spring bones
          const springs = (vrm.springBoneManager as any)?.springs?.length || 0;
          this.diagnostics.springBoneSprings = springs;

          this.diagnostics.pipelineStages = {
            stage1_started: true,
            stage2_assetLoaded: true,
            stage3_gltfParsed: true,
            stage4_vrmRecognized: true,
            stage5_humanoidReady: true,
            stage6_sceneAdded: true,
            stage7_cameraFramed: true,
            stage8_firstRender: false,
          };

          // Reset first frame render state so stage 8 triggers on next animate
          this.firstFrameRendered = false;

          // Bind animation controller to VRM humanoid rig
          this.animationController.bindVRM(vrm);
          this.diagnostics.availableBones = this.animationController.getAvailableBones();
          this.diagnostics.animationState = this.animationController.getCurrentState();

          // Bind and preload ClipLibrary (non-blocking)
          this.clipLibrary.bind(vrm);
          this.clipLibrary.preload().catch(() => {});

          // Set default relaxed state
          this.setTaskState('IDLE');

          resolve(vrm);
        },
        (event) => {
          // Diagnostic Stage 2: The asset request succeeds / in-progress
          if (event.lengthComputable && onProgress) {
            const pct = Math.round((event.loaded / event.total) * 100);
            onProgress(pct);
            console.log('[VRM-Pipeline] Stage 2: Asset request progress', {
              loaded: event.loaded,
              total: event.total,
              pct,
            });
          }
        },
        (error) => {
          console.error('[VRM-Pipeline] Model loading error:', error);
          this.diagnostics.error = String(error);
          reject(error);
        }
      );
    });
  }

  /**
   * Synchronize Avatar animation with actual Task State from backend LangGraph workflow
   */
  public setTaskState(state: CompanionTaskState): void {
    this.currentTaskState = state;
    this.animationController.setTaskState(state);
    this.diagnostics.animationState = this.animationController.getCurrentState();
  }

  public getTaskState(): CompanionTaskState {
    return this.currentTaskState;
  }

  /**
   * Play specific humanoid gesture (e.g. GREETING wave, PRESENTING, COMPLETED celebration)
   */
  public playGesture(gesture: AnimationState, duration?: number): void {
    this.animationController.playGesture(gesture, duration);
    this.diagnostics.animationState = this.animationController.getCurrentState();
  }

  /**
   * Set animation state directly
   */
  public setAnimationState(state: AnimationState): void {
    this.animationController.setAnimationState(state);
    this.diagnostics.animationState = this.animationController.getCurrentState();
  }

  /**
   * Notify animation controller when TTS or speech output is actively speaking
   */
  public setSpeaking(speaking: boolean): void {
    this.animationController.setSpeaking(speaking);
    this.diagnostics.animationState = this.animationController.getCurrentState();
  }

  public setEmotion(emotion: EmotionType): void {
    this.targetEmotion = emotion;
    this.animationController.setEmotion(emotion);
  }

  /**
   * Set Web Audio API Analyser for real-time FFT lip-sync
   */
  public setAudioAnalyser(analyser: AnalyserNode | null): void {
    this.audioAnalyser = analyser;
    this.animationController.setAudioAnalyser(analyser);
  }

  /**
   * Manual speech pulse for speech boundary events (TTS fallback)
   */
  public pulseMouth(intensity: number = 0.8, vowel: VisemeType = 'aa'): void {
    this.animationController.pulseMouth(intensity, vowel);
  }

  private static readonly ACTION_TO_ANIM: Record<ActionTag, AnimationState> = {
    wave: 'GREETING',
    nod: 'IDLE',
    think: 'THINKING',
    shrug: 'IDLE',
    happy: 'COMPLETED',
    excited: 'COMPLETED',
    gotit: 'IDLE',
    proud: 'PRESENTING',
    present: 'PRESENTING',
  };

  public playAction(action: ActionTag): void {
    const actionName = action as ActionName;
    if (this.clipLibrary.hasClip(actionName)) {
      this.clipLibrary.play(actionName);
    } else {
      const anim = VRMManager.ACTION_TO_ANIM[action];
      if (anim) this.playGesture(anim, 3000);
    }
  }

  public setPetMode(enabled: boolean): void {
    this.petMode = enabled;
    if (enabled) {
      this.renderer.setPixelRatio(1);
      this.controls.enabled = false;
      this.fitCameraToModel('full');
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.controls.enabled = true;
    }
  }

  public getAssetTable() {
    return this.clipLibrary.getAssetTable();
  }

  /**
   * Fit camera framing to model with presets ('full' | 'bust' | 'closeup')
   * Uses real bounding box, vertical height, aspect ratio, and headroom for raised arms.
   */
  public fitCameraToModel(preset: 'full' | 'bust' | 'closeup' = 'full'): void {
    this.currentFramingPreset = preset;
    if (!this.container) return;

    const width = this.container.clientWidth || 360;
    const height = this.container.clientHeight || 480;
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const fovRad = (this.camera.fov * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRad / 2);

    if (preset === 'full') {
      // Model full height + generous headroom for raised arms + bottom clearance
      const frameHeight = Math.max(1.38, this.modelHeight) + 0.42;
      const frameWidth = 1.30;

      const distVert = frameHeight / (2 * tanHalfFov);
      const distHoriz = frameWidth / (2 * tanHalfFov * aspect);
      const dist = Math.max(distVert, distHoriz);

      // Body vertical center with slight target elevation so feet sit cleanly above bottom toolbar / margins
      const targetY = (this.modelCenter.y || 0.69) + 0.08;
      this.defaultTargetPos.set(0, targetY, 0);
      this.defaultCameraPos.set(0, targetY, dist);
    } else if (preset === 'bust') {
      const targetY = this.headHeight - 0.22;
      const dist = Math.max(1.35, 1.15 / aspect);
      this.defaultTargetPos.set(0, targetY, 0);
      this.defaultCameraPos.set(0, targetY, dist);
    } else if (preset === 'closeup') {
      const targetY = this.headHeight - 0.04;
      const dist = Math.max(0.85, 0.70 / aspect);
      this.defaultTargetPos.set(0, targetY, 0);
      this.defaultCameraPos.set(0, targetY, dist);
    }

    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.copy(this.defaultTargetPos);
    this.camera.lookAt(this.defaultTargetPos);
    this.controls.update();
  }

  public resetCamera(): void {
    this.fitCameraToModel('full');
  }

  public setCameraFraming(preset: 'closeup' | 'bust' | 'full'): void {
    this.fitCameraToModel(preset);
  }

  public zoomIn(): void {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const currentDist = dir.length();
    const newDist = Math.max(this.controls.minDistance, currentDist * 0.82);
    dir.normalize().multiplyScalar(newDist);
    this.camera.position.copy(this.controls.target).add(dir);
    this.controls.update();
  }

  public zoomOut(): void {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const currentDist = dir.length();
    const newDist = Math.min(this.controls.maxDistance, currentDist * 1.22);
    dir.normalize().multiplyScalar(newDist);
    this.camera.position.copy(this.controls.target).add(dir);
    this.controls.update();
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    this.mouse.targetX = Math.max(-1, Math.min(1, (x - 0.5) * 2));
    this.mouse.targetY = Math.max(-1, Math.min(1, (y - 0.5) * 2));
    this.animationController.setGazeOffset(this.mouse.targetX, this.mouse.targetY);
  };

  public onResize = (): void => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    this.renderer.setSize(width, height, false);
    this.fitCameraToModel(this.currentFramingPreset);
  };

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Pet mode: cap at 30fps
    if (this.petMode) {
      const now = performance.now();
      if (now - this.lastFrameTime < 1000 / this.PET_FPS) return;
      this.lastFrameTime = now;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.getElapsedTime();

    this.controls.update();

    if (this.currentVRM) {
      // Smooth mouse lerping
      this.mouse.x += (this.mouse.targetX - this.mouse.x) * Math.min(1.0, delta * 4.0);
      this.mouse.y += (this.mouse.targetY - this.mouse.y) * Math.min(1.0, delta * 4.0);

      // Update eye look target to follow camera and subtle mouse gaze
      this.lookTarget.position.set(
        this.camera.position.x + this.mouse.x * 0.25,
        this.camera.position.y - this.mouse.y * 0.15,
        this.camera.position.z
      );

      // 1. Unified Animation Controller: Full-body gestures, organic idle breathing/sway, expressions, and lip-sync
      this.animationController.update(delta, time);
      this.diagnostics.animationState = this.animationController.getCurrentState();

      // 1b. ClipLibrary mixer (file-based animations)
      this.clipLibrary.update(delta);

      // 2. Update VRM spring bones & secondary physics
      this.currentVRM.update(delta);
    }

    this.renderer.render(this.scene, this.camera);

    // Diagnostic Stage 8: First animation frame renders successfully
    if (!this.firstFrameRendered && this.currentVRM) {
      this.firstFrameRendered = true;
      const calls = this.renderer.info.render.calls;
      const triangles = this.renderer.info.render.triangles;
      console.log('[VRM-Pipeline] Stage 8: First animation frame rendered successfully', {
        drawCalls: calls,
        triangles: triangles,
        points: this.renderer.info.render.points,
        lines: this.renderer.info.render.lines,
      });

      if (this.diagnostics.pipelineStages) {
        this.diagnostics.pipelineStages.stage8_firstRender = true;
      }
      this.diagnostics.renderCalls = calls;
      this.diagnostics.triangles = triangles;
    }
  };

  private _raycaster = new THREE.Raycaster();
  private _rayMouse = new THREE.Vector2();

  public hitTest(clientX: number, clientY: number): boolean {
    if (!this.currentVRM) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._rayMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._rayMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._rayMouse, this.camera);
    const meshes: THREE.Mesh[] = [];
    this.currentVRM.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    return this._raycaster.intersectObjects(meshes, false).length > 0;
  }

  public destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);

    if (this.currentVRM) {
      this.scene.remove(this.currentVRM.scene);
      VRMUtils.deepDispose(this.currentVRM.scene);
    }

    this.clipLibrary.destroy();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
