import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export type ActionName =
  | 'idle' | 'walk' | 'wave' | 'happy' | 'excited' | 'gotit'
  | 'proud' | 'present' | 'stretch' | 'think' | 'nod' | 'shrug'
  | 'typing' | 'sit' | 'sleep' | 'afk' | 'cute_pose' | 'falling';

interface PoseData {
  pose: Record<string, [number, number, number, number]>;
  hipsOffsetY?: number;
}

const VRMA_MAP: Partial<Record<ActionName, string>> = {
  wave: '/animations/greeting.vrma',
  happy: '/animations/peace_sign.vrma',
  excited: '/animations/spin.vrma',
  gotit: '/animations/shoot.vrma',
  proud: '/animations/model_pose.vrma',
  present: '/animations/show_full_body.vrma',
  stretch: '/animations/squat.vrma',
};

const FBX_MAP: Partial<Record<ActionName, string[]>> = {
  idle: ['idle'],
  walk: ['walking'],
  think: ['thinking'],
  nod: ['head_nod'],
  shrug: ['shrug'],
  typing: ['typing'],
  happy: ['clapping'],
  falling: ['falling'],
};

const LOOP_ACTIONS: Set<ActionName> = new Set([
  'idle', 'walk', 'typing', 'think', 'sit', 'sleep',
]);

const EXPRESSION_TRACKS = /expressions?\//i;

export class ClipLibrary {
  private mixer: THREE.AnimationMixer | null = null;
  private vrm: VRM | null = null;
  private clips: Map<string, THREE.AnimationClip> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private currentLoop: THREE.AnimationAction | null = null;
  private poseData: Map<string, PoseData> = new Map();
  private baseHipsY = 0;
  private loadedAssets: Set<string> = new Set();
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;
  private _boundOnFinished: ((e: any) => void) | null = null;
  private _idleBreathClip: THREE.AnimationClip | null = null;
  private _breathAction: THREE.AnimationAction | null = null;

