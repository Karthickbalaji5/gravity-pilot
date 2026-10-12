export type CompanionTaskState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'VALIDATING'
  | 'NEEDS_INPUT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type EmotionType =
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'relaxed'
  | 'angry'
  | 'neutral'
  | 'shy';

export type VisemeType = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';

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

export type ActionTag =
  | 'wave' | 'nod' | 'think' | 'shrug' | 'happy'
  | 'excited' | 'gotit' | 'proud' | 'present';

export interface VRMDiagnostics {
  loaded: boolean;
  modelName: string;
  vrmVersion: string;
  author: string;
  expressions: string[];
  boneCount: number;
  springBoneSprings: number;
  availableBones?: string[];
  animationState?: AnimationState;
  error?: string;
  pipelineStages?: Record<string, boolean | string>;
  renderCalls?: number;
  triangles?: number;
  cameraPos?: string;
  targetPos?: string;
  headHeight?: number;
}

export interface VoiceSettings {
  language: 'en' | 'te' | 'ta' | 'auto';
  rate: number;
  pitch: number;
  muted: boolean;
  preferredVoice?: string;
}

export type CompanionWindowMode =
  | 'pet'        // Small desktop pet sitting on taskbar
  | 'companion'  // Floating transparent avatar widget
  | 'split'      // 3D Avatar on left/top, Chat & Actions on right
  | 'dashboard';  // Full Agent Dashboard with Avatar + Traces + Output Explorer
