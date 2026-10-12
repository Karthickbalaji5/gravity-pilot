import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { CompanionTaskState, EmotionType, VisemeType } from '../types/nila';

export type AnimationState =
  | 'IDLE'
  | 'GREETING'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'EXPLAINING'
  | 'WORKING'
  | 'PRESENTING'
  | 'NEEDS_INPUT'
  | 'COMPLETED'
  | 'FAILED';

export interface HumanoidBoneCache {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  upperChest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftShoulder: THREE.Object3D | null;
  rightShoulder: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
}

// Math and easing helpers
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function smoothRamp(val: number, inMin: number, inMax: number): number {
  if (inMax <= inMin) return val >= inMin ? 1 : 0;
  return smoothstep((val - inMin) / (inMax - inMin));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class VRMAnimationController {
  private vrm: VRM | null = null;
  private bones: HumanoidBoneCache = {
    hips: null,
    spine: null,
    chest: null,
    upperChest: null,
    neck: null,
    head: null,
    leftShoulder: null,
    rightShoulder: null,
    leftUpperArm: null,
    rightUpperArm: null,
    leftLowerArm: null,
    rightLowerArm: null,
    leftHand: null,
    rightHand: null,
  };

  // Target quaternions and base transforms for seamless slerp blending
  private boneTargets: Map<string, THREE.Quaternion> = new Map();
  private baseHipsY: number | null = null;
  private targetHipsY: number | null = null;

  // Active state & time-based sequence progression
  private currentState: AnimationState = 'IDLE';
  private targetState: AnimationState = 'IDLE';
  private sequenceTime = 0;
  private gestureDuration = 0;
  private isOneShotGesture = false;

  // Speaking / Conversational rhythm
  private isSpeaking = false;
  private speechPhase = 0;

  // Emotions & Expressions
  private currentEmotion: EmotionType = 'relaxed';
  private targetEmotion: EmotionType = 'relaxed';
  private emotionBlend = 0;

  // Blinking
  private blinkTimer = 0;
  private nextBlinkInterval = 3.2;
  private isBlinking = false;
  private blinkProgress = 0;
  private isDoubleBlink = false;

  // Lip-sync
  private currentViseme: VisemeType = 'aa';
  private mouthValue = 0;
  private manualSpeechPulse = 0;
  private audioAnalyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;

  // Mouse Gaze (clamped head/eye look)
  private gazeOffset = { x: 0, y: 0 };

  // Temporary math objects to prevent GC allocations inside requestAnimationFrame
  private tempEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private tempQuat = new THREE.Quaternion();

  constructor() {}

  /**
   * Bind loaded VRM instance and cache normalized humanoid bone nodes
   */
  public bindVRM(vrm: VRM): void {
    this.vrm = vrm;
    const h = vrm.humanoid;
    if (!h) return;

    this.bones = {
      hips: h.getNormalizedBoneNode('hips'),
      spine: h.getNormalizedBoneNode('spine'),
      chest: h.getNormalizedBoneNode('chest'),
      upperChest: h.getNormalizedBoneNode('upperChest'),
      neck: h.getNormalizedBoneNode('neck'),
      head: h.getNormalizedBoneNode('head'),
      leftShoulder: h.getNormalizedBoneNode('leftShoulder'),
      rightShoulder: h.getNormalizedBoneNode('rightShoulder'),
      leftUpperArm: h.getNormalizedBoneNode('leftUpperArm'),
      rightUpperArm: h.getNormalizedBoneNode('rightUpperArm'),
      leftLowerArm: h.getNormalizedBoneNode('leftLowerArm'),
      rightLowerArm: h.getNormalizedBoneNode('rightLowerArm'),
      leftHand: h.getNormalizedBoneNode('leftHand'),
      rightHand: h.getNormalizedBoneNode('rightHand'),
    };

    if (this.bones.hips) {
      this.baseHipsY = this.bones.hips.position.y;
      this.targetHipsY = this.bones.hips.position.y;
    }

    // Initialize quaternion target map
    Object.keys(this.bones).forEach((boneName) => {
      this.boneTargets.set(boneName, new THREE.Quaternion());
    });

    this.setAnimationState('IDLE');
  }

  public getAvailableBones(): string[] {
    return Object.entries(this.bones)
      .filter(([_, node]) => node !== null)
      .map(([name]) => name);
  }

  public getCurrentState(): AnimationState {
    return this.currentState;
  }

  public getSequenceTime(): number {
    return this.sequenceTime;
  }

  public isGestureActive(): boolean {
    return this.isOneShotGesture && this.sequenceTime < this.gestureDuration;
  }

  /**
   * Trigger a gesture sequence by state name (with optional one-shot duration in seconds)
   */
  public playGesture(state: AnimationState, duration?: number): void {
    this.currentState = state;
    this.targetState = state;
    this.sequenceTime = 0; // Reset sequence timer to initiate smooth transition into phase 1

    if (duration !== undefined && duration > 0) {
      this.isOneShotGesture = true;
      this.gestureDuration = duration;
    } else {
      // Natural tuned durations for each gesture sequence
      switch (state) {
        case 'GREETING':
          this.isOneShotGesture = true;
          this.gestureDuration = 3.6;
          break;
        case 'EXPLAINING':
          this.isOneShotGesture = true;
          this.gestureDuration = 4.2;
          break;
        case 'PRESENTING':
          this.isOneShotGesture = true;
          this.gestureDuration = 3.8;
          break;
        case 'COMPLETED':
          this.isOneShotGesture = true;
          this.gestureDuration = 3.8;
          break;
        case 'THINKING':
          this.isOneShotGesture = true;
          this.gestureDuration = 4.2;
          break;
        case 'NEEDS_INPUT':
          this.isOneShotGesture = true;
          this.gestureDuration = 4.0;
          break;
        case 'WORKING':
          this.isOneShotGesture = true;
          this.gestureDuration = 4.5;
          break;
        default:
          this.isOneShotGesture = false;
          this.gestureDuration = 0;
          break;
      }
    }

    // Synchronize appropriate facial emotion
    switch (state) {
      case 'GREETING':
      case 'COMPLETED':
        this.setEmotion('happy');
        break;
      case 'THINKING':
        this.setEmotion('neutral');
        break;
      case 'NEEDS_INPUT':
        this.setEmotion('surprised');
        break;
      case 'FAILED':
        this.setEmotion('sad');
        break;
      case 'WORKING':
        this.setEmotion('neutral');
        break;
      case 'SPEAKING':
      case 'EXPLAINING':
      case 'LISTENING':
      case 'IDLE':
      default:
        this.setEmotion('relaxed');
        break;
    }
  }

  /**
   * Synchronize Task State with Animation Controller
   */
  public setTaskState(taskState: CompanionTaskState): void {
    switch (taskState) {
      case 'IDLE':
        this.setAnimationState('IDLE');
        break;
      case 'LISTENING':
        this.setAnimationState('LISTENING');
        break;
      case 'THINKING':
        this.setAnimationState('THINKING');
        break;
      case 'EXECUTING':
      case 'VALIDATING':
        this.setAnimationState('WORKING');
        break;
      case 'NEEDS_INPUT':
        this.setAnimationState('NEEDS_INPUT');
        break;
      case 'COMPLETED':
        this.playGesture('COMPLETED');
        break;
      case 'FAILED':
        this.setAnimationState('FAILED');
        break;
      case 'CANCELLED':
        this.setAnimationState('IDLE');
        break;
    }
  }

  /**
   * Set continuous animation state (loops gracefully without restarting every frame)
   */
  public setAnimationState(state: AnimationState): void {
    if (this.currentState === state && !this.isOneShotGesture) {
      return; // Avoid repeatedly restarting the active continuous sequence
    }

    this.currentState = state;
    this.targetState = state;
    this.isOneShotGesture = false;
    this.sequenceTime = 0;

    switch (state) {
      case 'IDLE':
        this.setEmotion('relaxed');
        break;
      case 'LISTENING':
        this.setEmotion('relaxed');
        break;
      case 'THINKING':
        this.setEmotion('neutral');
        break;
      case 'WORKING':
        this.setEmotion('neutral');
        break;
      case 'SPEAKING':
      case 'EXPLAINING':
        this.setEmotion('relaxed');
        break;
      case 'NEEDS_INPUT':
        this.setEmotion('surprised');
        break;
      case 'COMPLETED':
        this.setEmotion('happy');
        break;
      case 'FAILED':
        this.setEmotion('sad');
        break;
    }
  }

  public setSpeaking(speaking: boolean): void {
    this.isSpeaking = speaking;
    if (speaking && (this.currentState === 'IDLE' || this.currentState === 'LISTENING')) {
      this.currentState = 'SPEAKING';
      this.sequenceTime = 0;
    } else if (!speaking && this.currentState === 'SPEAKING') {
      this.currentState = 'IDLE';
      this.sequenceTime = 0;
    }
  }

  public setEmotion(emotion: EmotionType): void {
    if (this.targetEmotion !== emotion) {
      this.targetEmotion = emotion;
      this.emotionBlend = 0;
    }
  }

  public setGazeOffset(x: number, y: number): void {
    this.gazeOffset.x = clamp(x, -1, 1);
    this.gazeOffset.y = clamp(y, -1, 1);
  }

  public setAudioAnalyser(analyser: AnalyserNode | null): void {
    this.audioAnalyser = analyser;
    if (analyser) {
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
    } else {
      this.freqData = null;
      this.mouthValue = 0;
    }
  }

  public pulseMouth(intensity: number = 0.8, vowel: VisemeType = 'aa'): void {
    this.manualSpeechPulse = Math.min(1.0, intensity);
    this.currentViseme = vowel;
  }

  /**
   * Helper to set target quaternion for a bone from Euler angles (in radians)
   */
  private setTargetEuler(boneName: keyof HumanoidBoneCache, x: number, y: number, z: number): void {
    const q = this.boneTargets.get(boneName);
    if (q) {
      this.tempEuler.set(x, y, z, 'YXZ');
      q.setFromEuler(this.tempEuler);
    }
  }

  /**
   * Main update loop called every animation frame with frame delta time
   */
  public update(delta: number, time: number): void {
    if (!this.vrm) return;

    // Advance sequence time
    this.sequenceTime += delta;

    // Advance speech phase
    if (this.isSpeaking) {
      this.speechPhase += delta * 3.5;
    }

    // 1. One-shot gesture timer and automatic return to idle
    if (this.isOneShotGesture) {
      if (this.sequenceTime >= this.gestureDuration) {
        this.isOneShotGesture = false;
        this.currentState = 'IDLE';
        this.targetState = 'IDLE';
        this.sequenceTime = 0;
        this.setEmotion('relaxed');
      }
    }

    // 2. Layered Pose Generation
    this.computeLayeredBones(delta, time);

    // 3. Smooth exponential quaternion slerp dampening on bones
    this.applyBoneRotations(delta);

    // 4. Update facial expressions and natural blinking
    this.updateExpressions(delta);

    // 5. Update speech lip-sync
    this.updateLipSync(delta, time);
  }

  /**
   * Multi-Layer Pose Computation:
   * 1. Base VRM Rest Pose (arms resting at sides, elbows soft)
   * 2. Idle Body Movement (breathing, weight shifts, organic micro-sway)
   * 3. Time-Based Gesture Sequences (entry ramp -> expressive action -> exit ramp)
   * 4. Gaze and Head Tracking Offsets (clamped mouse tracking layered on top)
   */
  private computeLayeredBones(delta: number, time: number): void {
    const tSeq = this.sequenceTime;

    // ==========================================
    // LAYER 1 & 2: BASE REST POSE + IDLE MOTIONS
    // ==========================================
    const breathRate = Math.sin(time * 1.8);
    const breathPos = Math.sin(time * 1.8) * 0.5 + 0.5;
    const sway = Math.sin(time * 0.6);
    const microSway = Math.cos(time * 0.95);

    // Hips vertical displacement and weight shift
    let hipsY = this.baseHipsY !== null ? this.baseHipsY + breathPos * 0.003 : 0;
    let hipsRoll = sway * 0.015;
    let hipsYaw = sway * 0.018;

    // Spine and Chest: Breathing expansion and counter-balance to hip sway
    let spinePitch = breathRate * 0.018;
    let spineYaw = sway * 0.01;
    let spineRoll = -sway * 0.012; // Counter-balances hip sway so upper torso stays upright

    let chestPitch = breathRate * 0.016;
    let chestRoll = 0;
    let chestYaw = 0;

    // Head and Neck natural micro-adjustments
    let headPitch = microSway * 0.012;
    let headYaw = sway * 0.018;
    let headRoll = microSway * 0.01;

    let neckPitch = 0;
    let neckYaw = 0;
    let neckRoll = 0;

    // Base relaxed resting arms (arms down at sides, elbows naturally bent inward)
    let leftUpperArmX = 0.06;
    let leftUpperArmY = 0.0;
    let leftUpperArmZ = -1.22 + breathRate * 0.012;

    let rightUpperArmX = 0.06;
    let rightUpperArmY = 0.0;
    let rightUpperArmZ = 1.22 - breathRate * 0.012;

    let leftLowerArmX = 0.0;
    let leftLowerArmY = -0.28;
    let leftLowerArmZ = 0.12;

    let rightLowerArmX = 0.0;
    let rightLowerArmY = 0.28;
    let rightLowerArmZ = -0.12;

    let leftHandX = 0.0;
    let leftHandY = 0.0;
    let leftHandZ = -0.08;

    let rightHandX = 0.0;
    let rightHandY = 0.0;
    let rightHandZ = 0.08;

    // ========================================================
    // LAYER 3: TIME-BASED GESTURE SEQUENCES
    // ========================================================
    switch (this.currentState) {
      // ----------------------------------------------------------------------
      // 1. WAVE (GREETING): Raise arm -> 3 wave cycles side-to-side -> lower arm
      // ----------------------------------------------------------------------
      case 'GREETING': {
        const tRaise = 0.7;
        const tWaveEnd = 2.8;
        const tTotal = 3.6;

        // Entry: Raise arm smoothly
        const enterProgress = smoothRamp(tSeq, 0.0, tRaise);
        // Exit: Lower arm smoothly back to resting pose
        const exitProgress = smoothRamp(tSeq, tWaveEnd, tTotal);
        // Active gesture envelope [0 -> 1 -> 0]
        const gestureWeight = enterProgress * (1.0 - exitProgress);

        // Friendly head tilt with smile
        headRoll += 0.09 * gestureWeight;
        headPitch += -0.04 * gestureWeight;
        headYaw += -0.05 * gestureWeight;

        // Arm raised high target
        const raisedUpperZ = -0.60;
        const raisedUpperX = 0.35;
        const raisedUpperY = -0.20;

        const raisedLowerZ = -1.25;
        const raisedLowerY = 0.65;
        const raisedLowerX = 0.10;

        // Waving oscillation during active phase (approx 2.5 gentle friendly waves)
        const waveOsc = Math.sin((tSeq - tRaise) * 7.5);
        const activeWaveFactor = smoothRamp(tSeq, tRaise, tRaise + 0.2) * (1.0 - exitProgress);

        const targetHandZ = 0.08 + activeWaveFactor * (waveOsc * 0.30);
        const targetHandX = 0.15 * gestureWeight;
        const targetLowerZ = raisedLowerZ + activeWaveFactor * (waveOsc * 0.12);

        // Blend raised pose on top of base resting pose using envelope
        rightUpperArmZ = lerp(rightUpperArmZ, raisedUpperZ, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, raisedUpperX, gestureWeight);
        rightUpperArmY = lerp(rightUpperArmY, raisedUpperY, gestureWeight);

        rightLowerArmZ = lerp(rightLowerArmZ, targetLowerZ, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, raisedLowerY, gestureWeight);
        rightLowerArmX = lerp(rightLowerArmX, raisedLowerX, gestureWeight);

        rightHandZ = lerp(rightHandZ, targetHandZ, gestureWeight);
        rightHandX = lerp(rightHandX, targetHandX, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 2. EXPLAIN: Lift arm -> open palm -> 2-3 conversational pulses -> return
      // ----------------------------------------------------------------------
      case 'EXPLAINING': {
        const tRaise = 0.8;
        const tPulseEnd = 3.2;
        const tTotal = 4.2;

        const enterProgress = smoothRamp(tSeq, 0.0, tRaise);
        const exitProgress = smoothRamp(tSeq, tPulseEnd, tTotal);
        const gestureWeight = enterProgress * (1.0 - exitProgress);

        // Conversational head nods
        headPitch += (-0.02 + Math.sin(tSeq * 3.0) * 0.02) * gestureWeight;
        headYaw += 0.06 * gestureWeight;

        // Base explaining pose: right arm open outward with palm facing up
        const explainUpperZ = 0.70;
        const explainUpperX = 0.60;
        const explainUpperY = -0.32;

        const explainLowerZ = -0.65;
        const explainLowerY = 0.75; // open palm rotation

        // Two gentle conversational pulses at ~1.4s and ~2.4s
        const pulse = Math.sin((tSeq - tRaise) * 2.8) * 0.08 * (1.0 - exitProgress);

        rightUpperArmZ = lerp(rightUpperArmZ, explainUpperZ - pulse * 0.5, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, explainUpperX + pulse, gestureWeight);
        rightUpperArmY = lerp(rightUpperArmY, explainUpperY, gestureWeight);

        rightLowerArmZ = lerp(rightLowerArmZ, explainLowerZ + pulse, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, explainLowerY, gestureWeight);

        rightHandX = lerp(rightHandX, -0.22, gestureWeight);
        rightHandZ = lerp(rightHandZ, 0.15 + pulse * 0.5, gestureWeight);

        // Left arm soft conversational accompaniment
        leftUpperArmZ = lerp(leftUpperArmZ, -1.06, gestureWeight);
        leftUpperArmX = lerp(leftUpperArmX, 0.22, gestureWeight);
        leftLowerArmY = lerp(leftLowerArmY, -0.42, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 3. POINT (PRESENTING): Extend toward target -> hold & settle -> retract
      // ----------------------------------------------------------------------
      case 'PRESENTING': {
        const tExtend = 0.8;
        const tHoldEnd = 2.8;
        const tTotal = 3.8;

        const enterProgress = smoothRamp(tSeq, 0.0, tExtend);
        const exitProgress = smoothRamp(tSeq, tHoldEnd, tTotal);
        const gestureWeight = enterProgress * (1.0 - exitProgress);

        // Head turns towards the presentation card/target on the right
        headYaw += -0.18 * gestureWeight;
        headPitch += -0.03 * gestureWeight;

        // Right arm extended forward-right toward UI target
        const pointUpperZ = 0.30;
        const pointUpperX = 0.48;
        const pointUpperY = -0.44;

        // Forearm extended with natural elbow bend (never locked straight)
        const pointLowerZ = -0.36;
        const pointLowerY = 0.62;

        // Presentation emphasis hold with small settling breath
        const settle = Math.sin((tSeq - tExtend) * 1.5) * 0.02 * (1.0 - exitProgress);

        rightUpperArmZ = lerp(rightUpperArmZ, pointUpperZ, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, pointUpperX + settle, gestureWeight);
        rightUpperArmY = lerp(rightUpperArmY, pointUpperY, gestureWeight);

        rightLowerArmZ = lerp(rightLowerArmZ, pointLowerZ + settle, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, pointLowerY, gestureWeight);

        rightHandX = lerp(rightHandX, 0.20, gestureWeight);
        rightHandZ = lerp(rightHandZ, 0.05, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 4. THINK: Tilt head -> move hand toward chin -> hold -> return
      // ----------------------------------------------------------------------
      case 'THINKING': {
        // Can be one-shot or loopable during planning
        const tIn = 0.9;
        const tOutStart = this.isOneShotGesture ? Math.max(tIn, this.gestureDuration - 0.9) : 999999;
        const tTotal = this.isOneShotGesture ? this.gestureDuration : 999999;

        const enterProgress = smoothRamp(tSeq, 0.0, tIn);
        const exitProgress = smoothRamp(tSeq, tOutStart, tTotal);
        const gestureWeight = enterProgress * (1.0 - exitProgress);

        // Pondering head tilt
        headRoll += (0.15 + Math.sin(tSeq * 1.2) * 0.015) * gestureWeight;
        headPitch += -0.06 * gestureWeight;
        headYaw += 0.08 * gestureWeight;

        // Hand touches near chin/cheek
        const thinkUpperZ = 0.65;
        const thinkUpperX = 0.75;
        const thinkUpperY = -0.38;

        const thinkLowerZ = -1.45;
        const thinkLowerY = 0.84;

        rightUpperArmZ = lerp(rightUpperArmZ, thinkUpperZ, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, thinkUpperX, gestureWeight);
        rightUpperArmY = lerp(rightUpperArmY, thinkUpperY, gestureWeight);

        rightLowerArmZ = lerp(rightLowerArmZ, thinkLowerZ, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, thinkLowerY, gestureWeight);

        rightHandZ = lerp(rightHandZ, 0.25, gestureWeight);
        rightHandX = lerp(rightHandX, 0.32, gestureWeight);

        // Left arm soft waist support
        leftUpperArmZ = lerp(leftUpperArmZ, -1.05, gestureWeight);
        leftUpperArmX = lerp(leftUpperArmX, 0.28, gestureWeight);
        leftLowerArmY = lerp(leftLowerArmY, -0.72, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 5. WORK: Subtle alternating movements with natural pauses (no crazy air-typing)
      // ----------------------------------------------------------------------
      case 'WORKING': {
        const enterProgress = smoothRamp(tSeq, 0.0, 0.8);
        const gestureWeight = enterProgress;

        // Head looking down at task
        headPitch += 0.08 * gestureWeight;
        neckPitch += 0.04 * gestureWeight;

        // Natural cadence cycle of 4.5 seconds:
        // 0.0s - 2.2s: Purposeful small wrist and forearm micro-adjustments
        // 2.2s - 4.5s: Thoughtful pause, inspecting task execution
        const cycle = tSeq % 4.5;
        const isActionPhase = cycle < 2.2;
        const actionFactor = isActionPhase
          ? Math.sin((cycle / 2.2) * Math.PI) // smooth bell curve for action
          : 0.0;

        const leftMicro = actionFactor * Math.sin(tSeq * 4.2) * 0.05;
        const rightMicro = actionFactor * Math.cos(tSeq * 4.2) * 0.05;

        // Working posture (hands in front of chest)
        const workUpperZ = 0.90;
        const workUpperX = 0.48;

        leftUpperArmZ = lerp(leftUpperArmZ, -workUpperZ, gestureWeight);
        leftUpperArmX = lerp(leftUpperArmX, workUpperX, gestureWeight);
        leftUpperArmY = lerp(leftUpperArmY, 0.15, gestureWeight);

        rightUpperArmZ = lerp(rightUpperArmZ, workUpperZ, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, workUpperX, gestureWeight);
        rightUpperArmY = lerp(rightUpperArmY, -0.15, gestureWeight);

        leftLowerArmZ = lerp(leftLowerArmZ, 0.68 + leftMicro, gestureWeight);
        leftLowerArmY = lerp(leftLowerArmY, -0.72, gestureWeight);

        rightLowerArmZ = lerp(rightLowerArmZ, -0.68 + rightMicro, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, 0.72, gestureWeight);

        leftHandX = lerp(leftHandX, leftMicro, gestureWeight);
        rightHandX = lerp(rightHandX, rightMicro, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 6. CELEBRATE (COMPLETED): Raise both arms -> body bounce -> settle to idle
      // ----------------------------------------------------------------------
      case 'COMPLETED': {
        const tRaise = 0.7;
        const tBounceEnd = 2.7;
        const tTotal = 3.8;

        const enterProgress = smoothRamp(tSeq, 0.0, tRaise);
        const exitProgress = smoothRamp(tSeq, tBounceEnd, tTotal);
        const gestureWeight = enterProgress * (1.0 - exitProgress);

        // Cheerful bounce during apex
        const bounceFactor = smoothRamp(tSeq, tRaise, tRaise + 0.2) * (1.0 - exitProgress);
        const bounceOsc = Math.abs(Math.sin((tSeq - tRaise) * 5.5));
        if (this.baseHipsY !== null) {
          hipsY += bounceFactor * bounceOsc * 0.012; // Small joyful body bounce
        }

        // Cheerful head nod & smile
        headPitch += (-0.05 + bounceOsc * 0.02) * gestureWeight;
        headRoll += Math.sin((tSeq - tRaise) * 4.5) * 0.04 * bounceFactor;
        chestPitch += 0.03 * gestureWeight; // Proud, happy chest lift

        // Both arms raised joyfully
        const cheerWaveR = Math.sin((tSeq - tRaise) * 7.5) * 0.18 * bounceFactor;
        const cheerWaveL = -Math.sin((tSeq - tRaise) * 7.5) * 0.18 * bounceFactor;

        rightUpperArmZ = lerp(rightUpperArmZ, -0.70, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, 0.35, gestureWeight);
        rightUpperArmY = lerp(rightUpperArmY, -0.20, gestureWeight);
        rightLowerArmZ = lerp(rightLowerArmZ, -1.15, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, 0.60, gestureWeight);
        rightHandZ = lerp(rightHandZ, cheerWaveR, gestureWeight);

        leftUpperArmZ = lerp(leftUpperArmZ, 0.70, gestureWeight);
        leftUpperArmX = lerp(leftUpperArmX, 0.35, gestureWeight);
        leftUpperArmY = lerp(leftUpperArmY, 0.20, gestureWeight);
        leftLowerArmZ = lerp(leftLowerArmZ, 1.15, gestureWeight);
        leftLowerArmY = lerp(leftLowerArmY, -0.60, gestureWeight);
        leftHandZ = lerp(leftHandZ, cheerWaveL, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 7. QUESTION (NEEDS_INPUT): Head tilt -> gentle open-hand asking -> return
      // ----------------------------------------------------------------------
      case 'NEEDS_INPUT': {
        const tIn = 0.8;
        const tOutStart = this.isOneShotGesture ? Math.max(tIn, this.gestureDuration - 0.9) : 999999;
        const tTotal = this.isOneShotGesture ? this.gestureDuration : 999999;

        const enterProgress = smoothRamp(tSeq, 0.0, tIn);
        const exitProgress = smoothRamp(tSeq, tOutStart, tTotal);
        const gestureWeight = enterProgress * (1.0 - exitProgress);

        // Inquisitive head tilt
        headRoll += (0.16 + Math.sin(tSeq * 1.5) * 0.015) * gestureWeight;
        headPitch += 0.04 * gestureWeight;
        headYaw += -0.06 * gestureWeight;

        // Gentle open-hand asking gesture (both hands slightly open forward)
        leftUpperArmZ = lerp(leftUpperArmZ, -0.96, gestureWeight);
        leftUpperArmX = lerp(leftUpperArmX, 0.38, gestureWeight);
        leftUpperArmY = lerp(leftUpperArmY, -0.18, gestureWeight);

        rightUpperArmZ = lerp(rightUpperArmZ, 0.96, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, 0.38, gestureWeight);
        rightUpperArmY = lerp(rightUpperArmY, 0.18, gestureWeight);

        leftLowerArmZ = lerp(leftLowerArmZ, 0.52, gestureWeight);
        leftLowerArmY = lerp(leftLowerArmY, -0.58, gestureWeight);

        rightLowerArmZ = lerp(rightLowerArmZ, -0.52, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, 0.58, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 8. FAILED: Restrained concerned / apologetic posture
      // ----------------------------------------------------------------------
      case 'FAILED': {
        const enterProgress = smoothRamp(tSeq, 0.0, 0.8);
        const gestureWeight = enterProgress;

        headPitch += 0.14 * gestureWeight;
        neckPitch += 0.05 * gestureWeight;
        chestPitch += -0.02 * gestureWeight;

        leftUpperArmZ = lerp(leftUpperArmZ, -1.25, gestureWeight);
        leftUpperArmX = lerp(leftUpperArmX, 0.04, gestureWeight);
        rightUpperArmZ = lerp(rightUpperArmZ, 1.25, gestureWeight);
        rightUpperArmX = lerp(rightUpperArmX, 0.04, gestureWeight);

        leftLowerArmY = lerp(leftLowerArmY, -0.55, gestureWeight);
        rightLowerArmY = lerp(rightLowerArmY, 0.55, gestureWeight);
        break;
      }

      // ----------------------------------------------------------------------
      // 9. SPEAKING: Conversational hand accents alternating with speech rhythm
      // ----------------------------------------------------------------------
      case 'SPEAKING': {
        const speakCycle = Math.sin(this.speechPhase);
        const speakAlt = Math.cos(this.speechPhase * 0.7);

        // Conversational head nods
        headPitch += Math.sin(this.speechPhase * 1.4) * 0.035;

        // Right hand conversational accent
        const rightAccent = Math.max(0, speakCycle);
        rightUpperArmZ = lerp(rightUpperArmZ, 0.85 - rightAccent * 0.20, 0.85);
        rightUpperArmX = lerp(rightUpperArmX, 0.35 + rightAccent * 0.16, 0.85);
        rightLowerArmY = lerp(rightLowerArmY, 0.55 + speakCycle * 0.16, 0.85);
        rightLowerArmZ = lerp(rightLowerArmZ, -0.45 - rightAccent * 0.16, 0.85);
        rightHandZ = lerp(rightHandZ, 0.15 + speakCycle * 0.10, 0.85);

        // Left hand conversational balance
        const leftAccent = Math.max(0, -speakCycle);
        leftUpperArmZ = lerp(leftUpperArmZ, -1.05 + leftAccent * 0.14, 0.85);
        leftUpperArmX = lerp(leftUpperArmX, 0.20 + leftAccent * 0.10, 0.85);
        leftLowerArmY = lerp(leftLowerArmY, -0.45 - speakAlt * 0.10, 0.85);
        break;
      }

      // ----------------------------------------------------------------------
      // 10. LISTENING: Attentive forward posture
      // ----------------------------------------------------------------------
      case 'LISTENING': {
        const enterProgress = smoothRamp(tSeq, 0.0, 0.6);
        headPitch += 0.06 * enterProgress;
        neckPitch += 0.03 * enterProgress;
        break;
      }

      case 'IDLE':
      default:
        break;
    }

    // ========================================================
    // LAYER 4: GAZE AND HEAD TRACKING OFFSETS
    // ========================================================
    const gazeYaw = this.gazeOffset.x * 0.22;
    const gazePitch = -this.gazeOffset.y * 0.16;

    // Head takes 65% of gaze, neck takes 35% of gaze
    headYaw += gazeYaw * 0.65;
    headPitch += gazePitch * 0.65;
    neckYaw += gazeYaw * 0.35;
    neckPitch += gazePitch * 0.35;

    // Apply hips vertical displacement
    const hipsNode = this.bones.hips;
    if (hipsNode && this.baseHipsY !== null) {
      hipsNode.position.y += (hipsY - hipsNode.position.y) * Math.min(1.0, delta * 8.0);
    }

    // Assign final target Eulers to all humanoid bones
    this.setTargetEuler('hips', 0, hipsYaw, hipsRoll);
    this.setTargetEuler('spine', spinePitch, spineYaw, spineRoll);
    this.setTargetEuler('chest', chestPitch, chestYaw, chestRoll);
    this.setTargetEuler('head', headPitch, headYaw, headRoll);
    this.setTargetEuler('neck', neckPitch, neckYaw, neckRoll);

    this.setTargetEuler('leftUpperArm', leftUpperArmX, leftUpperArmY, leftUpperArmZ);
    this.setTargetEuler('leftLowerArm', leftLowerArmX, leftLowerArmY, leftLowerArmZ);
    this.setTargetEuler('leftHand', leftHandX, leftHandY, leftHandZ);

    this.setTargetEuler('rightUpperArm', rightUpperArmX, rightUpperArmY, rightUpperArmZ);
    this.setTargetEuler('rightLowerArm', rightLowerArmX, rightLowerArmY, rightLowerArmZ);
    this.setTargetEuler('rightHand', rightHandX, rightHandY, rightHandZ);
  }

  /**
   * Apply smooth slerp rotation from current quaternion to target quaternion for each bone
   * Frame-rate independent exponential dampening guarantees zero snapping or jitter.
   */
  private applyBoneRotations(delta: number): void {
    const blendFactor = 1.0 - Math.exp(-12.0 * delta);

    (Object.keys(this.bones) as (keyof HumanoidBoneCache)[]).forEach((boneName) => {
      const bone = this.bones[boneName];
      const targetQuat = this.boneTargets.get(boneName);
      if (bone && targetQuat) {
        bone.quaternion.slerp(targetQuat, blendFactor);
      }
    });
  }

  /**
   * Update VRM 1.0 facial expressions and natural blinking
   */
  private updateExpressions(delta: number): void {
    const em = this.vrm?.expressionManager;
    if (!em) return;

    // 1. Natural Blinking
    this.blinkTimer += delta;
    if (!this.isBlinking && this.blinkTimer >= this.nextBlinkInterval) {
      this.isBlinking = true;
      this.blinkProgress = 0;
      this.blinkTimer = 0;
      this.isDoubleBlink = Math.random() < 0.18;
      this.nextBlinkInterval = 2.5 + Math.random() * 3.2;
    }

    if (this.isBlinking) {
      const blinkSpeed = this.isDoubleBlink ? 9.5 : 7.5;
      this.blinkProgress += delta * blinkSpeed;
      if (this.blinkProgress < Math.PI) {
        const blinkVal = Math.sin(this.blinkProgress);
        // Attenuate blinking during smiling to avoid eye-squint distortion
        const smileDamp = this.currentEmotion === 'happy' ? 0.35 : 1.0;
        em.setValue('blink', blinkVal * smileDamp);
      } else {
        this.isBlinking = false;
        em.setValue('blink', 0);
      }
    }

    // 2. Emotion Blending
    const supported: EmotionType[] = ['happy', 'relaxed', 'neutral', 'surprised', 'sad', 'angry'];
    if (this.currentEmotion !== this.targetEmotion) {
      this.emotionBlend += delta * 3.5;
      if (this.emotionBlend >= 1.0) {
        this.emotionBlend = 1.0;
        this.currentEmotion = this.targetEmotion;
      }
      supported.forEach((e) => {
        if (e === this.targetEmotion) {
          em.setValue(e, this.emotionBlend);
        } else if (e === this.currentEmotion) {
          em.setValue(e, 1.0 - this.emotionBlend);
        } else {
          em.setValue(e, 0);
        }
      });
    } else {
      supported.forEach((e) => {
        em.setValue(e, e === this.currentEmotion ? 1.0 : 0);
      });
    }
  }

  /**
   * Update audio-driven vowel lip sync or TTS boundary fallback
   */
  private updateLipSync(delta: number, time: number): void {
    const em = this.vrm?.expressionManager;
    if (!em) return;

    const vowels: VisemeType[] = ['aa', 'ih', 'ou', 'ee', 'oh'];

    if (this.audioAnalyser && this.freqData) {
      this.audioAnalyser.getByteFrequencyData(this.freqData as any);
      let sum = 0;
      for (let i = 0; i < this.freqData.length; i++) {
        sum += this.freqData[i];
      }
      const avg = sum / this.freqData.length;
      const targetMouth = Math.min(1.0, Math.max(0, (avg - 10) / 70));

      if (targetMouth > this.mouthValue) {
        this.mouthValue += (targetMouth - this.mouthValue) * Math.min(1.0, delta * 30);
      } else {
        this.mouthValue += (targetMouth - this.mouthValue) * Math.min(1.0, delta * 12);
      }

      // Frequency formant bands
      const lowBand = this.freqData.slice(2, 8).reduce((a, b) => a + b, 0) / 6;
      const midBand = this.freqData.slice(8, 24).reduce((a, b) => a + b, 0) / 16;
      const highBand = this.freqData.slice(24, 50).reduce((a, b) => a + b, 0) / 26;

      if (midBand >= lowBand && midBand >= highBand) {
        this.currentViseme = 'aa';
      } else if (lowBand > midBand && lowBand > highBand) {
        this.currentViseme = 'oh';
      } else if (highBand > lowBand) {
        this.currentViseme = highBand > midBand * 1.2 ? 'ee' : 'ih';
      }

      vowels.forEach((v) => {
        em.setValue(v, v === this.currentViseme ? this.mouthValue : 0);
      });
    } else if (this.isSpeaking) {
      // Speech synthesis speaking animation fallback
      const mouthCycle = Math.abs(Math.sin(time * 12.0)) * 0.75 + this.manualSpeechPulse * 0.3;
      this.mouthValue += (mouthCycle - this.mouthValue) * Math.min(1.0, delta * 18);
      this.manualSpeechPulse = Math.max(0, this.manualSpeechPulse - delta * 4.0);

      const activeVowel = vowels[Math.floor((time * 4.0) % vowels.length)];
      vowels.forEach((v) => {
        em.setValue(v, v === activeVowel ? this.mouthValue : 0);
      });
    } else if (this.mouthValue > 0.001) {
      this.mouthValue += (0 - this.mouthValue) * Math.min(1.0, delta * 14);
      em.setValue(this.currentViseme, this.mouthValue);
    } else {
      this.mouthValue = 0;
      vowels.forEach((v) => em.setValue(v, 0));
    }
  }
}