  public assetStatus: Map<ActionName, string> = new Map();

  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.register((p) => new VRMAnimationLoaderPlugin(p));
    this.fbxLoader = new FBXLoader();
  }

  public bind(vrm: VRM): void {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) this.baseHipsY = hips.position.y;

    this._boundOnFinished = (e: any) => {
      const clip = e.action?.getClip();
      if (clip && !clip.name.startsWith('__loop_') && !clip.name.startsWith('__breath')) {
        this.returnToLoop();
      }
    };
    this.mixer.addEventListener('finished', this._boundOnFinished);
  }

  public update(delta: number): void {
    this.mixer?.update(delta);
  }

  public async preload(): Promise<void> {
    if (!this.vrm) return;
    const promises: Promise<void>[] = [];

    for (const [action, url] of Object.entries(VRMA_MAP)) {
      promises.push(this.loadVRMA(action as ActionName, url));
    }

    // Try loading FBX files that exist
    for (const [action, keywords] of Object.entries(FBX_MAP)) {
      for (const kw of keywords) {
        promises.push(this.tryLoadFBX(action as ActionName, kw));
      }
    }

    // Load JSON poses
    promises.push(this.loadAllPoses());

    await Promise.allSettled(promises);
  }

  private async loadVRMA(action: ActionName, url: string): Promise<void> {
    if (this.loadedAssets.has(url)) return;
    try {
      const gltf = await new Promise<any>((resolve, reject) => {
        this.gltfLoader.load(url, resolve, undefined, reject);
      });

      const vrmAnim = gltf.userData.vrmAnimations?.[0];
      if (!vrmAnim || !this.vrm) return;

      let clip = createVRMAnimationClip(vrmAnim, this.vrm);
      clip.name = action;

      // Strip expression tracks so they don't fight emotion system
      clip.tracks = clip.tracks.filter(t => !EXPRESSION_TRACKS.test(t.name));

      this.clips.set(action, clip);
      this.loadedAssets.add(url);
      this.assetStatus.set(action, url.split('/').pop()!);
    } catch {
      // VRMA not available
    }
  }

  private async tryLoadFBX(action: ActionName, keyword: string): Promise<void> {
    if (this.clips.has(action)) return; // VRMA already loaded for this action

    const possibleNames = [
      keyword, keyword.toLowerCase(), keyword.charAt(0).toUpperCase() + keyword.slice(1),
      keyword.toUpperCase(),
    ];

    for (const name of possibleNames) {
      const url = `/animations/${name}.fbx`;
      try {
        const fbx = await new Promise<THREE.Group>((resolve, reject) => {
          this.fbxLoader.load(url, resolve, undefined, reject);
        });

        if (fbx.animations.length > 0 && this.vrm) {
          const clip = this.retargetMixamo(fbx.animations[0], this.vrm);
          clip.name = action;
          this.clips.set(action, clip);
          this.assetStatus.set(action, `${name}.fbx`);
          return;
        }
      } catch {
        // File doesn't exist, continue trying
      }
    }
  }

  private retargetMixamo(clip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip {
    const mixamoToVRM: Record<string, string> = {
      'mixamorigHips': 'hips', 'mixamorigSpine': 'spine', 'mixamorigSpine1': 'chest',
      'mixamorigSpine2': 'upperChest', 'mixamorigNeck': 'neck', 'mixamorigHead': 'head',
      'mixamorigLeftShoulder': 'leftShoulder', 'mixamorigRightShoulder': 'rightShoulder',
      'mixamorigLeftArm': 'leftUpperArm', 'mixamorigRightArm': 'rightUpperArm',
      'mixamorigLeftForeArm': 'leftLowerArm', 'mixamorigRightForeArm': 'rightLowerArm',
      'mixamorigLeftHand': 'leftHand', 'mixamorigRightHand': 'rightHand',
      'mixamorigLeftUpLeg': 'leftUpperLeg', 'mixamorigRightUpLeg': 'rightUpperLeg',
      'mixamorigLeftLeg': 'leftLowerLeg', 'mixamorigRightLeg': 'rightLowerLeg',
      'mixamorigLeftFoot': 'leftFoot', 'mixamorigRightFoot': 'rightFoot',
      'mixamorigLeftToeBase': 'leftToes', 'mixamorigRightToeBase': 'rightToes',
    };

    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const [bonePart, prop] = track.name.split('.');
      const vrmBone = mixamoToVRM[bonePart];
      if (!vrmBone) continue;
      const node = vrm.humanoid.getNormalizedBoneNode(vrmBone as any);
      if (!node) continue;

      if (prop === 'quaternion') {
        tracks.push(new THREE.QuaternionKeyframeTrack(
          `${node.name}.quaternion`, Array.from(track.times), Array.from(track.values)
        ));
      } else if (prop === 'position' && vrmBone === 'hips') {
        tracks.push(new THREE.VectorKeyframeTrack(
          `${node.name}.position`, Array.from(track.times), Array.from(track.values)
        ));
      }
    }

    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  private async loadAllPoses(): Promise<void> {
    const knownPoses = [
      'emote_collector_AFK', 'emote_collector_Sit_Girly', 'emote_collector_Sit_KneeBend',
      'emote_collector_Sit_Spread', 'emote_collector_Sleep_Down', 'emote_collector_Sleep_Side',
      'emote_collector_Sleep_Sprawled', 'emote_collector_Sleep_Up',
    ];
    for (let i = 1; i <= 10; i++) knownPoses.push(`nizi_poses_Pose${String(i).padStart(2, '0')}_Re`);
    for (const d of [
      '20251019', '20251019-2', '20251019-3', '20251020', '20251021', '20251021-2',
      '20251024', '20251024-1', '20251024-2', '20251025', '20251025-2', '20251026',
      '20251027', '20251029', '20251030',
    ]) knownPoses.push(`chiu_2025_10_${d}`);

    const results = await Promise.allSettled(
      knownPoses.map(async (name) => {
        const resp = await fetch(`/animations/poses/${name}.json`);
        if (!resp.ok) return;
        const data = await resp.json() as PoseData;
        this.poseData.set(name, data);
      })
    );
  }

  public play(action: ActionName, crossfade = 0.3): void {
    if (!this.mixer || !this.vrm) return;

    const isLoop = LOOP_ACTIONS.has(action);

    // Try clip-based animation first
    const clip = this.resolveClip(action);
    if (clip) {
      const newAction = this.mixer.clipAction(clip);
      newAction.clampWhenFinished = !isLoop;
      newAction.loop = isLoop ? THREE.LoopRepeat : THREE.LoopOnce;

      if (isLoop) {
        if (this.currentLoop) this.currentLoop.crossFadeTo(newAction, crossfade, true);
        this.currentLoop = newAction;
      } else {
        if (this.currentAction) this.currentAction.crossFadeTo(newAction, crossfade, true);
        this.currentAction = newAction;
      }

      newAction.reset().fadeIn(crossfade).play();
      this.resetHipsOffset();
      this.ensureBreathLayer();
      return;
    }

    // Try pose-based (static 1-frame)
    const pose = this.resolvePose(action);
    if (pose) {
      this.applyPoseDirectly(pose, crossfade);
      return;
    }

    // No asset — signal procedural fallback
  }

  public returnToLoop(crossfade = 0.3): void {
    if (this.currentLoop) {
      this.currentLoop.reset().fadeIn(crossfade).play();
    }
  }

  public stopAll(fadeOut = 0.3): void {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    this.currentAction = null;
    this.currentLoop = null;
    this.resetHipsOffset();
  }

  public hasClip(action: ActionName): boolean {
    return this.clips.has(action) || this.resolvePose(action) !== null;
  }

  private resolveClip(action: ActionName): THREE.AnimationClip | null {
    if (this.clips.has(action)) return this.clips.get(action)!;

    // Fallback chains
    const fallbacks: Partial<Record<ActionName, ActionName[]>> = {
      happy: ['happy'],
      nod: ['nod'],
      think: ['think'],
    };
    const chain = fallbacks[action];
    if (chain) {
      for (const fb of chain) {
        if (this.clips.has(fb)) return this.clips.get(fb)!;
      }
    }
    return null;
  }

  private resolvePose(action: ActionName): PoseData | null {
    if (action === 'sit') {
      const sits = [...this.poseData.keys()].filter(k => k.includes('Sit_'));
      if (sits.length > 0) return this.poseData.get(sits[Math.floor(Math.random() * sits.length)])!;
    }
    if (action === 'sleep') {
      const sleeps = [...this.poseData.keys()].filter(k => k.includes('Sleep_'));
      if (sleeps.length > 0) return this.poseData.get(sleeps[Math.floor(Math.random() * sleeps.length)])!;
    }
    if (action === 'afk') {
      return this.poseData.get('emote_collector_AFK') ?? null;
    }
    if (action === 'cute_pose') {
      const cute = [...this.poseData.keys()].filter(k =>
        k.includes('nizi_poses') || k.includes('chiu_2025')
      );
      if (cute.length > 0) return this.poseData.get(cute[Math.floor(Math.random() * cute.length)])!;
    }
    return null;
  }

  private applyPoseDirectly(data: PoseData, _crossfade: number): void {
    if (!this.vrm) return;

    // Stop clip actions while in static pose
    if (this.currentAction) { this.currentAction.fadeOut(0.3); this.currentAction = null; }
    if (this.currentLoop) { this.currentLoop.fadeOut(0.3); this.currentLoop = null; }

    for (const [bone, quat] of Object.entries(data.pose)) {
      const node = this.vrm.humanoid.getNormalizedBoneNode(bone as any);
      if (node && Array.isArray(quat) && quat.length === 4) {
        node.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
      }
    }

    if (data.hipsOffsetY) {
      const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');
      if (hips) hips.position.y = this.baseHipsY + data.hipsOffsetY;
    }
  }

  private resetHipsOffset(): void {
    if (!this.vrm) return;
    const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) hips.position.y = this.baseHipsY;
  }

  private ensureBreathLayer(): void {
    if (!this.mixer || !this.vrm || this._breathAction) return;

    const hipsNode = this.vrm.humanoid.getNormalizedBoneNode('hips');
    const spineNode = this.vrm.humanoid.getNormalizedBoneNode('spine');
    if (!hipsNode || !spineNode) return;

    const dur = 3.5;
    const frames = 60;
    const times = Array.from({ length: frames }, (_, i) => (i / (frames - 1)) * dur);
    const vals = times.map(t => Math.sin((t / dur) * Math.PI * 2) * 0.003);
    const yTrack = new THREE.NumberKeyframeTrack(
      `${hipsNode.name}.position[y]`, times, vals
    );

    this._idleBreathClip = new THREE.AnimationClip('__breath', dur, [yTrack]);
    this._breathAction = this.mixer.clipAction(this._idleBreathClip);
    this._breathAction.loop = THREE.LoopRepeat;
    this._breathAction.weight = 0.4;
    this._breathAction.play();
  }

  public getAssetTable(): Array<{ action: string; asset: string }> {
    const allActions: ActionName[] = [
      'idle', 'walk', 'wave', 'happy', 'excited', 'gotit', 'proud', 'present',
      'stretch', 'think', 'nod', 'shrug', 'typing', 'sit', 'sleep', 'afk', 'cute_pose',
    ];

    return allActions.map(action => {
      if (this.assetStatus.has(action)) {
        return { action, asset: this.assetStatus.get(action)! };
      }
      if (this.clips.has(action)) {
        return { action, asset: 'loaded clip' };
      }
      if (this.resolvePose(action)) {
        return { action, asset: 'JSON pose' };
      }
      return { action, asset: 'procedural fallback' };
    });
  }

  public destroy(): void {
    if (this.mixer) {
      if (this._boundOnFinished) {
        this.mixer.removeEventListener('finished', this._boundOnFinished);
      }
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.clips.clear();
    this.poseData.clear();
    this.currentAction = null;
    this.currentLoop = null;
  }
}
